/**
 * The personal suggestion: three picks from SQL's thirty, each with a reason
 * in the user's own terms. docs/design/recommendation-engine.md, "PR B".
 *
 *   POST { "medium": "game", "genres"?: [...], "excludeGenres"?: [...],
 *          "maxMinutes"?: 120, "platforms"?: [...], "providerIds"?: [...],
 *          "region"?: "US", "includeBacklog"?: false, "note"?: "..." }
 *   with the user's JWT
 *     -> 200 { requestId, model, fallback, picks: [...], candidates: [...] }
 *     -> 429 { error: "daily_limit_reached", ... } over the daily limit
 *
 * Deploy (docs/process/hosted-setup.md, section 7):
 *
 *   supabase secrets set ANTHROPIC_API_KEY=...
 *   supabase functions deploy suggest
 *
 * **The platform's JWT gate stays on** (no `[functions.suggest]` block in
 * supabase/config.toml, so `verify_jwt` is the default, true). On top of it
 * `auth.getUser()` refuses anything that is not a live user session: the gate
 * alone would also admit the anon key, and an anonymous caller has no list to
 * suggest from and no row the meter could count.
 *
 * **Everything runs as the caller.** The client is the anon key plus the
 * request's own Authorization header, so `suggestion_candidates`, `tier_list`
 * and the `user_entries` reads see only the caller's rows, and the two log
 * inserts pass Row Level Security only as the caller's own. There is no
 * service-role key in this function.
 *
 * Environment:
 *
 *   SUPABASE_URL, SUPABASE_ANON_KEY  provided by the platform
 *   ANTHROPIC_API_KEY                a function secret; never in the app
 *   SUGGEST_MODEL                    optional, default claude-haiku-5-5 (Claude Haiku 5.5,
 *                                    since 2026-10-08); any model that takes adaptive
 *                                    thinking with an effort level, which Haiku 4.5 does not
 *   SUGGEST_DAILY_LIMIT              optional, default 20; 0 turns the feature off
 *
 * This file stays thin on purpose: it is the one module with an `npm:` import,
 * and suggest.test.ts never loads it. The flow is in suggest.ts.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  DEFAULT_DAILY_LIMIT,
  DEFAULT_MODEL,
  type DroppedEntry,
  type Medium,
  type NoteEntry,
  parseSuggestRequest,
  suggest,
  type SuggestDb,
  type Tier,
} from './suggest.ts';

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
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!url || !anonKey || !apiKey) {
    return json({ error: 'SUPABASE_URL, SUPABASE_ANON_KEY and ANTHROPIC_API_KEY must be set' }, 500);
  }
  const model = Deno.env.get('SUGGEST_MODEL')?.trim() || DEFAULT_MODEL;
  const dailyLimit = readLimit(Deno.env.get('SUGGEST_DAILY_LIMIT'));

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  if (!token) return json({ error: 'not signed in' }, 401);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return json({ error: 'not signed in' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'the body must be JSON' }, 400);
  }
  const parsed = parseSuggestRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const outcome = await suggest(
      { db: callerDb(client, data.user.id), userId: data.user.id, apiKey, model, dailyLimit },
      parsed.value,
    );
    return json(outcome.body, outcome.status);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`suggest: ${message}`);
    return json({ error: 'internal error' }, 500);
  }
});

/** A whole number, 0 or more; anything else is the default, said once in the log. */
function readLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_LIMIT;
  const limit = Number(raw);
  if (Number.isInteger(limit) && limit >= 0) return limit;
  console.error(`suggest: SUGGEST_DAILY_LIMIT=${JSON.stringify(raw)} is not a whole number; using ${DEFAULT_DAILY_LIMIT}`);
  return DEFAULT_DAILY_LIMIT;
}

/**
 * SuggestDb on the caller's client. The `user_id` filters are redundant with
 * Row Level Security (user_entries is owner-only) and are there for the index
 * on (user_id, status) and for the reader.
 */
function callerDb(client: SupabaseClient, userId: string): SuggestDb {
  return {
    async countRequests(since) {
      const { data, error } = await client.rpc('count_suggestion_requests', { p_since: since });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async candidates(args) {
      const { data, error } = await client.rpc('suggestion_candidates', args);
      if (error) throw error;
      return data ?? [];
    },

    async tierList(medium: Medium, tier: Tier) {
      const { data, error } = await client.rpc('tier_list', { p_medium: medium, p_tier: tier });
      if (error) throw error;
      return data ?? [];
    },

    async droppedEntries(medium, limit): Promise<DroppedEntry[]> {
      const { data, error } = await client
        .from('user_entries')
        .select('notes, media_items(title, year)')
        .eq('user_id', userId)
        .eq('medium', medium)
        .eq('status', 'dropped')
        .order('added_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const item = catalogItem(row.media_items);
        return item ? [{ title: item.title, year: item.year, note: row.notes ?? null }] : [];
      });
    },

    // "Recent" is by when the entry was added: user_entries has no updated_at,
    // so a note written today on an old entry sorts by the entry's age.
    async recentNotes(medium, limit): Promise<NoteEntry[]> {
      const { data, error } = await client
        .from('user_entries')
        .select('notes, status, media_items(title)')
        .eq('user_id', userId)
        .eq('medium', medium)
        .neq('status', 'dropped')
        .not('notes', 'is', null)
        .order('added_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const item = catalogItem(row.media_items);
        return item && row.notes ? [{ title: item.title, status: row.status, note: row.notes }] : [];
      });
    },

    async insertSuggestionRequest(row) {
      const { data, error } = await client
        .from('suggestion_requests')
        .insert(row)
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async insertPredictions(rows) {
      const { error } = await client.from('prediction_log').insert(rows);
      if (error) throw error;
    },
  };
}

/** A to-one embed arrives as an object, or as a one-element array without generated types. */
function catalogItem(embed: unknown): { title: string; year: number | null } | null {
  const item = Array.isArray(embed) ? embed[0] : embed;
  if (!item || typeof item !== 'object' || typeof (item as { title?: unknown }).title !== 'string') return null;
  const { title, year } = item as { title: string; year?: number | null };
  return { title, year: year ?? null };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
