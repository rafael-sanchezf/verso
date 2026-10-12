/**
 * Import a linked Steam account's owned library, with playtime.
 * ROADMAP.md V1, "Steam account link".
 *
 * On demand, not on a schedule: the app calls this with the user's JWT right
 * after linking and whenever the user asks for it. A nightly sweep over every
 * linked account would spend the Steam Web API allowance on people who are not
 * looking, and the data it would refresh -- hours played -- is only interesting
 * when someone is on the screen that shows it.
 *
 *   POST  {}   with the user's JWT
 *         -> 200 { status: 'imported' | 'private_profile' | 'rate_limited' | 'not_linked', ... }
 *
 * **Every expected outcome is a 200 with a status.** A private profile is not a
 * failure -- it is Valve correctly refusing to tell us something, and the app
 * turns it into the privacy checklist screen (research 4.3: Game details must
 * be Public). Being inside the ten-minute window is not a failure either. Only
 * things that are genuinely broken -- a missing key, a Steam outage, a database
 * error -- are non-2xx, and those are the ones `importSteamLibrary` in
 * packages/api throws for.
 *
 * Deploy:
 *
 *   supabase secrets set STEAM_WEB_API_KEY=...
 *   supabase functions deploy steam-import
 *
 * The key is read from the function's own secrets and goes into the query
 * string of Valve's URL and nowhere else: it is never logged, never returned,
 * and never in an error message (see `SteamApiError` in steam.ts, which carries
 * a status and not a URL). The Steam Web API Terms require it to be kept
 * confidential (research 4.1).
 *
 * The platform's JWT gate stays on for this function -- unlike steam-link,
 * nothing here is called by a browser -- so a request with no bearer token
 * never reaches this code. The `getUser` check below is what narrows "a valid
 * project JWT" to "a signed-in user", since the gate would also admit the anon
 * key.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { importLibrary, type ImportDeps, type ImportSlot, type LibraryRow } from './library.ts';
import { fetchOwnedGames, fetchRecentlyPlayed, SteamApiError } from './steam.ts';

/** One import per user per ten minutes, enforced by `begin_steam_import`. */
const MIN_INTERVAL = '10 minutes';

/** Rows per upsert, and app ids per catalog lookup. A 900-game library is normal. */
const CHUNK = 500;

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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ error: 'SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set' }, 500);
  }

  const apiKey = Deno.env.get('STEAM_WEB_API_KEY');
  if (!apiKey) {
    // A deployment problem, not a user problem, and the one message here that
    // names the secret -- by name only.
    console.error('steam-import: STEAM_WEB_API_KEY is not set');
    return json({ error: 'the Steam import is not configured' }, 503);
  }

  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return json({ error: 'not signed in' }, 401);

  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await auth.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'not signed in' }, 401);

  const service = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = Date.now();
  try {
    const result = await importLibrary(deps(service, apiKey), userData.user.id);
    return json({ ...result, durationMs: Date.now() - startedAt });
  } catch (cause) {
    // Mark the link as having failed, so the app can say so on the next read
    // without having to remember this response. Best effort: if this write is
    // what failed, there is nothing further to try.
    try {
      await setSyncStatus(service, userData.user.id, 'error');
    } catch { /* already failing */ }

    if (cause instanceof SteamApiError) {
      // 401 and 403 mean the key is wrong or revoked. Distinguished in the log
      // because only one of them is something Rafa can fix, and never
      // distinguished in the body, which reaches a screen.
      const keyProblem = cause.status === 401 || cause.status === 403;
      console.error(`steam-import: Steam call failed (${cause.message})`);
      return json(
        { error: keyProblem ? 'the Steam import is not configured' : 'Steam is not answering' },
        keyProblem ? 503 : 502,
      );
    }

    console.error(`steam-import: ${cause instanceof Error ? cause.message : String(cause)}`);
    return json({ error: 'internal error' }, 500);
  }
});

function deps(service: SupabaseClient, apiKey: string): ImportDeps {
  return {
    beginImport: (userId) => beginImport(service, userId),
    fetchOwned: (steamId) => fetchOwnedGames(apiKey, steamId),
    fetchRecent: (steamId) => fetchRecentlyPlayed(apiKey, steamId),
    resolveMediaItems: (appIds) => resolveMediaItems(service, appIds),
    writeLibrary: (_userId, rows) => writeLibrary(service, rows),
    pruneLibrary: (userId, fetchedAt) => pruneLibrary(service, userId, fetchedAt),
    applyPlaytime: (userId) => applyPlaytime(service, userId),
    applyPlayedPlatforms: (userId) => applyPlayedPlatforms(service, userId),
    finish: (userId, syncStatus) => setSyncStatus(service, userId, syncStatus),
  };
}

async function beginImport(service: SupabaseClient, userId: string): Promise<ImportSlot> {
  const { data, error } = await service.rpc('begin_steam_import', {
    p_user_id: userId,
    p_min_interval: MIN_INTERVAL,
  });
  if (error) throw error;

  const row = (data as { allowed: boolean; retry_after_seconds: number; steam_id: string | null }[])?.[0];
  if (!row) return { allowed: false, retryAfterSeconds: 0, steamId: null };
  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds ?? 0,
    steamId: row.steam_id,
  };
}

/**
 * App id to media item id, for the games the catalog knows.
 *
 * `external_ids->>'steam'` is text, so the app ids go in as strings. The mirror
 * writes the id as a number and older rows may hold a string, which `->>` makes
 * the same thing on the way out -- that is why this filter is on the text form
 * rather than a numeric cast.
 */
async function resolveMediaItems(
  service: SupabaseClient,
  appIds: number[],
): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();

  for (let from = 0; from < appIds.length; from += CHUNK) {
    const chunk = appIds.slice(from, from + CHUNK).map(String);
    const { data, error } = await service
      .from('media_items')
      .select('id, external_ids')
      .eq('medium', 'game')
      .in('external_ids->>steam', chunk);
    if (error) throw error;

    for (const row of (data ?? []) as { id: string; external_ids: unknown }[]) {
      const appId = Number((row.external_ids as Record<string, unknown> | null)?.steam);
      // First match wins. Two catalog rows claiming one Steam app id is a
      // catalog bug, not this function's problem to resolve.
      if (Number.isInteger(appId) && appId > 0 && !resolved.has(appId)) {
        resolved.set(appId, row.id);
      }
    }
  }

  return resolved;
}

async function writeLibrary(service: SupabaseClient, rows: LibraryRow[]): Promise<void> {
  for (let from = 0; from < rows.length; from += CHUNK) {
    const { error } = await service
      .from('steam_library')
      .upsert(rows.slice(from, from + CHUNK), { onConflict: 'user_id,steam_app_id' });
    if (error) throw error;
  }
}

async function pruneLibrary(
  service: SupabaseClient,
  userId: string,
  fetchedAt: string,
): Promise<number> {
  const { data, error } = await service
    .from('steam_library')
    .delete()
    .eq('user_id', userId)
    .lt('fetched_at', fetchedAt)
    .select('steam_app_id');
  if (error) throw error;
  return (data ?? []).length;
}

async function applyPlaytime(service: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await service.rpc('apply_steam_playtime', { p_user_id: userId });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

async function applyPlayedPlatforms(service: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await service.rpc('apply_steam_played_platforms', { p_user_id: userId });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

async function setSyncStatus(
  service: SupabaseClient,
  userId: string,
  syncStatus: string,
): Promise<void> {
  const { error } = await service
    .from('platform_links')
    .update({ sync_status: syncStatus })
    .eq('user_id', userId)
    .eq('platform', 'steam');
  if (error) throw error;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
