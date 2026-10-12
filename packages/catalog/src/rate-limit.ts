/**
 * The clock the limiter reads and sleeps on. Injected so tests can run
 * virtual time instead of waiting a real second.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface RateLimiterOptions {
  /** Maximum starts per rolling second. IGDB allows 4. */
  perSecond: number;
  /** Maximum requests outstanding at once. IGDB allows 8. */
  maxInFlight: number;
  clock?: Clock;
}

/**
 * A rolling-window rate limiter with a concurrency cap.
 *
 * IGDB enforces both limits at once: 4 requests per second and at most 8 open
 * at a time. Exceeding either returns 429. The window is rolling rather than
 * fixed, so the limiter records the start time of each admitted request and
 * sleeps until the oldest one falls out of the last second.
 *
 * Admission is serialized through a promise chain, so two callers racing at
 * the same instant cannot both read a window with one slot left and both take
 * it.
 */
export class RateLimiter {
  private readonly windowMs = 1000;
  private perSecond: number;
  private readonly maxInFlight: number;
  private readonly clock: Clock;

  /** Start timestamps of requests admitted within the last window. */
  private recent: number[] = [];
  private inFlight = 0;
  private slotWaiters: Array<() => void> = [];
  private admission: Promise<void> = Promise.resolve();

  /** Peak concurrency observed, for tests and for the sync's log line. */
  peakInFlight = 0;

  constructor(options: RateLimiterOptions) {
    this.perSecond = options.perSecond;
    this.maxInFlight = options.maxInFlight;
    this.clock = options.clock ?? systemClock;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** The ceiling currently in force, for a log line and for the tests. */
  get requestsPerSecond(): number {
    return this.perSecond;
  }

  /**
   * Lower or raise the starts-per-second ceiling for the rest of the run.
   *
   * IGDB's allowance is published and fixed, so nothing in the games mirror
   * ever calls this. TMDB's is not: the documentation says the limits "sit
   * somewhere in the 40 requests per second range" and can change without
   * notice (docs/research/film-tv-data-sources.md 2.3), so the TMDB client
   * halves its own pace when a second 429 in a row says the published figure
   * is not what is being enforced today. Mutating the ceiling rather than
   * building a second limiter keeps the in-flight accounting intact: a
   * request admitted under the old pace still releases its slot on the same
   * object it took one from.
   *
   * Never below one start a second, so a run that keeps being refused slows
   * to a crawl rather than to a stop.
   */
  setPerSecond(perSecond: number): void {
    this.perSecond = Math.max(1, perSecond);
  }

  private async acquire(): Promise<void> {
    const previous = this.admission;
    let admitted!: () => void;
    this.admission = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    await previous;

    try {
      for (;;) {
        const now = this.clock.now();
        this.recent = this.recent.filter((start) => now - start < this.windowMs);

        if (this.inFlight >= this.maxInFlight) {
          await this.waitForSlot();
          continue;
        }

        if (this.recent.length >= this.perSecond) {
          const oldest = this.recent[0]!;
          await this.clock.sleep(this.windowMs - (now - oldest));
          continue;
        }

        this.recent.push(now);
        this.inFlight += 1;
        this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
        return;
      }
    } finally {
      admitted();
    }
  }

  private waitForSlot(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.slotWaiters.push(resolve);
    });
  }

  private release(): void {
    this.inFlight -= 1;
    const waiter = this.slotWaiters.shift();
    if (waiter) waiter();
  }
}

export interface IntervalLimiterOptions {
  /** Minimum milliseconds between the start of one request and the next. */
  intervalMs: number;
  clock?: Clock;
}

/**
 * A strictly serial limiter: one request at a time, with a floor on the gap
 * between consecutive starts.
 *
 * Deliberately not {@link RateLimiter}. That one models a published allowance
 * ("4 a second, 8 at once") and is built to use all of it. Steam's storefront
 * publishes no allowance at all: it is undocumented, Valve says it "may change
 * at any time without notice", and the community's observed ceiling is about
 * 200 `appdetails` calls per five minutes per IP before 429s and 403s start
 * (docs/research/game-data-sources.md 2.5). Against an endpoint like that the
 * right shape is not a budget to spend but a pace to keep: never two requests
 * in flight, never two starts closer together than the interval.
 *
 * The gap is measured start to start, so a slow response is not punished with
 * an extra wait on top of the time it already took.
 */
export class IntervalLimiter {
  private readonly intervalMs: number;
  private readonly clock: Clock;

  /** When the next request may start. */
  private nextAt = Number.NEGATIVE_INFINITY;
  /** Serializes admission, so two callers cannot claim the same slot. */
  private admission: Promise<void> = Promise.resolve();

  /** Total milliseconds spent waiting, for the run's log line. */
  waitedMs = 0;

  constructor(options: IntervalLimiterOptions) {
    this.intervalMs = options.intervalMs;
    this.clock = options.clock ?? systemClock;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.admission;
    let done!: () => void;
    this.admission = new Promise<void>((resolve) => {
      done = resolve;
    });
    await previous;

    try {
      const wait = this.nextAt - this.clock.now();
      if (wait > 0) {
        this.waitedMs += wait;
        await this.clock.sleep(wait);
      }
      this.nextAt = this.clock.now() + this.intervalMs;
      return await fn();
    } finally {
      done();
    }
  }

  /**
   * Push the next allowed start out by `ms`, on top of the usual interval.
   *
   * What a 429 or a 403 buys: the backoff is a property of the endpoint, not
   * of one request, so it has to slow every caller down rather than only the
   * one that was refused.
   */
  pause(ms: number): void {
    this.nextAt = Math.max(this.nextAt, this.clock.now() + ms);
  }
}

/**
 * The `signal` half of a `fetch` init, or nothing.
 *
 * Every client here talks to an endpoint over the public internet from a
 * GitHub runner, and none of them is worth waiting on forever: without a
 * deadline a hung connection is bounded only by the workflow's own timeout, so
 * one stuck socket turns a short job into a long one that then reports
 * nothing.
 *
 * `AbortSignal.timeout` is Node 17.3 and later and every current browser, but
 * this returns an empty object where it is missing rather than throwing: a
 * runtime without it should lose the deadline, not the request. Spread into a
 * `fetch` init, an absent `signal` key is exactly the same as no timeout.
 */
export function requestTimeout(ms: number): { signal?: AbortSignal } {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? { signal: AbortSignal.timeout(ms) }
    : {};
}
