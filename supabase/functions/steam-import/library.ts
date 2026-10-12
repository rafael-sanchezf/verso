/**
 * One import, start to finish, with the database and Valve behind injected
 * functions so the whole of it can be driven from a test.
 *
 * The order is the argument:
 *
 *   1. **Claim the slot first.** `begin_steam_import` is a row lock and a
 *      ten-minute window in the database, and it answers three ways: not
 *      linked, too soon, or here is the SteamID64. Nothing reaches Steam before
 *      it says yes, so a user tapping Import five times costs one call, not
 *      five.
 *   2. **Ask Steam, and treat silence as an answer.** A private profile is
 *      `{"response":{}}` with an HTTP 200 (research 4.3), which comes back here
 *      as its own result for the app to turn into the privacy checklist -- not
 *      an error, because nothing has gone wrong and there is nothing to retry
 *      until the user changes a setting.
 *   3. **Resolve against the catalog, and keep what does not resolve.** The
 *      mirror writes `media_items.external_ids.steam`, so resolving is a lookup
 *      by app id. Tools, demos, soundtracks and un-mirrored games do not match
 *      and are stored unresolved rather than dropped: dropping them would make
 *      every import re-fetch and re-fail on them, and a later catalog sync can
 *      fill the id in.
 *   4. **Write the library, then let SQL decide about playtime.** Decision 4 --
 *      never over a manual figure, never from a zero, only onto entries that
 *      already exist -- is `apply_steam_playtime` in the migration and is not
 *      restated here. One rule, one place, and the pgTAP suite proves it.
 *   5. **Then where it was played.** Hours on Steam are hours played on PC
 *      (decision 19), so `apply_steam_played_platforms` adds PC to the
 *      played-on list of the tracked games Steam has hours on, adding to what
 *      the user recorded and never replacing it; its rules are in
 *      supabase/migrations/20261007100000_drop_ownership.sql.
 *
 * What an import never does: create a `user_entries` row or put anything in
 * the backlog. A game in the Steam library is Steam's fact; tracking it is the
 * user's. `steam_backlog_candidates` is how the app offers the difference, as
 * games the user may be thinking of playing (decision 26), and the user
 * accepts.
 */

import {
  looksLikePlaytimeHidden,
  mergeLibrary,
  type LibraryEntry,
  type OwnedGame,
} from './steam.ts';

/** What `begin_steam_import` answers. */
export interface ImportSlot {
  allowed: boolean;
  retryAfterSeconds: number;
  /** Null when the user has no Steam account linked. */
  steamId: string | null;
}

export type ImportResult =
  /** No `platform_links` row: the app should offer the link, not a retry. */
  | { status: 'not_linked' }
  /** Inside the ten-minute window. `retryAfterSeconds` is how far inside. */
  | { status: 'rate_limited'; retryAfterSeconds: number }
  /** Valve told us nothing about the library. The privacy checklist, not an error. */
  | { status: 'private_profile' }
  | {
      status: 'imported';
      /** Games Steam says the account owns. */
      ownedGames: number;
      /** How many of them matched a catalog row. */
      resolved: number;
      /** Rows dropped because the account no longer owns them. */
      removed: number;
      /** `user_entries` rows whose playtime changed. */
      entriesUpdated: number;
      /** `user_entries` rows that gained PC on their played-on list. */
      playedPlatformsUpdated: number;
      /** Every owned game reads as zero minutes: probably a hidden total. */
      playtimeHidden: boolean;
      /** The instant every row of this import carries. */
      fetchedAt: string;
    };

