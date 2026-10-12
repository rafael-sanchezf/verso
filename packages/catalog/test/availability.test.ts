/**
 * `runAvailability` end to end, with a fake store and an injected fetch.
 *
 * The two things worth pinning here are the ones a screen depends on and a
 * reader cannot see from the SQL: that a source which fails takes only itself
 * down, and that a source which comes back empty never closes out the service
 * it failed to describe. The second is the dangerous one -- a single bad night
 * at an undocumented endpoint would otherwise tell every user that every game
 * has left Game Pass.
 */

import { describe, expect, it } from 'vitest';
import { runAvailability, type AvailabilityDeps } from '../src/availability';
import type { CatalogStore } from '../src/db';
import { GamePassClient } from '../src/gamepass';
import { GeForceNowClient, GFN_GAME_LIST_URL } from '../src/gfn';
import { ItadClient } from '../src/itad';
import type { Clock } from '../src/rate-limit';
import type { AvailabilityRow, CatalogTitleRow, ItadTarget } from '../src/types';

class TestClock implements Clock {
  time = 0;
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.time += ms;
  }
}

const NOW = new Date('2026-09-17T04:00:00.000Z');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Catalog rows the fake store answers with. Keyed by how the tests refer to them. */
const CATALOG: CatalogTitleRow[] = [
  { media_item_id: 'item-plague', title: 'A Plague Tale: Requiem' },
  { media_item_id: 'item-way-out', title: 'A Way Out' },
  { media_item_id: 'item-hole', title: 'A Game About Digging A Hole' },
  { media_item_id: 'item-portal', title: 'Portal 2' },
  { media_item_id: 'item-odyssey', title: "Assassin's Creed Odyssey" },
  { media_item_id: 'item-argo', title: 'Argo' },
];

const STEAM_IDS: Record<string, string> = {
  '620': 'item-portal',
  '812140': 'item-odyssey',
  '530700': 'item-argo',
};

interface StoreCalls {
  upserts: Array<{ rows: AvailabilityRow[]; seenAt: Date }>;
  closes: Array<{ service: string; region: string; seenAt: Date }>;
  scopedCloses: Array<{ pattern: string; region: string; ids: readonly string[] }>;
}

function fakeStore(options: { titlesThrow?: boolean; itadTargets?: ItadTarget[] } = {}) {
  const calls: StoreCalls = { upserts: [], closes: [], scopedCloses: [] };

  const store = {
    async gameTitles(): Promise<CatalogTitleRow[]> {
      if (options.titlesThrow) throw new Error('the catalog is unreachable');
      return CATALOG;
    },
    async gamesBySteamAppId(appIds: readonly number[]) {
      return appIds
        .map((appId) => ({ media_item_id: STEAM_IDS[String(appId)]!, key: String(appId) }))
        .filter((row) => row.media_item_id !== undefined);
    },
    async itadTargets(): Promise<ItadTarget[]> {
      return options.itadTargets ?? [];
    },
    async upsertAvailability(rows: AvailabilityRow[], seenAt: Date) {
      calls.upserts.push({ rows, seenAt });
      return rows.length;
    },
    async closeMissingAvailability(service: string, region: string, seenAt: Date) {
      calls.closes.push({ service, region, seenAt });
      return 0;
    },
    async closeMissingAvailabilityForItems(
      pattern: string,
      region: string,
      _seenAt: Date,
      ids: readonly string[],
    ) {
      calls.scopedCloses.push({ pattern, region, ids });
      return 0;
    },
  } as unknown as CatalogStore;

  return { store, calls };
}

const GFN_LIST = [
  { id: 1, title: 'Portal 2', steamUrl: 'https://store.steampowered.com/app/620', store: 'Steam' },
  {
    id: 2,
    title: 'Assassin’s Creed® Odyssey',
    steamUrl: 'https://store.steampowered.com/app/812140',
    store: 'Steam',
  },
  { id: 3, title: 'Alan Wake', steamUrl: '', store: 'Epic' },
];

const SIGL = (ids: string[]) => [{ siglId: 'header', title: 'All Console Games' }, ...ids.map((id) => ({ id }))];

const PRODUCTS = (entries: Array<[string, string]>) => ({
  Products: entries.map(([ProductId, ProductTitle]) => ({
    ProductId,
    LocalizedProperties: [{ ProductTitle }],
  })),
});

/**
 * A stand-in for all three hosts at once, keyed on the URL. Each entry is
 * either a Response factory or an Error to throw.
 */
