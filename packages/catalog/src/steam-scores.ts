import { CatalogStore, STEAM_POPULAR_LIMIT } from './db';
import { mapSteamMetacritic, mapSteamReviews } from './map';
import {
  SteamBudgetExhaustedError,
  SteamRateLimitedError,
  SteamStorefrontClient,
  STOREFRONT_RUN_BUDGET,
} from './steam';
import type { ExternalScoreRow, SteamScoreResult, SteamScoreTarget } from './types';

/**
 * Requests one game costs: the review summary and the Metacritic block.
 *
 * The two endpoints are separate calls and neither answers the other's
 * question, so a game is always two. It is the number that turns a request
 * budget into a game budget.
 */
export const REQUESTS_PER_GAME = 2;

/**
 * How long a `steam` score stays fresh.
 *
 * 20 hours, not 24: the job runs nightly and its start time drifts, so a
 * 24-hour window would skip a game that was fetched a few minutes late
 * yesterday and push it a whole day. Under the daily cadence
 * docs/research/game-data-sources.md 10.3 asks for ("cached daily"), and well
 * inside 2.5's advice to cache storefront responses for at least a day.
 */
export const DEFAULT_STALE_HOURS = 20;

export interface SteamScoresOptions {
  /** Reference instant, injected so tests and logs agree. */
  now?: Date;
  /** Requests this run may make. Defaults to the client's own budget. */
  budget?: number;
  /** Re-fetch a game whose `steam` row is older than this many hours. */
  staleHours?: number;
  /** How many games are eligible on popularity alone. */
  popularLimit?: number;
  /** Fetch and map, but write nothing. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface SteamScoresResult {
  /** Games the selection query offered. */
  selected: number;
  /** Games actually fetched, whatever came back. */
  fetched: number;
  /** Games whose reviews yielded a `steam` row. */
  reviewScores: number;
  /** Games Valve licenses a metascore for. */
  metacriticScores: number;
  /** external_scores rows written. */
  scoresUpserted: number;
  /** media_items rows whose metacritic_url was set or changed. */
  metacriticUrlsUpdated: number;
  /** Games skipped because the storefront failed for them alone. */
  failed: number;
  requests: number;
  retries: number;
  /** True when the run stopped early: budget spent, or the storefront refused. */
  stoppedEarly: boolean;
  /** Why it stopped, for the log and the workflow summary. */
  stoppedReason: 'complete' | 'budget' | 'rate-limited';
  durationMs: number;
}

export interface SteamScoresDeps {
  client: SteamStorefrontClient;
  store: CatalogStore;
}

/**
 * Both storefront reads for one game, mapped.
 *
 * Reviews first: it is the figure the game page leads with, so if the budget
 * or the storefront runs out between the two calls, the half we got is the
 * half worth having.
 */
async function fetchOne(
  client: SteamStorefrontClient,
  target: SteamScoreTarget,
): Promise<SteamScoreResult> {
  const reviews = await client.appReviews(target.steam_app_id);
  const review = mapSteamReviews(target.media_item_id, reviews);

  const details = await client.appMetacritic(target.steam_app_id);
  const entry = details[String(target.steam_app_id)];
  const metacritic = mapSteamMetacritic(target.media_item_id, entry);

  return {
    media_item_id: target.media_item_id,
    steam_app_id: target.steam_app_id,
    review,
    metacritic: metacritic.score,
    metacriticUrl: metacritic.url,
  };
}

/**
 * Fetch Steam review percentages and Valve's licensed metascores for the games
 * that warrant them, and write both into `external_scores`.
 *
 * The shape of the run is a budget, not a list. `steamScoreTargets` returns at
 * most as many games as the budget can pay for, stalest first, and the run
 * stops the moment the storefront refuses us or the request cap is reached.
 * Every game finished so far is already committed, because each game's rows are
 * written as they arrive rather than accumulated to the end, so tomorrow's run
 * picks up exactly where this one left off. That is what "resumable" means
 * here: there is no cursor to lose, only `fetched_at` to read.
 *
 * Nothing about a user is read or written. The selection query asks whether
 * anybody tracks a game, never who, and the scores it stores are facts about
 * the game.
 */