export interface ImportDeps {
  beginImport(userId: string): Promise<ImportSlot>;
  fetchOwned(steamId: string): Promise<{ private: boolean; games: OwnedGame[] }>;
  fetchRecent(steamId: string): Promise<OwnedGame[]>;
  /** App id to media item id, for the ones the catalog knows. */
  resolveMediaItems(appIds: number[]): Promise<Map<number, string>>;
  /** Upsert these rows, all stamped `fetchedAt`. */
  writeLibrary(userId: string, rows: LibraryRow[]): Promise<void>;
  /** Drop this user's rows older than `fetchedAt`: games they no longer own. */
  pruneLibrary(userId: string, fetchedAt: string): Promise<number>;
  /** `apply_steam_playtime`. Returns how many entries changed. */
  applyPlaytime(userId: string): Promise<number>;
  /** `apply_steam_played_platforms`. Returns how many entries changed. */
  applyPlayedPlatforms(userId: string): Promise<number>;
  /** Record how it went on `platform_links.sync_status`. */
  finish(userId: string, syncStatus: string): Promise<void>;
}

/** One `steam_library` row, in the database's own spelling. */
export interface LibraryRow {
  user_id: string;
  steam_app_id: number;
  media_item_id: string | null;
  name: string | null;
  playtime_forever_minutes: number;
  playtime_2weeks_minutes: number | null;
  last_played_at: string | null;
  fetched_at: string;
}

export async function importLibrary(deps: ImportDeps, userId: string): Promise<ImportResult> {
  const slot = await deps.beginImport(userId);
  if (!slot.allowed) {
    if (!slot.steamId) return { status: 'not_linked' };
    return { status: 'rate_limited', retryAfterSeconds: slot.retryAfterSeconds };
  }
  // `allowed` with no steam id cannot happen -- the database returns the id
  // whenever it allows -- but the type says it might, and guessing an id is not
  // an option.
  if (!slot.steamId) return { status: 'not_linked' };

  const owned = await deps.fetchOwned(slot.steamId);
  if (owned.private) {
    await deps.finish(userId, 'private');
    return { status: 'private_profile' };
  }

  // Recent playtime is a refinement, not the import. A failure here (Valve
  // unhappy, the endpoint slow) leaves us with GetOwnedGames' own
  // `playtime_2weeks`, which is most of the answer, rather than losing the run.
  let recent: OwnedGame[] = [];
  try {
    recent = await deps.fetchRecent(slot.steamId);
  } catch (cause) {
    console.error(`steam-import: recently played unavailable: ${describe(cause)}`);
  }

  const entries = mergeLibrary(owned.games, recent);
  // One instant for the whole import, so "your library as of" is one answer and
  // so the prune below has an unambiguous cut-off.
  const fetchedAt = new Date().toISOString();

  const mediaItemIds = await deps.resolveMediaItems(entries.map((entry) => entry.steamAppId));

  const rows = entries.map((entry) => toRow(userId, entry, mediaItemIds, fetchedAt));
  await deps.writeLibrary(userId, rows);

  // Anything not in this import is a game the account no longer owns: a refund,
  // a revoked family share, a delisted app. The library is meant to be what
  // Steam says now, so stale rows go.
  const removed = await deps.pruneLibrary(userId, fetchedAt);

  const entriesUpdated = await deps.applyPlaytime(userId);
  const playedPlatformsUpdated = await deps.applyPlayedPlatforms(userId);
  await deps.finish(userId, 'ok');

  return {
    status: 'imported',
    ownedGames: rows.length,
    resolved: rows.filter((row) => row.media_item_id !== null).length,
    removed,
    entriesUpdated,
    playedPlatformsUpdated,
    playtimeHidden: looksLikePlaytimeHidden(entries),
    fetchedAt,
  };
}

function toRow(
  userId: string,
  entry: LibraryEntry,
  mediaItemIds: Map<number, string>,
  fetchedAt: string,
): LibraryRow {
  return {
    user_id: userId,
    steam_app_id: entry.steamAppId,
    media_item_id: mediaItemIds.get(entry.steamAppId) ?? null,
    name: entry.name,
    playtime_forever_minutes: entry.playtimeForeverMinutes,
    playtime_2weeks_minutes: entry.playtime2weeksMinutes,
    last_played_at: entry.lastPlayedAt,
    fetched_at: fetchedAt,
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
