import { CatalogStore } from './db';
import { IgdbClient } from './igdb';
import { mapGame, mapTimeToBeat, selectSteamAppId } from './map';
import { catalogTrim } from './trim';
import type { IgdbExternalGame, MappedGame, SteamAppIdRow, TimeToBeatRow } from './types';

export interface SyncOptions {
  /** Full pull when omitted; otherwise only games updated at or after this. */
  since?: Date;
  /** Reference instant for the trim rule and for `refreshed_at`. */
  now?: Date;
  /** Stop after this many IGDB pages. Smoke tests only. */
  maxPages?: number;
  /** Fetch and map, but write nothing. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface SyncResult {
  fetched: number;
  kept: number;
  trimmed: number;
  upserted: number;
  pages: number;
  requests: number;
  retries: number;
  durationMs: number;
  rowCount: number | null;
  databaseSizeBytes: number | null;
  /** Time-to-beat rows IGDB returned figures for. */
  timeToBeatFetched: number;
  /** game_details rows those figures actually landed on. */
  timeToBeatUpdated: number;
  /** external_scores rows written from IGDB's two rating fields. */
  scoresUpserted: number;
  /** Games IGDB listed at least one alternative name for. */
  aliasGames: number;
  /** media_aliases rows with source igdb newly written; names already stored cost nothing. */
  aliasesWritten: number;
  /** Games IGDB gave a Steam app id for. */
  steamIdsFound: number;
  /** Catalog rows whose external_ids.steam was newly set or changed. */
  steamIdsUpdated: number;
}

