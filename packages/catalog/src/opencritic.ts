import { IntervalLimiter, requestTimeout, systemClock, type Clock } from './rate-limit';
import type { OpenCriticGame } from './types';
import { retryAfterMs } from './wikidata';

/**
 * OpenCritic's official API, distributed through RapidAPI
 * (docs/research/game-data-sources.md 3.2). This host is the whole of our
 * contact with OpenCritic: opencritic.com itself is never fetched, never
 * parsed, and never scraped.
 */
export const OPENCRITIC_RAPIDAPI_HOST = 'opencritic-api.p.rapidapi.com';

/**
 * Requests one run may make before it stops.
 *
 * The Basic (free) plan allows 200 requests and 25 searches a day, at 4
 * requests a second (docs/research/game-data-sources.md 3.2). This job uses
 * **only** `GET /game/{id}` - one request per game, and never the search
 * endpoint, because the ids come from Wikidata and the 25 daily searches are
 * the tier's binding constraint.
 *
 * 150 rather than 200 on purpose: the daily allowance has to cover a manual
 * `workflow_dispatch`, a retry or two inside this run, and anything Rafa tries
 * by hand the same day. A job that spends the whole quota leaves the next
 * person with a 429 and no explanation.
 */
export const OPENCRITIC_RUN_BUDGET = 150;

/**
 * Milliseconds between requests. The plan allows 4 a second; one a second is a
 * quarter of that, which makes a full 150-request run about two and a half
 * minutes and makes the per-second limit impossible to hit.
 */
export const OPENCRITIC_INTERVAL_MS = 1000;

/** First backoff after a 5xx. Doubles each time: 5s, 10s. */
export const OPENCRITIC_BACKOFF_MS = 5000;

/** Attempts per request, including the first. Applies to 5xx only. */
export const OPENCRITIC_MAX_ATTEMPTS = 3;

/**
 * How long one request may take before it is abandoned.
 *
 * 30 seconds. Without it a hung connection is bounded only by the workflow's
 * own timeout, so a single stuck socket turns a two-and-a-half-minute job into
 * a thirty-minute one that then reports nothing. A lookup that has not
 * answered in thirty seconds is not going to.
 */
export const OPENCRITIC_TIMEOUT_MS = 30_000;

/** The environment variable holding the RapidAPI key. Never logged. */
export const OPENCRITIC_KEY_ENV = 'OPENCRITIC_RAPIDAPI_KEY';

export class OpenCriticError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OpenCriticError';
  }
}

/**
 * The id is not a game OpenCritic has. One game's problem, not the run's: the
 * caller records that it asked and moves on to the next.
 */
export class OpenCriticNotFoundError extends OpenCriticError {
  constructor(readonly openCriticId: number) {
    super(`OpenCritic has no game ${openCriticId}`, 404);
    this.name = 'OpenCriticNotFoundError';
  }
}

/**
 * The daily allowance is spent, or we are asking too fast. Ends the run at
 * once, without a retry.
 *
 * Not retried, unlike the Steam and Wikidata clients, because the free tier
 * makes the two readings of a 429 very unequal: 200 requests a day against a
 * ceiling of 4 a second means that by far the likeliest cause is the day's
 * quota being spent, and that does not clear in five seconds or in fifty. A
 * retry there spends a request that is certain to be refused, and RapidAPI
 * counts refused requests against the same allowance. Waiting until tomorrow
 * is the only thing that actually helps, and the stamps make tomorrow cheap.
 */
export class OpenCriticRateLimitedError extends OpenCriticError {
  constructor(status: number) {
    super(
      `OpenCritic API returned ${status}; the free tier's daily allowance is ` +
        `most likely spent, so the run stops rather than retrying into it`,
      status,
    );
    this.name = 'OpenCriticRateLimitedError';
  }
}

/** Thrown when the run's hard cap is reached. Not a failure: a stopping point. */
export class OpenCriticBudgetExhaustedError extends Error {
  constructor(readonly budget: number) {
    super(`OpenCritic budget of ${budget} requests is spent`);
    this.name = 'OpenCriticBudgetExhaustedError';
  }
}

export interface OpenCriticClientOptions {
  /** The RapidAPI key. Held in memory, sent in a header, never logged. */
  apiKey: string;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  budget?: number;
  intervalMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
  host?: string;
  timeoutMs?: number;
}

