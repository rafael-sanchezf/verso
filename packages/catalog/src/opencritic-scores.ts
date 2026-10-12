import { CatalogStore, OPENCRITIC_POPULAR_LIMIT, OPENCRITIC_SCORE_CHECKED_KEY } from './db';
import { mapOpenCriticScores } from './map';
import {
  OpenCriticBudgetExhaustedError,
  OpenCriticClient,
  OpenCriticNotFoundError,
  OpenCriticRateLimitedError,
  OPENCRITIC_RUN_BUDGET,
} from './opencritic';
import type { ExternalScoreRow, OpenCriticScoreResult, OpenCriticScoreTarget } from './types';

/**
 * Requests one game costs.
 *
 * One: `GET /game/{id}` answers both figures at once, and the search endpoint
 * - the other thing that could cost a request - is never called, because the
 * ids come from Wikidata. It is the number that turns a request budget into a
 * game budget, and here they are the same number.
 */
export const OPENCRITIC_REQUESTS_PER_GAME = 1;

/**
 * How long an `opencritic` score stays fresh.
 *
 * Seven days, where the Steam pass uses twenty hours. The figures move on
 * different clocks: Steam's review percentage shifts with every player who
 * writes a review, while a Top Critic average is settled within a fortnight of
 * release and then barely moves for years. docs/research/game-data-sources.md
 * 3.2 asks only that results be cached "for at least a day"; a week is well
 * past that and is what keeps a 150-request budget covering a catalog of
 * thousands rather than hundreds. Configurable with `--stale-hours` for a
 * launch week when a score really is moving.
 */
export const OPENCRITIC_DEFAULT_STALE_HOURS = 24 * 7;

export interface OpenCriticScoresOptions {
  /** Reference instant, injected so tests and logs agree. */
  now?: Date;
  /** Requests this run may make. Defaults to the client's own budget. */
  budget?: number;
  /** Re-fetch a game last asked about more than this many hours ago. */
  staleHours?: number;
  /** How many games are eligible on popularity alone. */
  popularLimit?: number;
  /** Fetch and map, but write nothing. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface OpenCriticScoresResult {
  /** Games the selection query offered. */
  selected: number;
  /** Games actually fetched, whatever came back. */
  fetched: number;
  /** Games that yielded an `opencritic` row. */
  topCriticScores: number;
  /** Games that yielded an `opencritic_recommended` row. */
  recommendedScores: number;
  /** Games OpenCritic answered for but has no Top Critic reviews of. */
  unscored: number;
  /**
   * Games whose `percentRecommended` came back on a scale we do not recognise
   * (strictly between 0 and 1, so a fraction rather than a percentage). The
   * `opencritic_recommended` row is withheld for these; the average, which
   * carries no such ambiguity, is still written.
   */
  recommendedScaleSkipped: number;
  /** Ids OpenCritic answered 404 for. Wikidata is wrong about these. */
  notFound: number;
  /** external_scores rows written. */
  scoresUpserted: number;
  /** Games whose `opencritic_score_checked_at` was stamped. */
  stamped: number;
  /** Games skipped because the API failed for them alone. */
  failed: number;
  requests: number;
  retries: number;
  /** True when the run stopped early: budget spent, or the API refused. */
  stoppedEarly: boolean;
  stoppedReason: 'complete' | 'budget' | 'rate-limited';
  durationMs: number;
}

export interface OpenCriticScoresDeps {
  client: OpenCriticClient;
  store: CatalogStore;
}

/**
 * Fetch OpenCritic's Top Critic average and percent recommended for the games
 * that warrant them, and write both into `external_scores`.
 *
 * The shape of the run is a budget, not a list, exactly as the Steam pass is:
 * `openCriticScoreTargets` returns at most as many games as the budget can pay
 * for, stalest first, and the run stops the moment the API refuses us or the
 * request cap is reached. Each game's rows are written as they arrive rather
 * than accumulated to the end, so everything finished so far is already
 * committed and tomorrow's run picks up where this one left off.
 *
 * Three answers all count as "asked" and all stamp
 * `metadata.opencritic_score_checked_at`: a score, a game with no Top Critic
 * reviews yet, and a 404 for an id Wikidata got wrong. Only the first writes
 * an `external_scores` row. That split is what keeps a wrong id from costing a
 * request every single night while keeping `external_scores` free of hollow
 * rows the game page would have to render around.
 *
 * Nothing about a user is read or written. The selection query asks whether
 * anybody tracks a game, never who, and the scores it stores are facts about
 * the game.
 */
