import { IntervalLimiter, systemClock, type Clock } from './rate-limit';
import type { SteamAppDetailsResponse, SteamAppReviewsResponse } from './types';

const APP_REVIEWS_URL = 'https://store.steampowered.com/appreviews';
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';

/**
 * Milliseconds between storefront requests.
 *
 * 1.5 seconds, which is 40 requests a minute across both endpoints. The
 * community's observed ceiling is roughly 200 `appdetails` calls per five
 * minutes per IP (docs/research/game-data-sources.md 2.5); the phase alternates
 * the two endpoints, so `appdetails` sees about 100 per five minutes, half the
 * ceiling. Deliberately slower than the ~600 ms community scrapers settle on:
 * this is a nightly background job with nobody waiting on it, and the endpoint
 * is one Valve tolerates rather than one it promises.
 */
export const STOREFRONT_INTERVAL_MS = 1500;

/**
 * Requests one run may make before it stops, whatever is left to do.
 *
 * 400 calls, so two per game and 200 games a night, about ten minutes of wall
 * clock at the interval above. The cap is the point: a nightly job that cannot
 * exceed a few hundred calls can never become the thing that gets our IP
 * blocked, however much the catalog grows. What it does not reach tonight it
 * reaches tomorrow, because the phase takes the stalest rows first.
 */
export const STOREFRONT_RUN_BUDGET = 400;

/** First backoff after a 429 or a 403. Doubles each time: 5s, 10s, 20s, 40s. */
export const STOREFRONT_BACKOFF_MS = 5000;

/** Attempts per request, including the first. */
export const STOREFRONT_MAX_ATTEMPTS = 4;

/**
 * A User-Agent that names us.
 *
 * Wikimedia asks for this in so many words and Valve does not, but an
 * undocumented endpoint is exactly where being identifiable is worth more than
 * being anonymous: if this job ever misbehaves, whoever notices can see who it
 * is instead of just blocking the address range.
 */
export const STOREFRONT_USER_AGENT = 'verso-catalog/0.1 (+https://github.com/rafael-sanchezf/verso)';

export class SteamStorefrontError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SteamStorefrontError';
  }
}

/**
 * Thrown when the storefront has refused us repeatedly. The caller stops the
 * whole run rather than spending the rest of the budget on requests that are
 * going to be refused too.
 */
export class SteamRateLimitedError extends SteamStorefrontError {
  constructor(status: number, attempts: number) {
    super(`Steam storefront returned ${status} on ${attempts} consecutive attempts`, status);
    this.name = 'SteamRateLimitedError';
  }
}

/** Thrown when the run's hard cap is reached. Not a failure: a stopping point. */
export class SteamBudgetExhaustedError extends Error {
  constructor(readonly budget: number) {
    super(`Steam storefront budget of ${budget} requests is spent`);
    this.name = 'SteamBudgetExhaustedError';
  }
}

export interface SteamStorefrontOptions {
  clock?: Clock;
  fetchImpl?: typeof fetch;
  /** Requests this client may make before it refuses. */
  budget?: number;
  intervalMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

/**
 * Read-only client for Steam's two storefront endpoints.
 *
 * Paced by its own {@link IntervalLimiter} rather than the IGDB limiter,
 * because the two have nothing to do with each other: different host,
 * different (unpublished) rules, and this one runs in a separate job.
 *
 * No key, no login, no user data: both endpoints are the public store pages in
 * JSON form. Nothing here writes, and nothing here reads anything about a
 * person.
 */
export class SteamStorefrontClient {
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: IntervalLimiter;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;

  readonly budget: number;

  /** Requests actually sent, retries included. Counts against the budget. */
  requestCount = 0;
  retryCount = 0;

  constructor(options: SteamStorefrontOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.budget = options.budget ?? STOREFRONT_RUN_BUDGET;
    this.maxAttempts = options.maxAttempts ?? STOREFRONT_MAX_ATTEMPTS;
    this.backoffMs = options.backoffMs ?? STOREFRONT_BACKOFF_MS;
    this.limiter = new IntervalLimiter({
      intervalMs: options.intervalMs ?? STOREFRONT_INTERVAL_MS,
      clock: this.clock,
    });
  }

  /** Requests still available in this run. */
  get remaining(): number {
    return Math.max(this.budget - this.requestCount, 0);
  }

  /** True when the next request would exceed the run's cap. */
  get exhausted(): boolean {
    return this.remaining <= 0;
  }

  /**
   * One paced GET, retried with exponential backoff on 429, 403 and 5xx.
   *
   * 403 is retried alongside 429 because the storefront uses both for the same
   * thing: community reports have it answering either once an IP is over the
   * observed ceiling. Both also slow the shared limiter down through
   * `pause`, so a refusal costs the whole run its pace and not just this
   * request's.
   *
   * Every attempt is counted against the budget before it is sent, so a run
   * that spends its cap on retries stops exactly as firmly as one that spends
   * it on progress.
   */
  private async getJson<T>(url: string): Promise<T> {
    let attempt = 0;

    for (;;) {
      attempt += 1;
      if (this.exhausted) throw new SteamBudgetExhaustedError(this.budget);

      const response = await this.limiter.run(async () => {
        this.requestCount += 1;
        return this.fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': STOREFRONT_USER_AGENT },
        });
      });

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          // The storefront answers 200 with an HTML error page often enough
          // that this is a normal outcome, not a bug. One game's data, lost.
          throw new SteamStorefrontError('Steam storefront returned unparseable JSON', 200);
        }
      }

      const refused = response.status === 429 || response.status === 403;
      const retryable = refused || response.status >= 500;

      if (!retryable) {
        throw new SteamStorefrontError(`Steam storefront returned ${response.status}`, response.status);
      }

      if (attempt >= this.maxAttempts) {
        if (refused) throw new SteamRateLimitedError(response.status, attempt);
        throw new SteamStorefrontError(
          `Steam storefront returned ${response.status} after ${attempt} attempts`,
          response.status,
        );
      }

      this.retryCount += 1;
      const backoff = this.backoffMs * 2 ** (attempt - 1);
      // Slow every later request down too, not just this retry.
      if (refused) this.limiter.pause(backoff);
      await this.clock.sleep(backoff);
    }
  }

  /**
   * The review summary for one app.
   *
   * `num_per_page=0` asks for the summary and no review bodies, which is both
   * the smallest response and the only part we are allowed to keep: review
   * text is the reviewers' copyright, and the catalog stores two integers.
   * `language=all` and `purchase_type=all` make the percentage the one the
   * store page itself shows ("All Reviews") rather than a filtered slice.
   */
  async appReviews(appId: number): Promise<SteamAppReviewsResponse> {
    const url =
      `${APP_REVIEWS_URL}/${appId}` + `?json=1&language=all&purchase_type=all&num_per_page=0`;
    return this.getJson<SteamAppReviewsResponse>(url);
  }

  /**
   * The licensed Metacritic block for one app.
   *
   * `filters=metacritic` trims the response from the whole store page to the
   * one field we may display. `cc=us&l=english` pins the storefront so the
   * metascore is the same whichever runner the job lands on.
   */
  async appMetacritic(appId: number): Promise<SteamAppDetailsResponse> {
    const url = `${APP_DETAILS_URL}?appids=${appId}&cc=us&l=english&filters=metacritic`;
    return this.getJson<SteamAppDetailsResponse>(url);
  }
}
