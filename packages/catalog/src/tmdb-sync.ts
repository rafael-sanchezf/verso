import { BATCH_SIZE, CatalogStore, TMDB_MISSING_RETRY_DAYS } from './db';
import { TmdbClient } from './tmdb';
import { isDiscoverable, mapMovie, mapProviderDirectory, mapTv, keepMovie, keepTv } from './tmdb-map';
import type {
  MappedMovie,
  MappedTv,
  TmdbMedium,
  TmdbUpsertCounts,
  WatchProviderRow,
} from './tmdb-types';

/** Both media, in the order a run walks them. */
export const TMDB_MEDIA: readonly TmdbMedium[] = ['movie', 'tv'];

/**
 * The one market V1 stores, and the default for `--regions`.
 *
 * The same `US` the games mirror asks its three sources about. The column
 * exists on all four tables from the first migration, so a second market is a
 * flag rather than a migration (research 8: retrofitting a region column into
 * a shipped schema eats a week).
 */
export const TMDB_DEFAULT_REGION = 'US';

/**
 * Requests a nightly run may spend, across all four passes.
 *
 * Twenty thousand, which at twenty starts a second is under twenty minutes of
 * wall clock and is far more than a normal night needs: the changes feed for a
 * day is a few thousand titles and the entrants are a handful. The budget is
 * there for the nights that are not normal -- a TMDB bulk edit, a threshold
 * change, the first few runs after a full pull -- where it is what keeps the
 * staleness pass from running until the workflow's own timeout kills it
 * between a write and its close-out.
 */
export const TMDB_RUN_BUDGET = 20_000;

/**
 * How old a row may be before the staleness pass re-fetches it, in days.
 *
 * 150, which is TMDB's six-month cache ceiling (research 2.4) with a month of
 * slack: a job that fails for four weeks still refreshes every row inside the
 * window it is allowed to.
 */
export const TMDB_DEFAULT_STALE_DAYS = 150;

/**
 * How far back the changes pass reaches when `--since` is omitted, in hours.
 *
 * 26, the same as the IGDB delta and for the same reason: the schedule can
 * drift, a run can take an hour, and a two-hour overlap costs nothing because
 * every write here is idempotent, whereas a gap silently loses a day of TMDB
 * edits. TMDB caps the window at 14 days either way.
 */
export const TMDB_DEFAULT_SINCE_HOURS = 26;