function fakeInternet(routes: Array<[RegExp, (url: string) => Response]>) {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    for (const [pattern, answer] of routes) {
      if (pattern.test(url)) return answer(url);
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { impl, urls };
}

/**
 * The displaycatalog stand-in, answering only about the ids it was asked for.
 *
 * Which is the point: each collection sends its own `bigIds`, so a route that
 * answered with every product regardless would silently put every game in every
 * collection and make the per-service assertions meaningless.
 */
function displayCatalogRoute(
  catalogue: Record<string, string>,
): [RegExp, (url: string) => Response] {
  return [
    /displaycatalog/,
    (url) => {
      const asked = (url.split('bigIds=')[1]?.split('&')[0] ?? '').split(',').filter(Boolean);
      return json(
        PRODUCTS(
          asked
            .filter((id) => catalogue[id] !== undefined)
            .map((id) => [id, catalogue[id]!] as [string, string]),
        ),
      );
    },
  ];
}

const GAME_PASS_TITLES: Record<string, string> = {
  '9ND0JVB184XL': 'A Plague Tale: Requiem',
  '9NGLST31DG26': 'A Game About Digging A Hole\u2122',
  BWVBNCMF22ZK: 'A Way Out',
};

function clients(impl: typeof fetch, itadKey?: string): Omit<AvailabilityDeps, 'store'> {
  const clock = new TestClock();
  return {
    gfn: new GeForceNowClient({ fetchImpl: impl, clock, maxAttempts: 1 }),
    gamePass: new GamePassClient({ fetchImpl: impl, clock, maxAttempts: 1 }),
    itad: itadKey
      ? new ItadClient({ apiKey: itadKey, fetchImpl: impl, clock, maxAttempts: 1 })
      : null,
  };
}

/** Everything answering normally: three GFN games, one product per collection. */
function happyRoutes(): Array<[RegExp, (url: string) => Response]> {
  return [
    [/nvidiagrid\.net/, () => json(GFN_LIST)],
    [/sigls\/v2\?id=f6f1f99f/, () => json(SIGL(['9ND0JVB184XL']))],
    [/sigls\/v2\?id=fdd9e2a7/, () => json(SIGL(['9NGLST31DG26']))],
    [/sigls\/v2\?id=b8900d09/, () => json(SIGL(['BWVBNCMF22ZK']))],
    displayCatalogRoute(GAME_PASS_TITLES),
  ];
}

const silent = () => {};

describe('runAvailability', () => {
  it('writes one service per source and closes each one out', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet(happyRoutes());

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['geforce-now', 'game-pass'], log: silent },
    );

    expect(result.ok).toBe(true);
    expect(result.region).toBe('US');

    const written = calls.upserts.flatMap((call) => call.rows);
    expect(written).toEqual([
      { media_item_id: 'item-portal', service: 'geforce_now', region: 'US', source_ref: '1' },
      { media_item_id: 'item-odyssey', service: 'geforce_now', region: 'US', source_ref: '2' },
      { media_item_id: 'item-plague', service: 'game_pass_console', region: 'US', source_ref: '9ND0JVB184XL' },
      { media_item_id: 'item-hole', service: 'game_pass_pc', region: 'US', source_ref: '9NGLST31DG26' },
      { media_item_id: 'item-way-out', service: 'ea_play', region: 'US', source_ref: 'BWVBNCMF22ZK' },
    ]);

    expect(calls.closes.map((call) => call.service)).toEqual([
      'geforce_now',
      'game_pass_console',
      'game_pass_pc',
      'ea_play',
    ]);
  });

  it('gives every row of the run the run’s single instant', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet(happyRoutes());

    await runAvailability({ store, ...clients(impl) }, { now: NOW, sources: ['game-pass'], log: silent });

    // Non-empty first: a `for` over nothing passes for the wrong reason.
    expect(calls.upserts.length).toBe(3);
    expect(calls.closes.length).toBe(3);
    for (const call of calls.upserts) expect(call.seenAt).toBe(NOW);
    for (const call of calls.closes) expect(call.seenAt).toBe(NOW);
  });

  it('matches a trademarked storefront title to the plain catalog title', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet(happyRoutes());

    await runAvailability({ store, ...clients(impl) }, { now: NOW, sources: ['game-pass'], log: silent });

    expect(calls.upserts.flatMap((call) => call.rows)).toContainEqual({
      media_item_id: 'item-hole',
      service: 'game_pass_pc',
      region: 'US',
      source_ref: '9NGLST31DG26',
    });
  });

  it('skips a product whose title is not in the catalog rather than guessing', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet([
      ...happyRoutes().filter(([pattern]) => !/displaycatalog/.test(String(pattern))),
      displayCatalogRoute({
        '9ND0JVB184XL': 'A Game We Do Not Mirror',
        '9NGLST31DG26': 'Another One',
        BWVBNCMF22ZK: 'A Way Out',
      }),
    ]);

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['game-pass'], log: silent },
    );

    const gamePass = result.outcomes[0]!;
    expect(gamePass.matched).toBe(1);
    expect(gamePass.counts.unmatched).toBe(2);
    expect(gamePass.status).toBe('ok');
    expect(calls.upserts.flatMap((call) => call.rows).map((row) => row.media_item_id)).toEqual([
      'item-way-out',
    ]);
  });

  it('runs the other source when one fails, and still exits ok', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet([
      [/nvidiagrid\.net/, () => json({}, 503)],
      ...happyRoutes().filter(([pattern]) => !/nvidiagrid/.test(String(pattern))),
    ]);

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['geforce-now', 'game-pass'], log: silent },
    );

    expect(result.ok).toBe(true);
    expect(result.outcomes[0]!.status).toBe('failed');
    expect(result.outcomes[1]!.status).toBe('ok');
    // Nothing was written or closed for the source that failed.
    expect(calls.closes.map((call) => call.service)).not.toContain('geforce_now');
    expect(calls.upserts.flatMap((call) => call.rows).map((row) => row.service)).not.toContain(
      'geforce_now',
    );
  });

  it('is not ok when every source it was asked to run failed', async () => {
    const { store } = fakeStore({ titlesThrow: true });
    const { impl } = fakeInternet([[/nvidiagrid\.net/, () => json({}, 503)]]);

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['geforce-now', 'game-pass'], log: silent },
    );

    expect(result.ok).toBe(false);
    expect(result.outcomes.every((entry) => entry.status === 'failed')).toBe(true);
  });

  it('leaves a service alone when it comes back empty, rather than closing all of it', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet([
      [/nvidiagrid\.net/, () => json([])],
      [/sigls\/v2/, () => json([{ siglId: 'header' }])],
      [/displaycatalog/, () => json({ Products: [] })],
    ]);

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['geforce-now', 'game-pass'], log: silent },
    );

    expect(calls.upserts).toEqual([]);
    expect(calls.closes).toEqual([]);
    // An empty GeForce NOW list is a broken source, not "nobody is on it".
    expect(result.outcomes[0]!.status).toBe('failed');
    expect(result.outcomes[1]!.status).toBe('failed');
  });

  it('writes nothing at all on a dry run, having done the whole match', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet(happyRoutes());

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['geforce-now', 'game-pass'], dryRun: true, log: silent },
    );

    expect(calls.upserts).toEqual([]);
    expect(calls.closes).toEqual([]);
    expect(result.outcomes.reduce((sum, entry) => sum + entry.matched, 0)).toBe(5);
    expect(result.ok).toBe(true);
  });

  it('asks each source about the region it was given', async () => {
    const { store } = fakeStore();
    const { impl, urls } = fakeInternet(happyRoutes());

    await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, region: 'GB', sources: ['game-pass'], log: silent },
    );

    // Non-empty first: `every` on an empty array is vacuously true.
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.includes('market=GB'))).toBe(true);
  });

  it('skips IsThereAnyDeal with one line when there is no key, and stays ok', async () => {
    const { store } = fakeStore();
    const { impl } = fakeInternet(happyRoutes());
    const lines: string[] = [];

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['itad'], log: (line) => lines.push(line) },
    );

    expect(result.outcomes[0]!.status).toBe('skipped');
    expect(result.ok).toBe(true);
    expect(lines.some((line) => line.includes('ITAD_API_KEY is not set'))).toBe(true);
  });

  it('writes an itad: service per subscription and closes out only the games it asked about', async () => {
    const targets: ItadTarget[] = [
      { media_item_id: 'item-portal', steam_app_id: 620, tracked: true },
      { media_item_id: 'item-odyssey', steam_app_id: 812140, tracked: false },
    ];
    const { store, calls } = fakeStore({ itadTargets: targets });
    const { impl } = fakeInternet([
      [
        /lookup\/id\/shop\/61/,
        () => json({ 'app/620': 'gid-portal', 'app/812140': null }),
      ],
      [
        /games\/subs\/v1/,
        () =>
          json([
            {
              id: 'gid-portal',
              subs: [
                { id: 6, name: 'Game Pass', leaving: null },
                { id: 1, name: 'Prime Gaming', leaving: '2026-10-26T18:00:00+00:00' },
              ],
            },
          ]),
      ],
    ]);

    const result = await runAvailability(
      { store, ...clients(impl, 'test-key') },
      { now: NOW, sources: ['itad'], log: silent },
    );

    expect(calls.upserts.flatMap((call) => call.rows)).toEqual([
      { media_item_id: 'item-portal', service: 'itad:game-pass', region: 'US', source_ref: 'gid-portal' },
      { media_item_id: 'item-portal', service: 'itad:prime-gaming', region: 'US', source_ref: 'gid-portal' },
    ]);

    // The scoped close-out, not the per-service one: ITAD answers only about
    // the ids it is sent, so closing every itad: row would be wrong.
    expect(calls.closes).toEqual([]);
    expect(calls.scopedCloses).toEqual([
      { pattern: 'itad:%', region: 'US', ids: ['item-portal', 'item-odyssey'] },
    ]);
    expect(result.outcomes[0]!.services).toEqual(['itad:game-pass', 'itad:prime-gaming']);
    expect(result.outcomes[0]!.counts.unmatched).toBe(1);
  });

  it('writes what it saw but closes nothing when one product batch fails', async () => {
    // The blocker this test exists for: one displaycatalog batch 500s, its 200
    // products get no titles, they are absent from `matched` for reasons that
    // have nothing to do with the service, and a close-out would mark every one
    // of them as having left Game Pass.
    const { store, calls } = fakeStore();
    const productIds = [...Array.from({ length: 200 }, (_, n) => `P${n}`), '9ND0JVB184XL'];
    const { impl } = fakeInternet([
      [/sigls\/v2\?id=f6f1f99f/, () => json(SIGL(productIds))],
      [/sigls\/v2\?id=fdd9e2a7/, () => json(SIGL(['9NGLST31DG26']))],
      [/sigls\/v2\?id=b8900d09/, () => json(SIGL(['BWVBNCMF22ZK']))],
      // The first batch of 200 fails; the short second batch succeeds.
      [
        /displaycatalog/,
        (url) => {
          const asked = (url.split('bigIds=')[1]?.split('&')[0] ?? '').split(',').filter(Boolean);
          if (asked.length > 1 && asked.includes('P0')) return json({}, 500);
          return json(
            PRODUCTS(
              asked
                .filter((id) => GAME_PASS_TITLES[id] !== undefined)
                .map((id) => [id, GAME_PASS_TITLES[id]!] as [string, string]),
            ),
          );
        },
      ],
    ]);

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['game-pass'], log: silent },
    );

    // What it did see is written: those rows are true.
    expect(calls.upserts.flatMap((call) => call.rows)).toContainEqual({
      media_item_id: 'item-plague',
      service: 'game_pass_console',
      region: 'US',
      source_ref: '9ND0JVB184XL',
    });
    // But the console collection is never closed out, because tonight's answer
    // is not the whole service.
    expect(calls.closes.map((call) => call.service)).not.toContain('game_pass_console');
    expect(result.outcomes[0]!.closeoutSkipped).toBe(true);
    expect(result.outcomes[0]!.status).toBe('ok');
  });

  it('still closes the collections whose answers were whole', async () => {
    const { store, calls } = fakeStore();
    const productIds = [...Array.from({ length: 200 }, (_, n) => `P${n}`), '9ND0JVB184XL'];
    const { impl } = fakeInternet([
      [/sigls\/v2\?id=f6f1f99f/, () => json(SIGL(productIds))],
      [/sigls\/v2\?id=fdd9e2a7/, () => json(SIGL(['9NGLST31DG26']))],
      [/sigls\/v2\?id=b8900d09/, () => json(SIGL(['BWVBNCMF22ZK']))],
      [
        /displaycatalog/,
        (url) => {
          const asked = (url.split('bigIds=')[1]?.split('&')[0] ?? '').split(',').filter(Boolean);
          if (asked.length > 1 && asked.includes('P0')) return json({}, 500);
          return json(
            PRODUCTS(
              asked
                .filter((id) => GAME_PASS_TITLES[id] !== undefined)
                .map((id) => [id, GAME_PASS_TITLES[id]!] as [string, string]),
            ),
          );
        },
      ],
    ]);

    await runAvailability({ store, ...clients(impl) }, { now: NOW, sources: ['game-pass'], log: silent });

    // One collection's bad batch does not cost the other two their close-out.
    expect(calls.closes.map((call) => call.service).sort()).toEqual(['ea_play', 'game_pass_pc']);
  });

  it('says in the log and the summary that it closed nothing, and why', async () => {
    const { store } = fakeStore();
    const productIds = [...Array.from({ length: 200 }, (_, n) => `P${n}`), '9ND0JVB184XL'];
    const { impl } = fakeInternet([
      [/sigls\/v2\?id=f6f1f99f/, () => json(SIGL(productIds))],
      [/sigls\/v2/, () => json(SIGL([]))],
      [
        /displaycatalog/,
        (url) => {
          const asked = (url.split('bigIds=')[1]?.split('&')[0] ?? '').split(',').filter(Boolean);
          if (asked.length > 1 && asked.includes('P0')) return json({}, 500);
          return json(PRODUCTS([['9ND0JVB184XL', 'A Plague Tale: Requiem']]));
        },
      ],
    ]);
    const lines: string[] = [];

    await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['game-pass'], log: (line) => lines.push(line) },
    );

    expect(lines.some((line) => line.includes('1 batch(es) failed'))).toBe(true);
    expect(lines.some((line) => line.includes('no rows closed'))).toBe(true);
    expect(lines.some((line) => line.includes('closed nothing'))).toBe(true);
  });

  it('closes a whole collection out when every batch succeeds', async () => {
    const { store, calls } = fakeStore();
    const { impl } = fakeInternet(happyRoutes());

    const result = await runAvailability(
      { store, ...clients(impl) },
      { now: NOW, sources: ['game-pass'], log: silent },
    );

    expect(calls.closes).toHaveLength(3);
    expect(result.outcomes[0]!.closeoutSkipped).toBe(false);
  });

  it('closes stale itad: rows even when nothing came back in a subscription', async () => {
    // A legitimately empty answer. `--only itad --itad-limit 5` with none of
    // the five in a subscription must still be able to close rows those five
    // games had yesterday; the proof the source worked is that it answered.
    const targets: ItadTarget[] = [
      { media_item_id: 'item-portal', steam_app_id: 620, tracked: true },
    ];
    const { store, calls } = fakeStore({ itadTargets: targets });
    const { impl } = fakeInternet([
      [/lookup\/id\/shop\/61/, () => json({ 'app/620': 'gid-portal' })],
      [/games\/subs\/v1/, () => json([{ id: 'gid-portal', subs: [] }])],
    ]);

    const result = await runAvailability(
      { store, ...clients(impl, 'test-key') },
      { now: NOW, sources: ['itad'], log: silent },
    );

    expect(calls.upserts).toEqual([]);
    expect(calls.scopedCloses).toEqual([
      { pattern: 'itad:%', region: 'US', ids: ['item-portal'] },
    ]);
    expect(result.outcomes[0]!.status).toBe('ok');
  });

  it('closes no itad: rows at all when the request itself failed', async () => {
    const targets: ItadTarget[] = [
      { media_item_id: 'item-portal', steam_app_id: 620, tracked: true },
    ];
    const { store, calls } = fakeStore({ itadTargets: targets });
    const { impl } = fakeInternet([
      [/lookup\/id\/shop\/61/, () => json({ 'app/620': 'gid-portal' })],
      [/games\/subs\/v1/, () => json({}, 500)],
    ]);

    const result = await runAvailability(
      { store, ...clients(impl, 'test-key') },
      { now: NOW, sources: ['itad'], log: silent },
    );

    expect(calls.scopedCloses).toEqual([]);
    expect(calls.upserts).toEqual([]);
    expect(result.outcomes[0]!.status).toBe('failed');
  });

  it('closes nothing on a dry run, however empty the answer', async () => {
    const targets: ItadTarget[] = [
      { media_item_id: 'item-portal', steam_app_id: 620, tracked: true },
    ];
    const { store, calls } = fakeStore({ itadTargets: targets });
    const { impl } = fakeInternet([
      [/lookup\/id\/shop\/61/, () => json({ 'app/620': 'gid-portal' })],
      [/games\/subs\/v1/, () => json([{ id: 'gid-portal', subs: [] }])],
    ]);

    await runAvailability(
      { store, ...clients(impl, 'test-key') },
      { now: NOW, sources: ['itad'], dryRun: true, log: silent },
    );

    expect(calls.scopedCloses).toEqual([]);
  });

  it('runs every source when none is named', async () => {
    const { store } = fakeStore();
    const { impl } = fakeInternet(happyRoutes());

    const result = await runAvailability({ store, ...clients(impl) }, { now: NOW, log: silent });

    expect(result.outcomes.map((entry) => entry.source)).toEqual([
      'geforce-now',
      'game-pass',
      'itad',
    ]);
  });

  it('asks the documented GeForce NOW URL first', async () => {
    const { store } = fakeStore();
    const { impl, urls } = fakeInternet(happyRoutes());

    await runAvailability({ store, ...clients(impl) }, { now: NOW, sources: ['geforce-now'], log: silent });

    expect(urls[0]).toBe(GFN_GAME_LIST_URL);
  });
});