export async function runSteamScores(
  deps: SteamScoresDeps,
  options: SteamScoresOptions = {},
): Promise<SteamScoresResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.log(message));
  const started = Date.now();

  const budget = Math.min(options.budget ?? deps.client.budget, deps.client.budget);
  const staleHours = options.staleHours ?? DEFAULT_STALE_HOURS;
  const staleBefore = new Date(now.getTime() - staleHours * 60 * 60 * 1000);
  const limit = Math.floor(budget / REQUESTS_PER_GAME);

  const targets = await deps.store.steamScoreTargets({
    staleBefore,
    limit,
    popularLimit: options.popularLimit ?? STEAM_POPULAR_LIMIT,
  });

  const tracked = targets.filter((target) => target.tracked).length;
  log(
    `steam scores: ${targets.length} games to fetch (${tracked} tracked by a user, ` +
      `${targets.length - tracked} popular), budget ${budget} requests, ` +
      `stale before ${staleBefore.toISOString()}${options.dryRun ? ' (dry run)' : ''}`,
  );

  let fetched = 0;
  let reviewScores = 0;
  let metacriticScores = 0;
  let scoresUpserted = 0;
  let metacriticUrlsUpdated = 0;
  let failed = 0;
  let stoppedReason: SteamScoresResult['stoppedReason'] = 'complete';

  for (const target of targets) {
    if (deps.client.remaining < REQUESTS_PER_GAME) {
      stoppedReason = 'budget';
      break;
    }

    let result: SteamScoreResult;
    try {
      result = await fetchOne(deps.client, target);
    } catch (error) {
      // A refusal or a spent budget is about the run, not about this game.
      if (error instanceof SteamRateLimitedError) {
        stoppedReason = 'rate-limited';
        log(`steam scores: stopping, ${error.message}`);
        break;
      }
      if (error instanceof SteamBudgetExhaustedError) {
        stoppedReason = 'budget';
        break;
      }
      // Anything else is one game's bad luck: count it and move on.
      failed += 1;
      log(
        `steam scores: app ${target.steam_app_id} skipped - ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    fetched += 1;
    if (result.review) reviewScores += 1;
    if (result.metacritic) metacriticScores += 1;

    const rows: ExternalScoreRow[] = [];
    if (result.review) rows.push(result.review);
    if (result.metacritic) rows.push(result.metacritic);

    if (!options.dryRun && rows.length > 0) {
      scoresUpserted += await deps.store.upsertExternalScores(rows);
    }
    if (!options.dryRun && result.metacriticUrl) {
      metacriticUrlsUpdated += await deps.store.setMetacriticUrls([
        { media_item_id: result.media_item_id, url: result.metacriticUrl },
      ]);
    }
  }

  const result: SteamScoresResult = {
    selected: targets.length,
    fetched,
    reviewScores,
    metacriticScores,
    scoresUpserted,
    metacriticUrlsUpdated,
    failed,
    requests: deps.client.requestCount,
    retries: deps.client.retryCount,
    stoppedEarly: stoppedReason !== 'complete',
    stoppedReason,
    durationMs: Date.now() - started,
  };

  log(
    `done: ${result.fetched}/${result.selected} games fetched, ` +
      `${result.reviewScores} with reviews, ${result.metacriticScores} with a metascore, ` +
      `${result.scoresUpserted} score rows written, ${result.failed} skipped, ` +
      `${result.requests} storefront requests (${result.retries} retried), ` +
      `${(result.durationMs / 1000).toFixed(1)}s`,
  );
  if (result.stoppedEarly) {
    log(
      `stopped early (${result.stoppedReason}); the rest keep their older ` +
        `fetched_at and come first on the next run`,
    );
  }

  return result;
}

/** The request cap a run uses when nothing overrides it. */
export const DEFAULT_STEAM_SCORES_BUDGET = STOREFRONT_RUN_BUDGET;