/**
 * Read-only client for OpenCritic's official RapidAPI listing.
 *
 * One endpoint is wired: `GET /game/{id}`, the game-by-id lookup. The search
 * endpoint (`GET /game/search?criteria=...`) is deliberately absent from this
 * class rather than merely unused, so no later caller can spend the 25 daily
 * searches by accident. Ids come from Wikidata (see wikidata.ts), which is the
 * arrangement docs/research/game-data-sources.md 3.2 recommends in so many
 * words: store the ids so you spend requests on details, not searches.
 *
 * Paced and budgeted like the Steam client, for the same reason and with the
 * opposite justification: Steam's limits are unpublished so we stay well under
 * a guess, OpenCritic's are published so we stay well under a number.
 */
export class OpenCriticClient {
  private readonly apiKey: string;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: IntervalLimiter;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly host: string;
  private readonly timeoutMs: number;

  readonly budget: number;

  requestCount = 0;
  retryCount = 0;

  constructor(options: OpenCriticClientOptions) {
    this.apiKey = options.apiKey;
    this.clock = options.clock ?? systemClock;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.budget = options.budget ?? OPENCRITIC_RUN_BUDGET;
    this.maxAttempts = options.maxAttempts ?? OPENCRITIC_MAX_ATTEMPTS;
    this.backoffMs = options.backoffMs ?? OPENCRITIC_BACKOFF_MS;
    this.host = options.host ?? OPENCRITIC_RAPIDAPI_HOST;
    this.timeoutMs = options.timeoutMs ?? OPENCRITIC_TIMEOUT_MS;
    this.limiter = new IntervalLimiter({
      intervalMs: options.intervalMs ?? OPENCRITIC_INTERVAL_MS,
      clock: this.clock,
    });
  }

  get remaining(): number {
    return Math.max(this.budget - this.requestCount, 0);
  }

  get exhausted(): boolean {
    return this.remaining <= 0;
  }

  /**
   * One paced GET against the RapidAPI proxy.
   *
   * Each status has exactly one reading:
   *
   *   * 404 is an answer about one game, not a failure. Not retried - it is
   *     not going to become a 200 - and the caller records it so the id is not
   *     asked about again tomorrow.
   *   * 429 ends the whole run immediately, with no retry. See
   *     {@link OpenCriticRateLimitedError} for why retrying a refusal on this
   *     tier spends quota to learn nothing.
   *   * 5xx is retried with backoff, then gives up on this game alone.
   *   * Anything else is one game's problem.
   *
   * The key travels in `x-rapidapi-key` and appears in no URL, no log line and
   * no error message: an error carries the status and the game id only.
   */
  private async getJson<T>(path: string, notFoundId: number): Promise<T> {
    let attempt = 0;

    for (;;) {
      attempt += 1;
      if (this.exhausted) throw new OpenCriticBudgetExhaustedError(this.budget);

      const response = await this.limiter.run(async () => {
        this.requestCount += 1;
        return this.fetchImpl(`https://${this.host}${path}`, {
          headers: {
            Accept: 'application/json',
            'x-rapidapi-key': this.apiKey,
            'x-rapidapi-host': this.host,
          },
          ...requestTimeout(this.timeoutMs),
        });
      });

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new OpenCriticError('OpenCritic API returned unparseable JSON', 200);
        }
      }

      if (response.status === 404) throw new OpenCriticNotFoundError(notFoundId);
      if (response.status === 429) throw new OpenCriticRateLimitedError(response.status);

      if (response.status < 500) {
        throw new OpenCriticError(`OpenCritic API returned ${response.status}`, response.status);
      }

      if (attempt >= this.maxAttempts) {
        throw new OpenCriticError(
          `OpenCritic API returned ${response.status} after ${attempt} attempts`,
          response.status,
        );
      }

      this.retryCount += 1;
      const ours = this.backoffMs * 2 ** (attempt - 1);
      // A 503 may still name a wait; honour it when it is longer than ours.
      const asked = retryAfterMs(response.headers.get('retry-after'), this.clock.now());
      await this.clock.sleep(Math.max(ours, asked ?? 0));
    }
  }

  /**
   * One game by its OpenCritic id.
   *
   * `GET /game/{id}`, the endpoint the RapidAPI listing documents and the one
   * every open client of this API uses. Its response carries `topCriticScore`,
   * `percentRecommended`, `numReviews`, `numTopCriticReviews` and `tier`,
   * among much else the catalog has no use for.
   */
  async game(openCriticId: number): Promise<OpenCriticGame> {
    return this.getJson<OpenCriticGame>(`/game/${openCriticId}`, openCriticId);
  }
}
