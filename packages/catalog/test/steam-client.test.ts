import { describe, expect, it } from 'vitest';
import { IntervalLimiter, type Clock } from '../src/rate-limit';
import {
  SteamBudgetExhaustedError,
  SteamRateLimitedError,
  SteamStorefrontClient,
  SteamStorefrontError,
  STOREFRONT_BACKOFF_MS,
  STOREFRONT_INTERVAL_MS,
  STOREFRONT_RUN_BUDGET,
  STOREFRONT_USER_AGENT,
} from '../src/steam';

class TestClock implements Clock {
  time = 0;
  sleeps: number[] = [];
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.time += ms;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch stand-in that records URLs and replays queued responses. */
function fakeFetch(responses: Array<() => Response>) {
  const urls: string[] = [];
  const headers: Headers[] = [];
  let index = 0;

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers));
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next!();
  }) as unknown as typeof fetch;

  return { impl, urls, headers, get count() { return index; } };
}

const ok = () => json({ query_summary: { total_positive: 9, total_reviews: 10 } });

function client(
  impl: typeof fetch,
  clock: Clock,
  options: { budget?: number; maxAttempts?: number } = {},
): SteamStorefrontClient {
  return new SteamStorefrontClient({ clock, fetchImpl: impl, ...options });
}

describe('IntervalLimiter', () => {
  it('lets the first request straight through', async () => {
    const clock = new TestClock();
    const limiter = new IntervalLimiter({ intervalMs: 1500, clock });

    await limiter.run(async () => 'x');

    expect(clock.sleeps).toEqual([]);
  });

  it('keeps consecutive starts at least an interval apart', async () => {
    const clock = new TestClock();
    const limiter = new IntervalLimiter({ intervalMs: 1500, clock });

    await limiter.run(async () => 'a');
    await limiter.run(async () => 'b');
    await limiter.run(async () => 'c');

    expect(clock.sleeps).toEqual([1500, 1500]);
    expect(clock.time).toBe(3000);
  });

  it('measures the gap start to start, so a slow request is not punished twice', async () => {
    const clock = new TestClock();
    const limiter = new IntervalLimiter({ intervalMs: 1500, clock });

    // A request that itself takes longer than the interval.
    await limiter.run(async () => {
      await clock.sleep(2000);
    });
    clock.sleeps.length = 0;

    await limiter.run(async () => 'next');

    expect(clock.sleeps).toEqual([]);
  });

  it('serializes racing callers rather than letting them share a slot', async () => {
    const clock = new TestClock();
    const limiter = new IntervalLimiter({ intervalMs: 1000, clock });
    const starts: number[] = [];

    await Promise.all(
      [0, 1, 2].map(() =>
        limiter.run(async () => {
          starts.push(clock.now());
        }),
      ),
    );

    expect(starts).toEqual([0, 1000, 2000]);
  });

  it('pause pushes the next start out beyond the usual interval', async () => {
    const clock = new TestClock();
    const limiter = new IntervalLimiter({ intervalMs: 1000, clock });

    await limiter.run(async () => 'a');
    limiter.pause(10_000);
    await limiter.run(async () => 'b');

    expect(clock.sleeps).toEqual([10_000]);
  });

  it('counts what it waited, for the run log', async () => {
    const clock = new TestClock();
    const limiter = new IntervalLimiter({ intervalMs: 1500, clock });

    await limiter.run(async () => 'a');
    await limiter.run(async () => 'b');

    expect(limiter.waitedMs).toBe(1500);
  });
});

describe('SteamStorefrontClient: pacing', () => {
  it('defaults to one request per 1.5 seconds', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([ok]);
    const steam = client(fetcher.impl, clock);

    await steam.appReviews(1);
    await steam.appReviews(2);

    expect(STOREFRONT_INTERVAL_MS).toBe(1500);
    expect(clock.sleeps).toEqual([STOREFRONT_INTERVAL_MS]);
  });

  it('paces the two endpoints against each other, not separately', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([ok, () => json({ '1': { success: true, data: [] } })]);
    const steam = client(fetcher.impl, clock);

    await steam.appReviews(1);
    await steam.appMetacritic(1);

    expect(clock.sleeps).toEqual([STOREFRONT_INTERVAL_MS]);
  });

  it('stays far under the observed ceiling of ~200 appdetails per 5 minutes', () => {
    const fiveMinutes = 5 * 60 * 1000;
    const requestsPerWindow = fiveMinutes / STOREFRONT_INTERVAL_MS;
    // The phase alternates the two endpoints, so appdetails gets half of them.
    expect(requestsPerWindow / 2).toBeLessThan(200);
  });
});

describe('SteamStorefrontClient: the requests it makes', () => {
  it('asks appreviews for the summary only, across every language and purchase', async () => {
    const fetcher = fakeFetch([ok]);
    await client(fetcher.impl, new TestClock()).appReviews(1245620);

    const url = fetcher.urls[0]!;
    expect(url).toContain('https://store.steampowered.com/appreviews/1245620');
    expect(url).toContain('json=1');
    expect(url).toContain('language=all');
    expect(url).toContain('purchase_type=all');
    expect(url).toContain('num_per_page=0');
  });

  it('asks appdetails for the metacritic field only, on a pinned storefront', async () => {
    const fetcher = fakeFetch([() => json({ '1245620': { success: true, data: [] } })]);
    await client(fetcher.impl, new TestClock()).appMetacritic(1245620);

    const url = fetcher.urls[0]!;
    expect(url).toContain('https://store.steampowered.com/api/appdetails?appids=1245620');
    expect(url).toContain('filters=metacritic');
    expect(url).toContain('cc=us');
    expect(url).toContain('l=english');
  });

  it('names itself in the User-Agent', async () => {
    const fetcher = fakeFetch([ok]);
    await client(fetcher.impl, new TestClock()).appReviews(1);

    expect(fetcher.headers[0]!.get('user-agent')).toBe(STOREFRONT_USER_AGENT);
  });
});

