import { describe, expect, it } from 'vitest';
import { mapOpenCriticScores } from '../src/map';
import {
  OpenCriticBudgetExhaustedError,
  OpenCriticClient,
  OpenCriticError,
  OpenCriticNotFoundError,
  OpenCriticRateLimitedError,
  OPENCRITIC_BACKOFF_MS,
  OPENCRITIC_INTERVAL_MS,
  OPENCRITIC_RAPIDAPI_HOST,
  OPENCRITIC_RUN_BUDGET,
} from '../src/opencritic';
import type { Clock } from '../src/rate-limit';
import type { OpenCriticGame } from '../src/types';
import game from './fixtures/opencritic-game.json';
import fewReviews from './fixtures/opencritic-game-few-reviews.json';
import fractional from './fixtures/opencritic-game-fractional-recommended.json';
import unscored from './fixtures/opencritic-game-unscored.json';

const KEY = 'test-key-not-a-real-one';
const ITEM = '11111111-1111-4111-8111-111111111111';

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

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

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

  return {
    impl,
    urls,
    headers,
    get count() {
      return index;
    },
  };
}

function client(
  impl: typeof fetch,
  clock: Clock,
  options: { budget?: number; maxAttempts?: number } = {},
): OpenCriticClient {
  return new OpenCriticClient({ apiKey: KEY, clock, fetchImpl: impl, ...options });
}

describe('mapOpenCriticScores', () => {
  it('maps a reviewed game onto both rows, over the Top Critic count', () => {
    const result = mapOpenCriticScores(ITEM, 12090, game as OpenCriticGame);

    expect(result.topCritic).toEqual({
      media_item_id: ITEM,
      source: 'opencritic',
      // numeric(5,2): rounded to two decimals here so Postgres never has to.
      score: 94.51,
      score_count: 70,
    });
    expect(result.recommended).toEqual({
      media_item_id: ITEM,
      source: 'opencritic_recommended',
      score: 97.14,
      score_count: 70,
    });
  });

  it('carries the OpenCritic id through, so the caller can name it in a log line', () => {
    expect(mapOpenCriticScores(ITEM, 12090, game as OpenCriticGame).opencritic_id).toBe(12090);
  });

  it('writes nothing for a game with no Top Critic reviews, sentinel or not', () => {
    // topCriticScore is -1 here, not absent: the count is the gate.
    const result = mapOpenCriticScores(ITEM, 17890, unscored as OpenCriticGame);

    expect(result.topCritic).toBeNull();
    expect(result.recommended).toBeNull();
  });

  it('keeps the average when only percent recommended is a sentinel', () => {
    const result = mapOpenCriticScores(ITEM, 14567, fewReviews as OpenCriticGame);

    expect(result.topCritic).toMatchObject({ source: 'opencritic', score: 68, score_count: 3 });
    expect(result.recommended).toBeNull();
  });

  it('refuses a figure outside 0-100 rather than storing a number the badge cannot show', () => {
    const wild = { numTopCriticReviews: 12, topCriticScore: 940, percentRecommended: 101 };
    const result = mapOpenCriticScores(ITEM, 1, wild);

    expect(result.topCritic).toBeNull();
    expect(result.recommended).toBeNull();
  });

  it('keeps a real zero, which is a verdict and not a missing value', () => {
    const awful = { numTopCriticReviews: 4, topCriticScore: 0, percentRecommended: 0 };
    const result = mapOpenCriticScores(ITEM, 1, awful);

    expect(result.topCritic).toMatchObject({ score: 0, score_count: 4 });
    expect(result.recommended).toMatchObject({ score: 0, score_count: 4 });
  });

  it('copes with an empty response object', () => {
    const result = mapOpenCriticScores(ITEM, 1, {});

    expect(result.topCritic).toBeNull();
    expect(result.recommended).toBeNull();
    expect(result.recommendedScaleSuspect).toBe(false);
  });

  it('refuses a percentRecommended that reads as a fraction, and says so', () => {
    // 0.9714 passes "is it between 0 and 100" while meaning 97.14%. Storing it
    // would print "0.97" under a label reading percent recommended.
    const result = mapOpenCriticScores(ITEM, 12090, fractional as OpenCriticGame);

    expect(result.recommended).toBeNull();
    expect(result.recommendedScaleSuspect).toBe(true);
    // The average carries no such ambiguity and is still written.
    expect(result.topCritic).toMatchObject({ source: 'opencritic', score: 94.51 });
  });

  it('keeps 0 and 1 exactly, which are legitimate on the percentage scale', () => {
    const none = mapOpenCriticScores(ITEM, 1, {
      numTopCriticReviews: 5,
      percentRecommended: 0,
    });
    const one = mapOpenCriticScores(ITEM, 1, {
      numTopCriticReviews: 5,
      percentRecommended: 1,
    });

    expect(none.recommended).toMatchObject({ score: 0 });
    expect(none.recommendedScaleSuspect).toBe(false);
    expect(one.recommended).toMatchObject({ score: 1 });
    expect(one.recommendedScaleSuspect).toBe(false);
  });

  it('applies the scale guard to the percentage only, not to the average', () => {
    // A topCriticScore below 1 is an absurd but real reading of an average of
    // published review scores; a percentage below 1 is a unit mix-up.
    const result = mapOpenCriticScores(ITEM, 1, {
      numTopCriticReviews: 5,
      topCriticScore: 0.5,
      percentRecommended: 50,
    });

    expect(result.topCritic).toMatchObject({ score: 0.5 });
    expect(result.recommendedScaleSuspect).toBe(false);
  });
});

