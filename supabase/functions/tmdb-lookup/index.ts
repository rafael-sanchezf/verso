/**
 * The search-miss lookup (VER-158): a film somebody searched for that the
 * nightly mirror does not hold, fetched from TMDB and written into the
 * mirror's tables so the search finds it. The flow is in lookup.ts.
 *
 *   POST { "query": "fight club" }            with the user's JWT
 *   POST { "tmdbId": 550 }                     likewise, when the id is known
 *     -> 200 { mediaItemId: string | null, tmdbId: number | null }
 *     -> 429 { error: "rate_limited", limit, used, retryAfterSeconds }
 *
 * `mediaItemId` is null when TMDB has no match, or none the mirror's keep rule
 * would carry (adult, no poster, no title, neither voted on nor recent).
 *
 * Deploy (Rafa runs both; docs/process/hosted-setup.md):
 *
 *   supabase secrets set TMDB_API_READ_ACCESS_TOKEN=...
 *   supabase functions deploy tmdb-lookup
 *
 * **The platform's JWT gate stays on** (no `[functions.tmdb-lookup]` block in
 * supabase/config.toml), and `auth.getUser()` narrows it to a live user
 * session, as `suggest` does: the gate alone would also admit the anon key.
 *
 * **Two connections, each for what it is allowed.** The meter runs as the
 * caller: the anon key plus the request's own Authorization header, so the
 * `events` count and insert see and write only the caller's rows under Row
 * Level Security. The catalog write cannot run as the caller, because the
 * mirror's tables are written only by the service side
 * (film-tv-catalog.md, "What stays the same"), and it cannot go through
 * PostgREST either without losing what makes it the mirror's write: one
 * transaction, the `||` merges, the identity looked up through
 * `movie_details.tmdb_id`. So it goes straight to Postgres on the platform's
 * `SUPABASE_DB_URL`, with `pg`, the driver the nightly `tmdb-sync` uses, and
 * sends packages/catalog's own statements.
 *
 * Environment:
 *
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DB_URL   provided by the platform
 *   TMDB_API_READ_ACCESS_TOKEN   a function secret, the name .env.example uses;
 *                                never in the app, never logged, never returned
 *   TMDB_LOOKUP_PER_MINUTE       optional, default 5; 0 turns lookups off
 *
 * This file stays thin on purpose: it holds the two `npm:` imports, and
 * lookup.test.ts never loads it.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import pg from 'npm:pg@8.23.0';
import type { SqlClient } from '../../../packages/catalog/src/tmdb-write.ts';
import {
  LOOKUP_EVENT,
  type LookupDb,
  lookup,
  parseLookupRequest,
  readPerMinute,
  storeMovie,
  TmdbLookupError,
} from './lookup.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  const token = Deno.env.get('TMDB_API_READ_ACCESS_TOKEN')?.trim();
  if (!url || !anonKey || !dbUrl || !token) {
    return json(
      { error: 'SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DB_URL and TMDB_API_READ_ACCESS_TOKEN must be set' },
      500,
    );
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  if (!jwt) return json({ error: 'not signed in' }, 401);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) return json({ error: 'not signed in' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'the body must be JSON' }, 400);
  }
  const parsed = parseLookupRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const outcome = await lookup(
      {
        db: lookupDb(client, dbUrl),
        fetch,
        token,
        perMinute: readPerMinute(Deno.env.get('TMDB_LOOKUP_PER_MINUTE')),
        now: () => new Date(),
      },
      parsed.value,
    );
    return json(outcome.body, outcome.status);
  } catch (cause) {
    if (cause instanceof TmdbLookupError) {
      console.error(`tmdb-lookup: ${cause.message}`);
      return json({ error: 'tmdb_unavailable' }, 502);
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`tmdb-lookup: ${message}`);
    return json({ error: 'internal error' }, 500);
  }
});

function lookupDb(client: SupabaseClient, dbUrl: string): LookupDb {
  return {
    async countRecentLookups(since) {
      const { count, error } = await client
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', LOOKUP_EVENT)
        .gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },

    async recordLookup() {
      const { error } = await client.from('events').insert({ kind: LOOKUP_EVENT, payload: { medium: 'movie' } });
      if (error) throw error;
    },

    async storeMovie(movie, seenAt) {
      const connection = new pg.Client({ connectionString: dbUrl, ssl: sslFor(dbUrl) });
      await connection.connect();
      try {
        return await storeMovie(connection as unknown as SqlClient, movie, seenAt);
      } finally {
        await connection.end().catch(() => {});
      }
    },
  };
}

/**
 * TLS for the hosted database, none for the local stack's container.
 *
 * Without verification, as packages/catalog's `CatalogStore` connects: `pg`
 * carries no Supabase CA bundle. Decided by host rather than by "is it
 * localhost", because locally the platform hands the function the database by
 * its Docker name, not by 127.0.0.1.
 */
function sslFor(connectionString: string): false | { rejectUnauthorized: false } {
  try {
    const host = new URL(connectionString).hostname;
    return /\.supabase\.(co|com)$/.test(host) ? { rejectUnauthorized: false } : false;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