export interface SyncDeps {
  client: IgdbClient;
  store: CatalogStore | null;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Time-to-beat figures for one page of kept games.
 *
 * Runs on a dry run too. It is a read, and it is the only way `--dry-run
 * --max-pages 1` can be a smoke test of the second endpoint; nothing is
 * written either way.
 */
async function fetchTimeToBeat(deps: SyncDeps, mapped: MappedGame[]): Promise<TimeToBeatRow[]> {
  if (mapped.length === 0) return [];

  const ids = mapped.map((row) => row.gameDetails.igdb_id);
  const rows = await deps.client.timeToBeat(ids);

  return rows.flatMap((row) => {
    const mappedRow = mapTimeToBeat(row);
    return mappedRow ? [mappedRow] : [];
  });
}

/**
 * Steam app ids for one page of kept games.
 *
 * IGDB returns the store entries flat, several per game, so they are grouped
 * by game here and `selectSteamAppId` picks one per game. Games with no Steam
 * entry produce nothing at all rather than a null, so the write never blanks
 * an id we already have.
 *
 * Runs on a dry run for the same reason time to beat does: it is a read, and
 * it makes `--dry-run --max-pages 1` a smoke test of the third endpoint too.
 */
async function fetchSteamAppIds(deps: SyncDeps, mapped: MappedGame[]): Promise<SteamAppIdRow[]> {
  if (mapped.length === 0) return [];

  const ids = mapped.map((row) => row.gameDetails.igdb_id);
  const rows = await deps.client.externalGamesSteam(ids);

  const byGame = new Map<number, IgdbExternalGame[]>();
  for (const row of rows) {
    const list = byGame.get(row.game);
    if (list) list.push(row);
    else byGame.set(row.game, [row]);
  }

  const appIds: SteamAppIdRow[] = [];
  for (const [igdbId, entries] of byGame) {
    const appId = selectSteamAppId(entries);
    if (appId !== null) appIds.push({ igdb_id: igdbId, steam_app_id: appId });
  }

  return appIds;
}

/**
 * Pull games from IGDB and upsert them into `media_items` and `game_details`.
 *
 * One page at a time: fetch 500, apply the trim rule locally, map, upsert,
 * fetch time to beat for exactly those games, move on. Nothing accumulates in
 * memory and a run that dies halfway has already committed everything before
 * the failure, so re-running it continues rather than restarts.
 *
 * The time-to-beat phase is per page rather than a second walk at the end, so
 * it needs no list of ids held across the run and it behaves the same in both
 * modes: a full pull refreshes every kept game, and a delta refreshes exactly
 * the games the delta touched, because those are the only games in its pages.
 */
export async function runSync(deps: SyncDeps, options: SyncOptions = {}): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.log(message));
  const trim = catalogTrim(now);
  const started = Date.now();

  let fetched = 0;
  let kept = 0;
  let upserted = 0;
  let pages = 0;
  let timeToBeatFetched = 0;
  let timeToBeatUpdated = 0;
  let scoresUpserted = 0;
  let aliasGames = 0;
  let aliasesWritten = 0;
  let steamIdsFound = 0;
  let steamIdsUpdated = 0;

  for await (const page of deps.client.pages(now, options.since, options.maxPages)) {
    pages += 1;
    fetched += page.length;

    const mapped: MappedGame[] = [];
    for (const game of page) {
      if (!trim.keep(game)) continue;
      const row = mapGame(game, now);
      if (row) mapped.push(row);
    }
    kept += mapped.length;
    aliasGames += mapped.filter((row) => row.aliases.length > 0).length;

    if (deps.store && !options.dryRun && mapped.length > 0) {
      // Writes media_items, game_details, the two IGDB score rows and the
      // IGDB aliases in one transaction: the last two are keyed by the uuid
      // this upsert returns.
      const counts = await deps.store.upsert(mapped);
      upserted += counts.mediaItems;
      scoresUpserted += counts.externalScores;
      aliasesWritten += counts.aliases;
    }

    // After the upsert, never before: the UPDATE matches on game_details rows,
    // which for a game new to the mirror only exist once the page is written.
    const timeToBeat = await fetchTimeToBeat(deps, mapped);
    timeToBeatFetched += timeToBeat.length;

    if (deps.store && !options.dryRun && timeToBeat.length > 0) {
      timeToBeatUpdated += await deps.store.upsertTimeToBeat(timeToBeat);
    }

    // Also after the upsert: the merge matches on media_items rows.
    const steamIds = await fetchSteamAppIds(deps, mapped);
    steamIdsFound += steamIds.length;

    if (deps.store && !options.dryRun && steamIds.length > 0) {
      steamIdsUpdated += await deps.store.upsertSteamAppIds(steamIds);
    }

    log(
      `page ${pages}: fetched ${page.length}, kept ${mapped.length}, ` +
        `time to beat ${timeToBeat.length}, steam ids ${steamIds.length}, ` +
        `running total kept ${kept}`,
    );
  }

  const rowCount = deps.store && !options.dryRun ? await deps.store.gameRowCount() : null;
  const databaseSizeBytes =
    deps.store && !options.dryRun ? await deps.store.databaseSizeBytes() : null;

  const result: SyncResult = {
    fetched,
    kept,
    trimmed: fetched - kept,
    upserted,
    pages,
    requests: deps.client.requestCount,
    retries: deps.client.retryCount,
    durationMs: Date.now() - started,
    rowCount,
    databaseSizeBytes,
    timeToBeatFetched,
    timeToBeatUpdated,
    scoresUpserted,
    aliasGames,
    aliasesWritten,
    steamIdsFound,
    steamIdsUpdated,
  };

  log(
    `done: ${result.pages} pages, ${result.fetched} fetched, ${result.kept} kept, ` +
      `${result.trimmed} trimmed, ${result.upserted} upserted, ` +
      `${result.requests} IGDB requests (${result.retries} retried), ` +
      `${(result.durationMs / 1000).toFixed(1)}s`,
  );
  log(
    `time to beat: ${result.timeToBeatFetched} games had figures, ` +
      `${result.timeToBeatUpdated} catalog rows updated`,
  );
  log(
    `scores: ${result.scoresUpserted} external_scores rows written ` +
      `(igdb_critics, igdb_users)`,
  );
  log(
    `aliases: ${result.aliasGames} games have IGDB alternative names, ` +
      `${result.aliasesWritten} new media_aliases rows written`,
  );
  log(
    `steam ids: ${result.steamIdsFound} games are on Steam, ` +
      `${result.steamIdsUpdated} catalog rows set or changed`,
  );
  if (rowCount !== null) log(`media_items rows with medium 'game': ${rowCount}`);
  if (databaseSizeBytes !== null) log(`database size: ${formatBytes(databaseSizeBytes)}`);

  return result;
}
