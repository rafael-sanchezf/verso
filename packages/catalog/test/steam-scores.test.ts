import { describe, expect, it } from 'vitest';
import type { CatalogStore } from '../src/db';
import type { Clock } from '../src/rate-limit';
import { SteamStorefrontClient } from '../src/steam';
import { DEFAULT_STALE_HOURS, REQUESTS_PER_GAME, runSteamScores } from '../src/steam-scores';
import type { ExternalScoreRow, SteamScoreTarget } from '../src/types';

class TestClock implements Clock {
  time = 0;
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.time += ms;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const NOW = new Date('2026-09-16T11:00:00.000Z');

/** A store stand-in: a fixed target list and a record of everything written. */
function fakeStore(targets: SteamScoreTarget[]) {
  const asked: Array<{ staleBefore: Date; limit: number; popularLimit?: number }> = [];
  const scores: ExternalScoreRow[] = [];
  const urls: Array<{ media_item_id: string; url: string }> = [];

  const store = {
    async steamScoreTargets(options: {
      staleBefore: Date;
      limit: number;
      popularLimit?: number;
    }) {
      asked.push(options);
      return targets.slice(0, options.limit);
    },
    async upsertExternalScores(rows: ExternalScoreRow[]) {
      scores.push(...rows);
      return rows.length;
    },
    async setMetacriticUrls(rows: Array<{ media_item_id: string; url: string }>) {
      urls.push(...rows);
      return rows.length;
    },
  } as unknown as CatalogStore;

  return { store, asked, scores, urls };
}

const target = (n: number, tracked = false): SteamScoreTarget => ({
  media_item_id: `uuid-${n}`,
  steam_app_id: 1000 + n,
  tracked,
});

/**
 * A storefront stand-in. Answers both endpoints for any app id, and can be
 * told to refuse from a given request onwards.
 */
function fakeStorefront(options: { refuseFrom?: number; failFrom?: number } = {}) {
  const urls: string[] = [];

  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);

    if (options.refuseFrom !== undefined && urls.length >= options.refuseFrom) {
      return json({}, 429);
    }
    if (options.failFrom !== undefined && urls.length >= options.failFrom) {
      return json({}, 404);
    }

    if (url.includes('/appreviews/')) {
      return json({
        success: 1,
        query_summary: { total_positive: 90, total_negative: 10, total_reviews: 100 },
      });
    }

    const appId = /appids=(\d+)/.exec(url)?.[1] ?? '0';
    return json({
      [appId]: {
        success: true,
        data: { metacritic: { score: 88, url: `https://www.metacritic.com/game/pc/${appId}` } },
      },
    });
  }) as unknown as typeof fetch;

  return { impl, urls };
}

function client(impl: typeof fetch, budget: number): SteamStorefrontClient {
  return new SteamStorefrontClient({ clock: new TestClock(), fetchImpl: impl, budget });
}

const silent = () => {};