export async function runOpenCriticScores(
  deps: OpenCriticScoresDeps,
  options: OpenCriticScoresOptions = {},
): Promise<OpenCriticScoresResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.log(message));
  const started = Date.now();

  const budget = Math.min(options.budget ?? deps.client.budget, deps.client.budget);
  const staleHours = options.staleHours ?? OPENCRITIC_DEFAULT_STALE_HOURS;
  const staleBefore = new Date(now.getTime() - staleHours * 60 * 60 * 1000);
  const limit = Math.floor(budget / OPENCRITIC_REQUESTS_PER_GAME);

  const targets = await deps.store.openCriticScoreTargets({
    staleBefore,
    limit,
    popularLimit: options.popularLimit ?? OPENCRITIC_POPULAR_LIMIT,
  });

  const tracked = targets.filter((target) => target.tracked).length;
  log(
    `opencritic scores: ${targets.length} games to fetch (${tracked} tracked by a user, ` +
      `${targets.length - tracked} popular), budget ${budget} requests, ` +
      `stale before ${staleBefore.toISOString()}${options.dryRun ? ' (dry run)' : ''}`,
  );

  let fetched = 0;
  let topCriticScores = 0;
  let recommendedScores = 0;
  let unscored = 0;
  let recommendedScaleSkipped = 0;
  let notFound = 0;
  let scoresUpserted = 0;
  let stamped = 0;
  let failed = 0;
  let stoppedReason: OpenCriticScoresResult['stoppedReason'] = 'complete';

  /** Record that we asked, whatever the answer was. */
  async function stamp(target: OpenCriticScoreTarget): Promise<void> {
    if (options.dryRun) return;
    stamped += await deps.store.setCheckedAt(
      OPENCRITIC_SCORE_CHECKED_KEY,
      [target.media_item_id],
      now,
    );
  }

  for (const target of targets) {
    if (deps.client.remaining < OPENCRITIC_REQUESTS_PER_GAME) {
      stoppedReason = 'budget';
      break;
    }

    let result: OpenCriticScoreResult;
    try {
      result = mapOpenCriticScores(
        target.media_item_id,
        target.opencritic_id,
        await deps.client.game(target.opencritic_id),
      );
    } catch (error) {
      // An id OpenCritic does not have is an answer, not a failure. Stamped
      // like any other answer so it costs one request a window instead of one
      // a night; still re-asked eventually, because the id came from Wikidata
      // and Wikidata gets corrected.
      if (error instanceof OpenCriticNotFoundError) {
        notFound += 1;
        fetched += 1;
        await stamp(target);
        log(`opencritic scores: id ${target.opencritic_id} is not a game OpenCritic has`);
        continue;
      }
      // A refusal or a spent budget is about the run, not about this game.
      if (error instanceof OpenCriticRateLimitedError) {
        stoppedReason = 'rate-limited';
        log(`opencritic scores: stopping, ${error.message}`);
        break;
      }
      if (error instanceof OpenCriticBudgetExhaustedError) {
        stoppedReason = 'budget';
        break;
      }
      // Anything else is one game's bad luck: it keeps its older stamp and
      // comes first on the next run.
      failed += 1;
      log(
        `opencritic scores: id ${target.opencritic_id} skipped - ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    fetched += 1;
    if (result.topCritic) topCriticScores += 1;
    if (result.recommended) recommendedScores += 1;
    if (result.recommendedScaleSuspect) recommendedScaleSkipped += 1;
    if (!result.topCritic && !result.recommended && !result.recommendedScaleSuspect) {
      unscored += 1;
    }

    const rows: ExternalScoreRow[] = [];
    if (result.topCritic) rows.push(result.topCritic);
    if (result.recommended) rows.push(result.recommended);

    if (!options.dryRun && rows.length > 0) {
      scoresUpserted += await deps.store.upsertExternalScores(rows);
    }
    await stamp(target);
  }

  const result: OpenCriticScoresResult = {
    selected: targets.length,
    fetched,
    topCriticScores,
    recommendedScores,
    unscored,
    recommendedScaleSkipped,
    notFound,
    scoresUpserted,
    stamped,
    failed,
    requests: deps.client.requestCount,
    retries: deps.client.retryCount,
    stoppedEarly: stoppedReason !== 'complete',
    stoppedReason,
    durationMs: Date.now() - started,
  };

  log(
    `done: ${result.fetched}/${result.selected} games fetched, ` +
      `${result.topCriticScores} with a top critic average, ` +
      `${result.recommendedScores} with percent recommended, ` +
      `${result.unscored} unscored, ${result.recommendedScaleSkipped} with an ` +
      `unrecognised percentRecommended scale, ${result.notFound} not on OpenCritic, ` +
      `${result.scoresUpserted} score rows written, ${result.failed} skipped, ` +
      `${result.requests} API requests (${result.retries} retried), ` +
      `${(result.durationMs / 1000).toFixed(1)}s`,
  );
  // One line per run, not per game: if the API has changed its units this is
  // every game, and forty identical lines would bury the summary above.
  if (result.recommendedScaleSkipped > 0) {
    log(
      `warning: percentRecommended came back between 0 and 1 for ` +
        `${result.recommendedScaleSkipped} of ${result.fetched} games, which reads as a ` +
        `fraction rather than a percentage. No opencritic_recommended row was written for ` +
        `those; check the API's units before trusting the ones that were.`,
    );
  }
  if (result.stoppedEarly) {
    log(
      `stopped early (${result.stoppedReason}); the rest keep their older ` +
        `${OPENCRITIC_SCORE_CHECKED_KEY} and come first on the next run`,
    );
  }

  return result;
}

/** The request cap a run uses when nothing overrides it. */
export const DEFAULT_OPENCRITIC_SCORES_BUDGET = OPENCRITIC_RUN_BUDGET;