describe('SteamStorefrontClient: backoff', () => {
  it('retries a 429 with exponential backoff', async () => {
    const clock = new TestClock();
    let attempts = 0;
    const fetcher = fakeFetch([
      () => {
        attempts += 1;
        return attempts < 3 ? json({ error: 'slow down' }, 429) : ok();
      },
    ]);

    const steam = client(fetcher.impl, clock);
    await expect(steam.appReviews(1)).resolves.toBeTruthy();

    expect(clock.sleeps).toContain(STOREFRONT_BACKOFF_MS);
    expect(clock.sleeps).toContain(STOREFRONT_BACKOFF_MS * 2);
    expect(steam.retryCount).toBe(2);
  });

  it('treats a 403 the same as a 429, because the storefront uses both', async () => {
    const clock = new TestClock();
    let attempts = 0;
    const fetcher = fakeFetch([
      () => {
        attempts += 1;
        return attempts < 2 ? json({}, 403) : ok();
      },
    ]);

    await expect(client(fetcher.impl, clock).appReviews(1)).resolves.toBeTruthy();
    expect(clock.sleeps).toContain(STOREFRONT_BACKOFF_MS);
  });

  it('slows every waiting request down after a refusal, not just the retry', async () => {
    const clock = new TestClock();
    const startedAt: number[] = [];
    let attempts = 0;

    const impl = (async () => {
      startedAt.push(clock.now());
      attempts += 1;
      return attempts === 1 ? json({}, 429) : ok();
    }) as unknown as typeof fetch;

    const steam = client(impl, clock);
    // Two callers in flight when the first is refused. Without the shared
    // pause the second would go out one plain interval later, straight into
    // the same refusal.
    await Promise.all([steam.appReviews(1), steam.appReviews(2)]);

    expect(startedAt[0]).toBe(0);
    expect(startedAt).toHaveLength(3);
    for (const start of startedAt.slice(1)) {
      expect(start).toBeGreaterThanOrEqual(STOREFRONT_BACKOFF_MS);
    }
  });

  it('gives up on a persistent refusal with an error the run can recognise', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 429)]);

    const steam = client(fetcher.impl, clock, { maxAttempts: 3 });
    await expect(steam.appReviews(1)).rejects.toBeInstanceOf(SteamRateLimitedError);
    expect(fetcher.count).toBe(3);
  });

  it('retries a 5xx but does not call it rate limiting', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 503)]);

    const steam = client(fetcher.impl, clock, { maxAttempts: 2 });
    const error = await steam.appReviews(1).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SteamStorefrontError);
    expect(error).not.toBeInstanceOf(SteamRateLimitedError);
  });

  it('does not retry a 404', async () => {
    const fetcher = fakeFetch([() => json({}, 404)]);
    const steam = client(fetcher.impl, new TestClock());

    await expect(steam.appReviews(1)).rejects.toThrow(/404/);
    expect(fetcher.count).toBe(1);
  });

  it('treats an HTML error page served as 200 as one game\'s bad luck', async () => {
    const fetcher = fakeFetch([
      () => new Response('<html>sorry</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ]);

    await expect(client(fetcher.impl, new TestClock()).appReviews(1)).rejects.toThrow(
      /unparseable JSON/,
    );
  });
});

describe('SteamStorefrontClient: the run budget', () => {
  it('defaults to a few hundred calls', () => {
    expect(STOREFRONT_RUN_BUDGET).toBe(400);
  });

  it('refuses once the budget is spent', async () => {
    const fetcher = fakeFetch([ok]);
    const steam = client(fetcher.impl, new TestClock(), { budget: 2 });

    await steam.appReviews(1);
    await steam.appReviews(2);

    expect(steam.exhausted).toBe(true);
    await expect(steam.appReviews(3)).rejects.toBeInstanceOf(SteamBudgetExhaustedError);
    expect(fetcher.count).toBe(2);
  });

  it('counts retries against the budget, so a bad night cannot overspend', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 429)]);
    const steam = client(fetcher.impl, clock, { budget: 3, maxAttempts: 10 });

    await expect(steam.appReviews(1)).rejects.toBeInstanceOf(SteamBudgetExhaustedError);
    expect(fetcher.count).toBe(3);
    expect(steam.requestCount).toBe(3);
  });

  it('reports what is left', async () => {
    const fetcher = fakeFetch([ok]);
    const steam = client(fetcher.impl, new TestClock(), { budget: 5 });

    expect(steam.remaining).toBe(5);
    await steam.appReviews(1);
    expect(steam.remaining).toBe(4);
  });

  it('a whole nightly run fits in about ten minutes of wall clock', () => {
    const wallClockMs = STOREFRONT_RUN_BUDGET * STOREFRONT_INTERVAL_MS;
    expect(wallClockMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});