describe('runSteamScores: what it writes', () => {
  it('writes one steam row and one metacritic row per game', async () => {
    const storefront = fakeStorefront();
    const { store, scores } = fakeStore([target(1), target(2)]);

    const result = await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, log: silent },
    );

    expect(result.fetched).toBe(2);
    expect(scores.map((row) => `${row.media_item_id}:${row.source}`)).toEqual([
      'uuid-1:steam',
      'uuid-1:metacritic',
      'uuid-2:steam',
      'uuid-2:metacritic',
    ]);
  });

  it('stores the positive percentage and the review count for steam', async () => {
    const storefront = fakeStorefront();
    const { store, scores } = fakeStore([target(1)]);

    await runSteamScores({ client: client(storefront.impl, 100), store }, { now: NOW, log: silent });

    expect(scores[0]).toEqual({
      media_item_id: 'uuid-1',
      source: 'steam',
      score: 90,
      score_count: 100,
    });
  });

  it('stores the metascore with no count, and keeps the Metacritic page', async () => {
    const storefront = fakeStorefront();
    const { store, scores, urls } = fakeStore([target(1)]);

    await runSteamScores({ client: client(storefront.impl, 100), store }, { now: NOW, log: silent });

    expect(scores[1]).toEqual({
      media_item_id: 'uuid-1',
      source: 'metacritic',
      score: 88,
      score_count: null,
    });
    expect(urls).toEqual([
      { media_item_id: 'uuid-1', url: 'https://www.metacritic.com/game/pc/1001' },
    ]);
  });

  it('never stores the phrase: the two numbers are the whole record', async () => {
    const storefront = fakeStorefront();
    const { store, scores } = fakeStore([target(1)]);

    await runSteamScores({ client: client(storefront.impl, 100), store }, { now: NOW, log: silent });

    for (const row of scores) {
      expect(Object.keys(row).sort()).toEqual(['media_item_id', 'score', 'score_count', 'source']);
    }
  });

  it('asks for reviews before the metascore, so a half-finished game keeps the better half', async () => {
    const storefront = fakeStorefront();
    const { store } = fakeStore([target(1)]);

    await runSteamScores({ client: client(storefront.impl, 100), store }, { now: NOW, log: silent });

    expect(storefront.urls[0]).toContain('/appreviews/');
    expect(storefront.urls[1]).toContain('/api/appdetails');
  });

  it('writes nothing on a dry run but still reads', async () => {
    const storefront = fakeStorefront();
    const { store, scores, urls } = fakeStore([target(1)]);

    const result = await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, dryRun: true, log: silent },
    );

    expect(result.fetched).toBe(1);
    expect(scores).toEqual([]);
    expect(urls).toEqual([]);
  });
});

describe('runSteamScores: the budget', () => {
  it('asks for only as many games as the budget can pay for', async () => {
    const storefront = fakeStorefront();
    const { store, asked } = fakeStore(Array.from({ length: 50 }, (_, i) => target(i)));

    await runSteamScores(
      { client: client(storefront.impl, 10), store },
      { now: NOW, budget: 10, log: silent },
    );

    expect(asked[0]!.limit).toBe(10 / REQUESTS_PER_GAME);
  });

  it('cannot spend more than the client\'s own cap, whatever is asked for', async () => {
    const storefront = fakeStorefront();
    const { store, asked } = fakeStore(Array.from({ length: 50 }, (_, i) => target(i)));

    await runSteamScores(
      { client: client(storefront.impl, 6), store },
      { now: NOW, budget: 10_000, log: silent },
    );

    expect(asked[0]!.limit).toBe(3);
    expect(storefront.urls.length).toBeLessThanOrEqual(6);
  });

  it('stops cleanly when the list is longer than the budget can pay for', async () => {
    const storefront = fakeStorefront();
    const { store } = fakeStore([]);
    // A store that hands back more rows than the limit asked for. It should
    // not happen, and the run must not overspend if it ever does.
    store.steamScoreTargets = async () => Array.from({ length: 10 }, (_, i) => target(i));
    const steam = new SteamStorefrontClient({
      clock: new TestClock(),
      fetchImpl: storefront.impl,
      budget: 5,
    });

    const result = await runSteamScores({ client: steam, store }, { now: NOW, log: silent });

    expect(result.fetched).toBe(2);
    expect(result.stoppedEarly).toBe(true);
    expect(result.stoppedReason).toBe('budget');
    expect(storefront.urls).toHaveLength(4);
  });

  it('finishes normally when the whole list fits, with the budget to spare', async () => {
    const storefront = fakeStorefront();
    const { store } = fakeStore(Array.from({ length: 10 }, (_, i) => target(i)));

    const result = await runSteamScores(
      { client: client(storefront.impl, 6), store },
      { now: NOW, log: silent },
    );

    expect(result.selected).toBe(3);
    expect(result.fetched).toBe(3);
    expect(result.stoppedReason).toBe('complete');
  });
});

