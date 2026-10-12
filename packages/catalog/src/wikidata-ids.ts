import { CatalogStore, dedupeCrossLinks, WIKIDATA_IDS_CHECKED_KEY } from './db';
import { mapCrossLinks } from './map';
import type { CrossLinkRow } from './types';
import {
  CROSS_LINK_PROPERTIES,
  WikidataBudgetExhaustedError,
  WikidataClient,
  WikidataRateLimitedError,
  WIKIDATA_CHUNK_SIZE,
  type CrossLinkKey,
} from './wikidata';

/**
 * How long a "we asked Wikidata about this game" stamp stays good.
 *
 * 90 days, up from PR #27's 30. The window has to be longer than a full sweep
 * or it decides nothing: at {@link DEFAULT_ID_LIMIT} a night a ~69,000-game
 * catalog takes about 46 nights to get through, so a 30-day window is always
 * already expired by the time a game comes round again and the ordering alone
 * ends up pacing the job.
 *
 * At 90 days the window is what decides. The first sweep takes its 46 nights;
 * for the next 44 the job finds nothing due and does nothing; then games start
 * coming due at about the rate the cap allows and the pass settles at roughly
 * {@link DEFAULT_ID_LIMIT} games a night forever. That is the cost this job
 * was sized for, and it is the same cost whether Wikidata has learned anything
 * or not - which is the point, because a game gaining a HowLongToBeat id is
 * exactly the thing we cannot detect without asking.
 *
 * Wikidata gains these identifiers slowly - a volunteer adds P2816 or P12054
 * to an item when someone gets round to it - so a quarter is not a long time
 * to wait for one, and re-asking sooner spends row versions to learn nothing.
 */
export const DEFAULT_RECHECK_DAYS = 90;

/**
 * Games one run may ask about, across all its queries.
 *
 * 1,500, which is three queries of {@link WIKIDATA_CHUNK_SIZE} and nowhere
 * near the client's 40-query budget. Wikidata is not what limits this number:
 * Postgres is.
 *
 * Every game asked about gets its `metadata` stamped, and `metadata` is an
 * indexed column (`media_items_game_rating_count` indexes an expression over
 * it), so each stamp is a non-HOT update that rewrites the row's entry in all
 * seven `media_items` indexes, the GIN trigram index on `title` included. At
 * 20,000 a night - the whole 40-query budget, which is what this constant used
 * to be - the first four nights would rewrite the entire ~69,000-row catalog,
 * and the re-check would then repeat that burst. At 1,500 a night a full first
 * pass takes about 46 nights (69,000 / 1,500), tracked and popular games first
 * because that is the selection order, and the re-checks come due spread
 * across those same nights instead of arriving all at once (see
 * {@link DEFAULT_RECHECK_DAYS}, which is set to make that true). Slower is the
 * point: nothing downstream is waiting on a complete sweep, and the hosted
 * project is a Free-tier Postgres.
 *
 * Unchanged from PR #27 even though the pass now collects six identifiers
 * rather than one, because the cost it caps is the stamp, and the stamp is one
 * row version per game either way. What got cheaper per identifier is the
 * query, and the query was never the limit.
 *
 * `--limit` and the workflow's `id-limit` input override it, so a deliberate
 * catch-up run can still go wide.
 */
export const DEFAULT_ID_LIMIT = 1500;

export interface WikidataIdsOptions {
  /** Reference instant, injected so tests and logs agree. */
  now?: Date;
  /** Games this run may ask about. */
  limit?: number;
  /** IGDB ids per SPARQL query. */
  chunkSize?: number;
  /** Re-ask about a game last asked about more than this many days ago. */
  recheckDays?: number;
  /** Query and map, but write nothing. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface WikidataIdsResult {
  /** Games the selection query offered. */
  selected: number;
  /** Games actually asked about, in chunks that completed. */
  asked: number;
  /** Games Wikidata bound at least one identifier for, after de-duplication. */
  matched: number;
  /** Identifiers Wikidata offered, per `external_ids` key, after de-duplication. */
  offered: Record<CrossLinkKey, number>;
  /** Games whose `external_ids` actually gained a key. */
  idsWritten: number;
  /** Games with no Steam app id that Wikidata had one for. */
  steamFilled: number;
  /**
   * Games where Wikidata's Steam app id differs from the one the mirror
   * already holds. Counted, never written: IGDB stays authoritative.
   */
  steamDisagreed: number;
  /** Games whose `wikidata_ids_checked_at` was stamped. */
  stamped: number;
  /** Chunks dropped because that one query failed. */
  failedChunks: number;
  requests: number;
  retries: number;
  stoppedEarly: boolean;
  stoppedReason: 'complete' | 'budget' | 'rate-limited';
  durationMs: number;
}