describe('OpenCriticClient', () => {
  it('calls GET /game/{id} on the RapidAPI host and nothing else', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json(game)]);

    await client(fetcher.impl, clock).game(12090);

    expect(fetcher.urls).toEqual([`https://${OPENCRITIC_RAPIDAPI_HOST}/game/12090`]);
  });

  it('never exposes a search endpoint, so the 25 daily searches cannot be spent', () => {
    const methods = Object.getOwnPropertyNames(OpenCriticClient.prototype);

    expect(methods).toContain('game');
    expect(methods.some((name) => name.toLowerCase().includes('search'))).toBe(false);
  });

  it('sends the key in the RapidAPI headers and never in the URL', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json(game)]);

    await client(fetcher.impl, clock).game(12090);

    expect(fetcher.headers[0]!.get('x-rapidapi-key')).toBe(KEY);
    expect(fetcher.headers[0]!.get('x-rapidapi-host')).toBe(OPENCRITIC_RAPIDAPI_HOST);
    expect(fetcher.urls[0]).not.toContain(KEY);
  });

  it('keeps consecutive requests an interval apart, well inside the 4 a second allowed', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json(game)]);
    const api = client(fetcher.impl, clock);

    await api.game(1);
    await api.game(2);

    expect(clock.sleeps).toEqual([OPENCRITIC_INTERVAL_MS]);
    expect(OPENCRITIC_INTERVAL_MS).toBeGreaterThanOrEqual(250);
  });

  it('turns a 404 into an answer about one game, not a failure of the run', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({ message: 'not found' }, 404)]);

    const error = await client(fetcher.impl, clock)
      .game(99999)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OpenCriticNotFoundError);
    expect((error as OpenCriticNotFoundError).openCriticId).toBe(99999);
    // Not retried: a 404 is not going to become a 200.
    expect(fetcher.count).toBe(1);
  });

  it('never puts the key in an error message', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 403)]);

    const error = await client(fetcher.impl, clock)
      .game(1)
      .catch((e: unknown) => e);

    expect(String(error)).not.toContain(KEY);
    expect(error).toBeInstanceOf(OpenCriticError);
  });

  it('ends the run on the first 429, without spending a request retrying it', async () => {
    const clock = new TestClock();
    // Two hundred requests a day against a ceiling of four a second means a
    // 429 is almost always the day's quota, which no backoff clears. A retry
    // there is a request certain to be refused, and RapidAPI counts refusals.
    const fetcher = fakeFetch([() => json({}, 429, { 'retry-after': '30' }), () => json(game)]);
    const api = client(fetcher.impl, clock);

    await expect(api.game(12090)).rejects.toThrow(OpenCriticRateLimitedError);
    expect(fetcher.count).toBe(1);
    expect(api.retryCount).toBe(0);
    expect(clock.sleeps).toEqual([]);
  });

  it('says in the error why it is not retrying, not just that it stopped', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 429)]);

    const error = await client(fetcher.impl, clock)
      .game(1)
      .catch((e: unknown) => e);

    expect(String(error)).toMatch(/daily allowance/);
    expect((error as OpenCriticRateLimitedError).status).toBe(429);
  });

  it('still retries a 5xx, which is the server having a moment and not a quota', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 503), () => json(game)]);
    const api = client(fetcher.impl, clock);

    await api.game(12090);

    expect(api.retryCount).toBe(1);
    expect(clock.sleeps).toEqual([OPENCRITIC_BACKOFF_MS]);
  });

  it('honours a Retry-After on a 5xx when it asks for longer than our backoff', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 503, { 'retry-after': '30' }), () => json(game)]);

    await client(fetcher.impl, clock).game(12090);

    expect(clock.sleeps).toEqual([30_000]);
  });

  it('gives up on one game after its 5xx attempts, without ending the run', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 500)]);

    const error = await client(fetcher.impl, clock, { maxAttempts: 2 })
      .game(1)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OpenCriticError);
    expect(error).not.toBeInstanceOf(OpenCriticRateLimitedError);
    expect(fetcher.count).toBe(2);
  });

  it('gives every request a deadline, so a hung socket cannot eat the workflow', async () => {
    const clock = new TestClock();
    const inits: RequestInit[] = [];
    const impl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      inits.push(init ?? {});
      return json(game);
    }) as unknown as typeof fetch;

    await new OpenCriticClient({ apiKey: KEY, clock, fetchImpl: impl }).game(12090);

    expect(inits[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it('counts every attempt against the budget and refuses once it is spent', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json(game)]);
    const api = client(fetcher.impl, clock, { budget: 2 });

    await api.game(1);
    await api.game(2);

    expect(api.remaining).toBe(0);
    await expect(api.game(3)).rejects.toThrow(OpenCriticBudgetExhaustedError);
    expect(fetcher.count).toBe(2);
  });

  it('defaults to a budget that leaves headroom in the free tier', () => {
    // 200 requests a day on the Basic plan; a scheduled run takes 150 so a
    // manual dispatch the same day is not refused.
    expect(OPENCRITIC_RUN_BUDGET).toBe(150);
    expect(OPENCRITIC_RUN_BUDGET).toBeLessThan(200);
  });
});
