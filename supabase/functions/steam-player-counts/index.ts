/**
 * The 30-minute Steam concurrent-player poll. ROADMAP.md work queue item 13.
 *
 * pg_cron calls this through pg_net every half hour (see the schedule at the
 * bottom of supabase/migrations/20260916084800_player_counts.sql), it reads
 * Valve's current figure for every game our users track that has a Steam app
 * id, and it writes one `player_counts` row per game, all stamped with the same
 * instant. Valve gives the present only; the history is ours because we keep
 * these rows (docs/research/game-data-sources.md 4.5 -- SteamDB and Steam
 * Charts have the history and both forbid scraping).
 *
 * Deploy:
 *
 *   supabase functions deploy steam-player-counts
 *
 * Two gates stand in front of it, and neither is in this file's control flow by
 * accident:
 *
 *   1. The platform's own JWT check, which is on by default (`verify_jwt`
 *      defaults to true and nothing in supabase/config.toml turns it off). A
 *      request with no bearer token never reaches this code.
 *   2. The check below, that the token is the *service role* key. The platform
 *      check alone would also admit the anon key and any signed-in user's
 *      token, which would let anyone with the app installed make us call Steam
 *      as often as they liked.
 *
 * What it reads about people: nothing. It asks which *games* are tracked, never
 * by whom -- the queries embed `media_item_id` from `user_entries` and
 * `ranking_entries` and select no `user_id` anywhere -- and the rows it writes
 * are a game and a number.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fetchPlayerCounts } from './steam.ts';

/**
 * Games one run may poll.
 *
 * The Steam Web API Terms allow 100,000 calls a day. At a call per game every
 * 30 minutes that is 48 runs, so 500 games is 24,000 calls a day, under a
 * quarter of the allowance with the rest left for the account-linking work
 * item 15 will bring. At four in flight it is also about twenty seconds of wall
 * clock, well inside the Edge Function's 150 s.
 *
 * Above the cap the stalest games go first (see `byStaleness`), so a cap that
 * starts to bind slows every game's series down rather than freezing some games
 * out of it entirely.
 */
const RUN_LIMIT = 500;

/** PostgREST caps a response at `max_rows` (1000 in supabase/config.toml). */
const PAGE_SIZE = 1000;

/** Rows per insert. Keeps one statement's payload sane when the catalog grows. */
const INSERT_CHUNK = 500;

interface TrackedGame {
  mediaItemId: string;
  appId: number;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    return json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set' }, 500);
  }

  // Gate 2. The platform has already verified that the token is a valid project
  // JWT; this is what narrows "valid" to "the cron job".
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (token !== serviceRoleKey) {
    return json({ error: 'forbidden' }, 403);
  }

  const startedAt = Date.now();
  // One instant for the whole run, so every game polled in these few seconds
  // lands on the same point of the x-axis. The column has no default for this
  // reason; see the migration.
  const observedAt = new Date().toISOString();

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const tracked = await trackedSteamGames(client);
    const ordered = await byStaleness(client, tracked);
    const toPoll = ordered.slice(0, RUN_LIMIT);

    const results = await fetchPlayerCounts(toPoll.map((game) => game.appId));

    const rows: { media_item_id: string; observed_at: string; players: number }[] = [];
    let unavailable = 0;
    let failed = 0;
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i]!;
      if (result.players !== null) {
        rows.push({
          media_item_id: toPoll[i]!.mediaItemId,
          observed_at: observedAt,
          players: result.players,
        });
      } else if (result.error) {
        failed += 1;
        console.error(`steam-player-counts: appid ${result.appId}: ${result.error}`);
      } else {
        unavailable += 1;
      }
    }

    for (let from = 0; from < rows.length; from += INSERT_CHUNK) {
      // Upsert rather than insert: the pair (media item, observed_at) is the
      // primary key, so a retried tick rewrites its own rows instead of failing
      // on them.
      const { error } = await client
        .from('player_counts')
        .upsert(rows.slice(from, from + INSERT_CHUNK), {
          onConflict: 'media_item_id,observed_at',
        });
      if (error) throw error;
    }

    return json({
      ok: true,
      observed_at: observedAt,
      /** Tracked games with a Steam app id. */
      tracked: tracked.length,
      /** How many of them this run asked Valve about. */
      polled: toPoll.length,
      /** Rows written. */
      written: rows.length,
      /** Valve answered but had no figure for the app (delisted, unreleased, server-side). */
      unavailable,
      /** The call failed after every retry. Tomorrow's problem, or the next tick's. */
      failed,
      capped: tracked.length > RUN_LIMIT,
      duration_ms: Date.now() - startedAt,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`steam-player-counts: ${message}`);
    return json({ ok: false, error: message }, 500);
  }
});