export interface WikidataIdsDeps {
  client: WikidataClient;
  store: CatalogStore;
}

/**
 * Thrown when every chunk a run attempted failed.
 *
 * A wrong query, a changed property number or an endpoint answering 400 to
 * everything all look the same from inside the loop: each chunk is skipped,
 * counted, and the run ends "complete" with nothing written. Exiting 0 on that
 * would leave a scheduled workflow green for weeks while the job did nothing,
 * which is the failure mode a nightly job most needs to avoid. One chunk
 * getting through is enough to call it a bad night rather than a broken job.
 */
export class WikidataIdsAllChunksFailedError extends Error {
  constructor(readonly chunks: number) {
    super(
      `wikidata ids: all ${chunks} Wikidata ${chunks === 1 ? 'query' : 'queries'} failed; ` +
        `nothing was written. The query or the endpoint is wrong, not the data.`,
    );
    this.name = 'WikidataIdsAllChunksFailedError';
  }
}

/** Split a list into fixed-size chunks, the last one short. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** An empty tally with one entry per identifier, so a log line never has holes. */
function emptyTally(): Record<CrossLinkKey, number> {
  return Object.fromEntries(CROSS_LINK_PROPERTIES.map((p) => [p.key, 0])) as Record<
    CrossLinkKey,
    number
  >;
}

/**
 * Fill `media_items.external_ids` from Wikidata, keyed by IGDB id.
 *
 * ROADMAP V1's "Cross-linking IDs": one nightly job, keyed by IGDB id, that
 * collects the Metacritic, HowLongToBeat, OpenCritic and store identifiers, so
 * link-outs and score lookups never depend on a search quota. It needs no key
 * and costs no quota, and it is what makes the paid half affordable: with the
 * ids stored, the OpenCritic scores pass spends its 200 daily requests on
 * `GET /game/{id}` lookups and never on the 25 daily searches
 * (docs/research/game-data-sources.md 3.2 says exactly this). The same
 * argument covers the two sources we must never scrape: Metacritic (3.1) and
 * HowLongToBeat (8.1) are link-outs, and a link needs an id, not a request.
 *
 * One pass rather than one per identifier. The expensive half of the query is
 * the join from our IGDB number to a Wikidata item; every identifier after the
 * first rides along as an OPTIONAL column, so six of them cost one query, one
 * write and one stamp instead of six of each. Adding the seventh is a row in
 * `CROSS_LINK_PROPERTIES`.
 *
 * Idempotent and resumable. What was learned is recorded in `external_ids`,
 * which the write never overwrites; that a game was asked about at all is
 * recorded as a timestamp in `metadata.wikidata_ids_checked_at`, which the
 * selection query excludes for {@link DEFAULT_RECHECK_DAYS}. Without the
 * second record every run would re-ask the same tens of thousands of games and
 * never reach the rest. There is no cursor to lose: both records are per-game,
 * and a run that stops early leaves the games it did not reach exactly as it
 * found them.
 *
 * Nothing about a user is read or written. The selection query asks whether
 * anybody tracks a game, never who, and what leaves this process is a list of
 * IGDB ids.
 */