export interface TmdbSyncOptions {
  /** Reference instant for the keep rule, `refreshed_at` and the log. */
  now?: Date;
  /** The whole discovery set rather than the four nightly passes. */
  full?: boolean;
  /** One medium, or both when omitted. */
  media?: readonly TmdbMedium[];
  /** Which regions' availability, certifications and release dates to store. */
  regions?: readonly string[];
  /** API requests this run may spend across every pass. */
  budget?: number;
  /** Re-fetch a title whose `refreshed_at` is older than this many days. */
  staleDays?: number;
  /** How far back the changes pass reaches. */
  sinceHours?: number;
  /** Stop after this many titles. Smoke tests. */
  maxIds?: number;
  /** Fetch and map, write nothing. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

/** What one pass did, for the result object and for its own log line. */
export interface TmdbPassResult {
  pass: 'providers' | 'changes' | 'entrants' | 'staleness';
  /** Ids the pass selected, before any fetching. */
  selected: number;
  /** Titles actually fetched. */
  fetched: number;
  /** Titles the keep rule kept. */
  kept: number;
  /** Ids TMDB answered 404 for. */
  missing: number;
  /** Titles skipped because their own fetch failed. */
  failed: number;
  /** True when the pass stopped on the budget or on `--max-ids`. */
  stoppedEarly: boolean;
}

export interface TmdbSyncResult {
  regions: string[];
  media: TmdbMedium[];
  full: boolean;
  passes: TmdbPassResult[];
  /** Providers written from the two directory responses. */
  providersWritten: number;
  counts: TmdbUpsertCounts;
  requests: number;
  retries: number;
  /** Export files downloaded. Not API calls, so counted apart. */
  fileRequests: number;
  /** How many times a pair of 429s halved the pace. */
  paceHalvings: number;
  budget: number;
  durationMs: number;
  rowCounts: Record<TmdbMedium, number | null>;
  databaseSizeBytes: number | null;
  /** True when the run stopped on the budget or on `--max-ids`. */
  stoppedEarly: boolean;
}

export interface TmdbSyncDeps {
  client: TmdbClient;
  /** Absent on a dry run with no DATABASE_URL: the catalog is then empty. */
  store: CatalogStore | null;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function emptyCounts(): TmdbUpsertCounts {
  return {
    mediaItems: 0,
    details: 0,
    scores: 0,
    seasons: 0,
    releaseDates: 0,
    certifications: 0,
    providerStubs: 0,
    availabilityWritten: 0,
    availabilityClosed: 0,
  };
}

function addCounts(into: TmdbUpsertCounts, from: TmdbUpsertCounts): void {
  into.mediaItems += from.mediaItems;
  into.details += from.details;
  into.scores += from.scores;
  into.seasons += from.seasons;
  into.releaseDates += from.releaseDates;
  into.certifications += from.certifications;
  into.providerStubs += from.providerStubs;
  into.availabilityWritten += from.availabilityWritten;
  into.availabilityClosed += from.availabilityClosed;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run `worker` over `items` with at most `limit` outstanding at once.
 *
 * Matched to the client's own in-flight cap, so the pool is what keeps the
 * limiter busy rather than a second queue in front of it: with one fetch at a
 * time the rate limiter's twenty-a-second allowance would never be reached,
 * and with unbounded concurrency the limiter would hold hundreds of pending
 * promises for no gain.
 *
 * Results come back in the input's order, which is what makes a `--max-ids`
 * run reproducible.
 */
async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Fetch, map and write one list of ids for one medium.
 *
 * Titles are taken in slices of {@link BATCH_SIZE}: each slice is fetched
 * concurrently, mapped, written, and dropped before the next one starts, so a
 * run of fifty thousand titles holds five hundred of them at a time and never
 * the whole thing.
 *
 * Every stopping condition is checked before a fetch is started rather than
 * after: the budget is shared with every other pass, and a pass that
 * discovered it had overspent only afterwards would take the next pass's
 * requests with it.
 */
async function fetchTitles(
  deps: TmdbSyncDeps,
  kind: TmdbMedium,
  ids: readonly number[],
  seenAt: Date,
  budget: { spent(): number; limit: number; titlesLeft(): number; countTitle(): void },
  options: TmdbSyncOptions,
  counts: TmdbUpsertCounts,
  log: (message: string) => void,
): Promise<{ fetched: number; kept: number; missing: number; failed: number; stoppedEarly: boolean }> {
  const now = options.now ?? new Date();
  const regions = [...(options.regions ?? [TMDB_DEFAULT_REGION])];

  let fetched = 0;
  let kept = 0;
  let missing = 0;
  let failed = 0;
  let stoppedEarly = false;

  for (let start = 0; start < ids.length && !stoppedEarly; start += BATCH_SIZE) {
    const slice: number[] = [];
    for (const id of ids.slice(start, start + BATCH_SIZE)) {
      if (budget.spent() >= budget.limit || budget.titlesLeft() <= 0) {
        stoppedEarly = true;
        break;
      }
      budget.countTitle();
      slice.push(id);
    }
    if (slice.length === 0) break;

    const movies: MappedMovie[] = [];
    const shows: MappedTv[] = [];
    const gone: number[] = [];

    await pooled(slice, deps.client.maxInFlight, async (id) => {
      try {
        if (kind === 'movie') {
          const detail = await deps.client.movie(id);
          if (detail === null) {
            gone.push(id);
            return;
          }
          fetched += 1;
          if (!keepMovie(detail, now)) return;
          const mapped = mapMovie(detail, now, regions);
          if (mapped) {
            movies.push(mapped);
            kept += 1;
          }
        } else {
          const detail = await deps.client.tv(id);
          if (detail === null) {
            gone.push(id);
            return;
          }
          fetched += 1;
          if (!keepTv(detail, now)) return;
          const mapped = mapTv(detail, now, regions);
          if (mapped) {
            shows.push(mapped);
            kept += 1;
          }
        }
      } catch (error) {
        // One title's bad luck. It keeps its older `refreshed_at`, so it comes
        // first on the next run; the rest of the slice is unaffected.
        failed += 1;
        log(`tmdb sync: ${kind} ${id} skipped - ${message(error)}`);
      }
    });

    missing += gone.length;

    if (deps.store && !options.dryRun) {
      if (movies.length > 0) addCounts(counts, await deps.store.upsertMovies(movies, seenAt));
      if (shows.length > 0) addCounts(counts, await deps.store.upsertShows(shows, seenAt));
      // A 404 is an answer about an id we hold, so it is recorded; an id from
      // today's export that the catalog has never seen has no row to stamp and
      // the update simply matches nothing.
      for (const id of gone) await deps.store.markTmdbMissing(kind, id, seenAt);
    }
  }

  return { fetched, kept, missing, failed, stoppedEarly };
}

/**
 * Mirror TMDB into `media_items` and the film and TV extension tables.
 *
 * Four passes in a fixed order, sharing one request budget
 * (docs/design/film-tv-catalog.md, "The command"):
 *
 *   1. **Providers.** The two directory responses, always first, so no
 *      availability row written later can reference a provider the table
 *      lacks.
 *   2. **Changes.** Ids TMDB says moved in the last `--since` hours,
 *      intersected with what the catalog holds. Everything else in the feed is
 *      a title we never chose to mirror.
 *   3. **Entrants.** Today's export, filtered by the discovery rule, minus the
 *      ids we hold. This is how a film crosses the threshold on its way up.
 *   4. **Staleness.** The oldest rows, until the budget is spent. This is the
 *      six-month rule.
 *
 * `--full` replaces the middle two with one pass over the whole discovery set,
 * minus whatever this run has already refreshed, so a full pull that dies is
 * resumed by running it again.
 *
 * Nothing here writes `user_entries`, `ranking_entries`, or anything a user
 * owns. The mirror is a set of facts about titles.
 */
export async function runTmdbSync(
  deps: TmdbSyncDeps,
  options: TmdbSyncOptions = {},
): Promise<TmdbSyncResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? ((line: string) => console.log(line));
  const started = Date.now();

  const media = [...(options.media ?? TMDB_MEDIA)];
  const regions = [...(options.regions ?? [TMDB_DEFAULT_REGION])];
  const limit = options.budget ?? TMDB_RUN_BUDGET;
  const staleDays = options.staleDays ?? TMDB_DEFAULT_STALE_DAYS;
  const sinceHours = options.sinceHours ?? TMDB_DEFAULT_SINCE_HOURS;
  const full = options.full ?? false;

  const counts = emptyCounts();
  const passes: TmdbPassResult[] = [];

  // One budget for the whole run, read from the client so retries count
  // against it too: a night spent backing off has spent those requests
  // whatever they bought.
  let titlesLeft = options.maxIds ?? Number.POSITIVE_INFINITY;
  const budget = {
    limit,
    spent: () => deps.client.requestCount,
    titlesLeft: () => titlesLeft,
    countTitle: () => {
      titlesLeft -= 1;
    },
  };

  log(
    `tmdb sync: ${full ? 'full pull' : `delta over the last ${sinceHours}h`}, ` +
      `media ${media.join(', ')}, regions ${regions.join(', ')}, budget ${limit} requests` +
      (options.maxIds === undefined ? '' : `, max ${options.maxIds} titles`) +
      (options.dryRun ? ' (dry run: nothing is written)' : ''),
  );
  if (!deps.store) {
    log('tmdb sync: no DATABASE_URL, so the catalog is treated as empty and nothing is written');
  }

  // --- Pass 1: providers ---------------------------------------------------
  // A read, so it runs on a dry run too: it is the only way `--dry-run
  // --max-ids 5` is a smoke test of the token against the real endpoint.
  //
  // Upsert only. A provider that is in `watch_providers` and not in today's
  // directory is left exactly where it is: `watch_availability.provider_id`
  // references the table `on delete no action`, so one that still has offers
  // could not be removed anyway, and a provider dropping out of the directory
  // for a night is the relay lagging rather than a service closing.
  //
  // One directory per medium actually being run rather than always both, so
  // `--medium movie` costs one request here instead of two. The foreign key
  // still holds either way: a film's offers can only name providers the film
  // directory carries, and any the relay has not caught up on are stubbed from
  // the title itself before the row that references them.
  let providersWritten = 0;
  const directory = new Map<number, WatchProviderRow>();
  for (const kind of media) {
    for (const row of mapProviderDirectory(await deps.client.providers(kind))) {
      directory.set(row.provider_id, row);
    }
  }
  if (deps.store && !options.dryRun && directory.size > 0) {
    providersWritten = await deps.store.upsertWatchProviders([...directory.values()]);
  }
  log(
    `providers: ${directory.size} in the directory across ${media.length} medium(s), ` +
      `${providersWritten} rows written`,
  );
  passes.push({
    pass: 'providers',
    selected: directory.size,
    fetched: directory.size,
    kept: directory.size,
    missing: 0,
    failed: 0,
    stoppedEarly: false,
  });

  const staleBefore = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
  const missingBefore = new Date(now.getTime() - TMDB_MISSING_RETRY_DAYS * 24 * 60 * 60 * 1000);
  const changesStart = new Date(now.getTime() - sinceHours * 60 * 60 * 1000);

  for (const kind of media) {
    const held = deps.store ? await deps.store.tmdbIds(kind) : new Set<number>();

    if (!full) {
      // --- Pass 2: changes -------------------------------------------------
      const changed: number[] = [];
      const seen = new Set<number>();
      try {
        for await (const id of deps.client.changes(kind, changesStart, now)) {
          if (seen.has(id) || !held.has(id)) continue;
          seen.add(id);
          changed.push(id);
        }
      } catch (error) {
        // The feed failing costs this pass, not the run: the staleness pass
        // reaches the same rows eventually, just later.
        log(`changes: ${kind} feed failed - ${message(error)}`);
      }

      log(`changes: ${changed.length} ${kind} ids TMDB moved that the catalog holds`);
      const outcome = await fetchTitles(deps, kind, changed, now, budget, options, counts, log);
      passes.push({ pass: 'changes', selected: changed.length, ...outcome });
    }

    // --- Pass 3: entrants ---------------------------------------------------
    // On a full run this is the whole discovery set rather than the ids the
    // catalog lacks, minus whatever this run has already refreshed, which is
    // what makes a full pull resumable by re-running it.
    const alreadyFresh = full && deps.store ? await deps.store.tmdbFreshIds(kind, staleBefore) : null;

    const entrants: number[] = [];
    try {
      for await (const line of deps.client.exportIds(kind, now, log)) {
        if (!isDiscoverable(line, kind)) continue;
        if (full) {
          if (alreadyFresh?.has(line.id)) continue;
        } else if (held.has(line.id)) {
          continue;
        }
        entrants.push(line.id);
      }
    } catch (error) {
      log(`entrants: ${kind} export failed - ${message(error)}`);
    }

    log(
      `entrants: ${entrants.length} ${kind} ids over the popularity threshold that ` +
        `${full ? 'this run has not refreshed yet' : 'the catalog does not hold'}`,
    );
    const entrantOutcome = await fetchTitles(deps, kind, entrants, now, budget, options, counts, log);
    passes.push({ pass: 'entrants', selected: entrants.length, ...entrantOutcome });

    // --- Pass 4: staleness --------------------------------------------------
    // Whatever the budget has left, spent oldest first. Skipped on a full run,
    // whose own pass already covers every row older than `--stale-days`.
    if (!full) {
      const remaining = Math.max(0, limit - deps.client.requestCount);
      const stale =
        deps.store && remaining > 0
          ? await deps.store.tmdbStaleTargets({
              kind,
              staleBefore,
              missingBefore,
              limit: Math.min(remaining, Number.isFinite(titlesLeft) ? titlesLeft : remaining),
            })
          : [];

      log(
        `staleness: ${stale.length} ${kind} rows older than ${staleDays} days, ` +
          `${remaining} requests left in the budget`,
      );
      const staleOutcome = await fetchTitles(
        deps,
        kind,
        stale.map((target) => target.tmdb_id),
        now,
        budget,
        options,
        counts,
        log,
      );
      passes.push({ pass: 'staleness', selected: stale.length, ...staleOutcome });
    }
  }

  const rowCounts: Record<TmdbMedium, number | null> = { movie: null, tv: null };
  if (deps.store && !options.dryRun) {
    for (const kind of media) rowCounts[kind] = await deps.store.mediumRowCount(kind);
  }
  const databaseSizeBytes =
    deps.store && !options.dryRun ? await deps.store.databaseSizeBytes() : null;

  const result: TmdbSyncResult = {
    regions,
    media,
    full,
    passes,
    providersWritten,
    counts,
    requests: deps.client.requestCount,
    retries: deps.client.retryCount,
    fileRequests: deps.client.fileRequestCount,
    paceHalvings: deps.client.paceHalvings,
    budget: limit,
    durationMs: Date.now() - started,
    rowCounts,
    databaseSizeBytes,
    stoppedEarly: passes.some((pass) => pass.stoppedEarly),
  };

  const fetched = passes.reduce((sum, pass) => sum + pass.fetched, 0);
  const kept = passes.reduce((sum, pass) => sum + pass.kept, 0);
  const missing = passes.reduce((sum, pass) => sum + pass.missing, 0);
  const failed = passes.reduce((sum, pass) => sum + pass.failed, 0);

  log(
    `done: ${fetched} titles fetched, ${kept} kept, ${missing} gone from TMDB, ` +
      `${failed} skipped, ${result.requests} TMDB requests of ${limit} ` +
      `(${result.retries} retried, ${result.fileRequests} export files), ` +
      `${(result.durationMs / 1000).toFixed(1)}s`,
  );
  log(
    `wrote: ${counts.mediaItems} media_items, ${counts.details} details, ` +
      `${counts.scores} tmdb scores, ${counts.seasons} seasons, ` +
      `${counts.releaseDates} release dates, ${counts.certifications} certifications, ` +
      `${counts.availabilityWritten} availability rows, ${counts.availabilityClosed} closed`,
  );
  if (result.paceHalvings > 0) {
    log(
      `warning: TMDB refused us twice in a row ${result.paceHalvings} time(s), so the pace ` +
        `was halved to ${deps.client.requestsPerSecond} starts a second for the rest of the run`,
    );
  }
  if (result.stoppedEarly) {
    log(
      'stopped early (budget or --max-ids); the rest keep their older refreshed_at and ' +
        'come first on the next run',
    );
  }
  for (const kind of media) {
    if (rowCounts[kind] !== null) log(`media_items rows with medium '${kind}': ${rowCounts[kind]}`);
  }
  if (databaseSizeBytes !== null) log(`database size: ${formatBytes(databaseSizeBytes)}`);

  return result;
}