/**
 * Every game with a Steam app id that at least one user tracks, once each.
 *
 * "Tracks" is either table: an entry (backlog, playing, played, dropped) or a
 * ranked item. They overlap heavily and neither contains the other -- a game
 * can be ranked after its entry is removed -- so both are asked and the answers
 * are merged on the media item id.
 *
 * `!inner` turns the embed into a join, so the result is the games at least one
 * row points at. The embedded column is `media_item_id`, the game's own id; no
 * query here selects `user_id`, and the run therefore cannot learn, log, or
 * leak who plays what. It is also why the count of tracked games is the only
 * per-user fact in the summary, and an aggregate one.
 */
async function trackedSteamGames(client: SupabaseClient): Promise<TrackedGame[]> {
  const appIdByMediaItem = new Map<string, number>();

  for (const table of ['user_entries', 'ranking_entries'] as const) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from('media_items')
        .select(`id, external_ids, ${table}!inner(media_item_id)`)
        .eq('medium', 'game')
        .not('external_ids->>steam', 'is', null)
        // A stable order, so paging cannot skip or repeat a row.
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const page = (data ?? []) as { id: string; external_ids: unknown }[];
      for (const row of page) {
        const appId = toAppId(row.external_ids);
        if (appId !== null) appIdByMediaItem.set(row.id, appId);
      }
      if (page.length < PAGE_SIZE) break;
    }
  }

  return [...appIdByMediaItem].map(([mediaItemId, appId]) => ({ mediaItemId, appId }));
}

/**
 * The tracked games, least recently observed first.
 *
 * Only matters once there are more tracked games than `RUN_LIMIT`, and that is
 * exactly when it matters a lot: without it the same first 500 games would be
 * polled forever and the rest would never get a single point. A game that has
 * never been observed sorts before every game that has.
 */
async function byStaleness(
  client: SupabaseClient,
  games: TrackedGame[],
): Promise<TrackedGame[]> {
  if (games.length <= RUN_LIMIT) return games;

  const lastObserved = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('latest_player_counts')
      .select('media_item_id, observed_at')
      .order('media_item_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as { media_item_id: string; observed_at: string }[];
    for (const row of page) lastObserved.set(row.media_item_id, Date.parse(row.observed_at));
    if (page.length < PAGE_SIZE) break;
  }

  return [...games].sort((a, b) => {
    const aAt = lastObserved.get(a.mediaItemId) ?? Number.NEGATIVE_INFINITY;
    const bAt = lastObserved.get(b.mediaItemId) ?? Number.NEGATIVE_INFINITY;
    if (aAt !== bAt) return aAt - bAt;
    return a.mediaItemId < b.mediaItemId ? -1 : 1;
  });
}

/**
 * `external_ids.steam` as a positive integer.
 *
 * The mirror writes it as a number (packages/catalog stores the smallest Steam
 * app id when IGDB lists several), but `external_ids` is a free-form jsonb blob
 * that hand-written rows and older syncs also touch, so a string is read just
 * as happily and anything else is skipped rather than turned into `NaN` in a
 * URL.
 */
function toAppId(externalIds: unknown): number | null {
  const raw = (externalIds as Record<string, unknown> | null | undefined)?.steam;
  if (raw === null || raw === undefined) return null;
  const appId = Number(raw);
  return Number.isInteger(appId) && appId > 0 ? appId : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