export async function runWikidataIds(
  deps: WikidataIdsDeps,
  options: WikidataIdsOptions = {},
): Promise<WikidataIdsResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.log(message));
  const started = Date.now();

  const chunkSize = options.chunkSize ?? WIKIDATA_CHUNK_SIZE;
  const recheckDays = options.recheckDays ?? DEFAULT_RECHECK_DAYS;
  const recheckBefore = new Date(now.getTime() - recheckDays * 24 * 60 * 60 * 1000);
  // Never offer more games than the client could pay for even if every chunk
  // were full, so the log line promises only what the budget can deliver.
  const limit = Math.min(options.limit ?? DEFAULT_ID_LIMIT, deps.client.budget * chunkSize);

  const candidates = await deps.store.crossLinkCandidates({ recheckBefore, limit });

  const tracked = candidates.filter((candidate) => candidate.tracked).length;
  log(
    `wikidata ids: ${candidates.length} games to ask Wikidata about (${tracked} tracked by a ` +
      `user), ${Math.ceil(candidates.length / chunkSize)} queries of up to ${chunkSize} for ` +
      `${CROSS_LINK_PROPERTIES.map((p) => p.key).join(', ')}, re-asking anything checked ` +
      `before ${recheckBefore.toISOString()}${options.dryRun ? ' (dry run)' : ''}`,
  );

  let asked = 0;
  let matched = 0;
  const offered = emptyTally();
  let idsWritten = 0;
  let steamFilled = 0;
  let steamDisagreed = 0;
  let stamped = 0;
  let failedChunks = 0;
  let attemptedChunks = 0;
  let stoppedReason: WikidataIdsResult['stoppedReason'] = 'complete';

  for (const batch of chunk(candidates, chunkSize)) {
    if (deps.client.exhausted) {
      stoppedReason = 'budget';
      break;
    }

    attemptedChunks += 1;

    let rows: CrossLinkRow[];
    try {
      rows = mapCrossLinks(await deps.client.crossLinks(batch.map((c) => c.igdb_id)));
    } catch (error) {
      // A refusal or a spent budget is about the run, not about this chunk.
      if (error instanceof WikidataRateLimitedError) {
        stoppedReason = 'rate-limited';
        log(`wikidata ids: stopping, ${error.message}`);
        break;
      }
      if (error instanceof WikidataBudgetExhaustedError) {
        stoppedReason = 'budget';
        break;
      }
      // Anything else is one chunk's bad luck: these games keep their older
      // stamp and come first on the next run.
      failedChunks += 1;
      log(
        `wikidata ids: a chunk of ${batch.length} was skipped - ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    asked += batch.length;

    // Tallied from the de-duplicated view, which is the answer the write acts
    // on; counting raw bindings would report a game with two Epic slugs twice.
    // The same collapse the write does, borrowed rather than repeated, so the
    // log line and the database are the same fact.
    const answers = dedupeCrossLinks(rows);
    matched += answers.length;
    for (const answer of answers) {
      for (const property of CROSS_LINK_PROPERTIES) {
        if (answer[property.key] !== undefined) offered[property.key] += 1;
      }
    }

    if (!options.dryRun) {
      if (rows.length > 0) {
        // Counted before the write, because the write is what fills the empty
        // ones: afterwards both numbers would be zero.
        const steam = await deps.store.countSteamDisagreements(rows);
        steamFilled += steam.filled;
        steamDisagreed += steam.disagreed;
        idsWritten += await deps.store.upsertCrossLinks(rows);
      }
      // Stamped after the ids are written, and for every game in the chunk
      // rather than only the matches: the stamp means "asked", and the misses
      // are the ones it exists to stop re-asking about.
      stamped += await deps.store.setCheckedAt(
        WIKIDATA_IDS_CHECKED_KEY,
        batch.map((candidate) => candidate.media_item_id),
        now,
      );
    }
  }

  const result: WikidataIdsResult = {
    selected: candidates.length,
    asked,
    matched,
    offered,
    idsWritten,
    steamFilled,
    steamDisagreed,
    stamped,
    failedChunks,
    requests: deps.client.requestCount,
    retries: deps.client.retryCount,
    stoppedEarly: stoppedReason !== 'complete',
    stoppedReason,
    durationMs: Date.now() - started,
  };

  log(
    `done: ${result.asked}/${result.selected} games asked about, ${result.matched} matched at ` +
      `least one identifier, ${result.idsWritten} rows gained a key, ${result.stamped} stamped, ` +
      `${result.failedChunks} chunks skipped, ${result.requests} queries ` +
      `(${result.retries} retried), ${(result.durationMs / 1000).toFixed(1)}s`,
  );
  log(
    `identifiers offered: ` +
      CROSS_LINK_PROPERTIES.map((p) => `${p.key} ${result.offered[p.key]}`).join(', '),
  );
  log(
    `steam: ${result.steamFilled} filled where the mirror had none, ` +
      `${result.steamDisagreed} disagreed with the mirror and were left alone ` +
      `(IGDB stays authoritative)`,
  );
  if (result.stoppedEarly) {
    log(
      `stopped early (${result.stoppedReason}); the rest keep their older ` +
        `${WIKIDATA_IDS_CHECKED_KEY} and come first on the next run`,
    );
  }

  // Reported first, then thrown: the summary above is the useful half of the
  // failure, and the exit code is what makes anybody read it.
  if (attemptedChunks > 0 && failedChunks === attemptedChunks) {
    throw new WikidataIdsAllChunksFailedError(attemptedChunks);
  }

  return result;
}