describe('runSteamScores: when the storefront refuses', () => {
  it('stops the whole run rather than burning the budget on refusals', async () => {
    const storefront = fakeStorefront({ refuseFrom: 3 });
    const { store, scores } = fakeStore([target(1), target(2), target(3)]);

    const result = await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, log: silent },
    );

    expect(result.stoppedReason).toBe('rate-limited');
    expect(result.fetched).toBe(1);
    // The first game's two rows landed and are committed; nothing after.
    expect(scores).toHaveLength(2);
  });

  it('skips one game and carries on when the failure is only that game\'s', async () => {
    const storefront = fakeStorefront({ failFrom: 3 });
    const { store } = fakeStore([target(1), target(2), target(3)]);

    const result = await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, log: silent },
    );

    expect(result.failed).toBe(2);
    expect(result.fetched).toBe(1);
    expect(result.stoppedReason).toBe('complete');
  });
});

describe('runSteamScores: staleness and resuming', () => {
  it('asks for games whose steam row is older than the default window', async () => {
    const storefront = fakeStorefront();
    const { store, asked } = fakeStore([]);

    await runSteamScores({ client: client(storefront.impl, 100), store }, { now: NOW, log: silent });

    expect(DEFAULT_STALE_HOURS).toBe(20);
    expect(asked[0]!.staleBefore.toISOString()).toBe('2026-09-15T15:00:00.000Z');
  });

  it('takes a staleness window from the caller', async () => {
    const storefront = fakeStorefront();
    const { store, asked } = fakeStore([]);

    await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, staleHours: 1, log: silent },
    );

    expect(asked[0]!.staleBefore.toISOString()).toBe('2026-09-16T10:00:00.000Z');
  });

  it('passes the popular-set size through', async () => {
    const storefront = fakeStorefront();
    const { store, asked } = fakeStore([]);

    await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, popularLimit: 12, log: silent },
    );

    expect(asked[0]!.popularLimit).toBe(12);
  });

  it('writes each game as it goes, so a run cut short leaves finished work committed', async () => {
    const storefront = fakeStorefront({ refuseFrom: 5 });
    const written: string[] = [];
    const { store } = fakeStore([target(1), target(2), target(3)]);
    const original = store.upsertExternalScores.bind(store);
    store.upsertExternalScores = async (rows: ExternalScoreRow[]) => {
      written.push(rows[0]!.media_item_id);
      return original(rows);
    };

    await runSteamScores({ client: client(storefront.impl, 100), store }, { now: NOW, log: silent });

    // Two games finished and were written before the third was refused.
    expect(written).toEqual(['uuid-1', 'uuid-2']);
  });

  it('does nothing at all, and asks for nothing, when everything is fresh', async () => {
    const storefront = fakeStorefront();
    const { store } = fakeStore([]);

    const result = await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, log: silent },
    );

    expect(result).toMatchObject({ selected: 0, fetched: 0, requests: 0, stoppedReason: 'complete' });
    expect(storefront.urls).toEqual([]);
  });
});

describe('runSteamScores: the report it returns', () => {
  it('counts what it did, for the workflow log', async () => {
    const storefront = fakeStorefront();
    const { store } = fakeStore([target(1, true), target(2)]);

    const result = await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, log: silent },
    );

    expect(result).toMatchObject({
      selected: 2,
      fetched: 2,
      reviewScores: 2,
      metacriticScores: 2,
      scoresUpserted: 4,
      metacriticUrlsUpdated: 2,
      failed: 0,
      requests: 4,
      retries: 0,
      stoppedEarly: false,
    });
  });

  it('says how many of the selected games a user actually tracks', async () => {
    const storefront = fakeStorefront();
    const { store } = fakeStore([target(1, true), target(2, true), target(3)]);
    const lines: string[] = [];

    await runSteamScores(
      { client: client(storefront.impl, 100), store },
      { now: NOW, log: (line) => lines.push(line) },
    );

    expect(lines[0]).toContain('2 tracked by a user');
    expect(lines[0]).toContain('1 popular');
  });
});
