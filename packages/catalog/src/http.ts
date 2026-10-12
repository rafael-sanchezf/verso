import { IntervalLimiter, requestTimeout, systemClock, type Clock } from './rate-limit';
// The same helper `opencritic.ts` imports from there. It reads both forms of
// the header (delta-seconds and HTTP-date) against an injected clock, which is
// exactly what is wanted here: IsThereAnyDeal documents a `Retry-After` on its
// 429s and there is no reason for this package to have two answers to "how
// long did it ask us to wait".
import { retryAfterMs } from './wikidata';

/**
 * The User-Agent every availability request carries.
 *
 * Two of the three sources behind "where to play" are undocumented endpoints
 * that nobody promises us (docs/research/game-data-sources.md 9.1, 9.4), and
 * that is exactly where being identifiable is worth more than being anonymous:
 * if this job ever misbehaves, whoever notices can see who it is and where to
 * complain instead of just blocking an address range.
 */
export const AVAILABILITY_USER_AGENT = 'Verso/0.0 (https://github.com/rafael-sanchezf/verso)';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Thrown when a host has refused us repeatedly. The caller gives up on that
 * source for the night rather than spending the rest of the run on requests
 * that are going to be refused too.
 */
export class HttpRateLimitedError extends HttpError {
  constructor(name: string, status: number, attempts: number) {
    super(`${name} returned ${status} on ${attempts} consecutive attempts`, status);
    this.name = 'HttpRateLimitedError';
  }
}

/** Milliseconds between requests to one host, when nothing overrides it. */
export const DEFAULT_INTERVAL_MS = 400;

/** First backoff after a refusal. Doubles each time: 2s, 4s, 8s. */
export const DEFAULT_BACKOFF_MS = 2000;

/** Attempts per request, including the first. */
export const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * How long one request may take before it is abandoned.
 *
 * 30 seconds, the same deadline `wikidata.ts` and `opencritic.ts` use. A
 * deadline matters more here than the number does: the limiter is strictly
 * serial, so a host that accepts a connection and then never answers would
 * otherwise hold the whole source -- and every source after it -- until the
 * workflow's own 30-minute kill, which could land between an upsert and its
 * close-out. An abort is a normal failure that the retry and the per-source
 * fail-soft already know what to do with.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** The longest a `Retry-After` header is allowed to make us wait. */
export const MAX_RETRY_AFTER_MS = 60_000;

export interface JsonClientOptions {
  /** Names the host in error messages and log lines. */
  name: string;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

/**
 * A paced, retrying JSON client for one host.
 *
 * Deliberately the {@link IntervalLimiter} shape rather than the
 * {@link import('./rate-limit').RateLimiter} one, for the same reason
 * `SteamStorefrontClient` is: a published allowance ("4 a second, 8 at once")
 * is a budget to spend, while an undocumented endpoint is a pace to keep. Two
 * of these three hosts publish no allowance at all, and the third
 * (IsThereAnyDeal, 1,000 requests per five minutes) is not remotely a
 * constraint for a job that makes a few dozen calls a night. So: one request at
 * a time per host, a floor on the gap between starts, and a refusal slows every
 * later request down rather than only the one that was refused.
 *
 * `Retry-After` is honoured when the host sends one, which IsThereAnyDeal
 * documents it does on a 429, and capped so a hostile or mistaken header cannot
 * park the job for an hour.
 */
export class JsonClient {
  private readonly name: string;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: IntervalLimiter;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly timeoutMs: number;

  /** Requests actually sent, retries included. */
  requestCount = 0;
  retryCount = 0;

  constructor(options: JsonClientOptions) {
    this.name = options.name;
    this.clock = options.clock ?? systemClock;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.limiter = new IntervalLimiter({
      intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
      clock: this.clock,
    });
  }

  async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>(url, { method: 'GET', headers });
  }

  async postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<T> {
    let attempt = 0;

    for (;;) {
      attempt += 1;

      const response = await this.limiter.run(async () => {
        this.requestCount += 1;
        return this.fetchImpl(url, {
          method: init.method,
          headers: {
            Accept: 'application/json',
            'User-Agent': AVAILABILITY_USER_AGENT,
            ...init.headers,
          },
          ...(init.body === undefined ? {} : { body: init.body }),
          ...requestTimeout(this.timeoutMs),
        });
      });

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          // An HTML error page behind a 200 is a normal outcome for an
          // undocumented endpoint, not a bug. One source's data, lost.
          throw new HttpError(`${this.name} returned unparseable JSON`, response.status);
        }
      }

      const refused = response.status === 429;
      const retryable = refused || response.status >= 500;

      if (!retryable) {
        throw new HttpError(`${this.name} returned ${response.status}`, response.status);
      }

      if (attempt >= this.maxAttempts) {
        if (refused) throw new HttpRateLimitedError(this.name, response.status, attempt);
        throw new HttpError(
          `${this.name} returned ${response.status} after ${attempt} attempts`,
          response.status,
        );
      }

      this.retryCount += 1;
      // Capped, so a hostile or mistaken header cannot park a nightly job for
      // an hour. `wikidata.ts` does not cap because the Query Service's own
      // documented ceiling is the cap there; these three hosts promise nothing.
      const asked = retryAfterMs(response.headers.get('retry-after'), this.clock.now());
      const backoff =
        asked === null ? this.backoffMs * 2 ** (attempt - 1) : Math.min(asked, MAX_RETRY_AFTER_MS);
      // Slow every later request to this host down too, not just this retry.
      if (refused) this.limiter.pause(backoff);
      await this.clock.sleep(backoff);
    }
  }
}
