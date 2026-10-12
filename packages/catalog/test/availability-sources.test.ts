/**
 * The three availability sources, against fixtures captured from the live
 * endpoints on 2026-09-16.
 *
 * `gfn-supported-games.json` and `gamepass-sigl-console.json` are verbatim
 * slices of the real answers; `gamepass-displaycatalog.json` is the real answer
 * with every field the mapper does not read removed (the live one is 600 KB for
 * ten products). The two ITAD files are the response examples in the API's own
 * OpenAPI document (https://docs.isthereanydeal.com/openapi.json), which is the
 * only official specification of the three.
 */

import { describe, expect, it } from 'vitest';
import {
  DISPLAY_CATALOG_BATCH_SIZE,
  GAME_PASS_COLLECTIONS,
  GamePassClient,
  productIdsFromSigl,
  titlesFromDisplayCatalog,
} from '../src/gamepass';
import {
  GFN_GAME_LIST_LOCALE_URL,
  GFN_GAME_LIST_URL,
  GeForceNowClient,
  mapGfnEntries,
  steamAppIdFromStoreUrl,
} from '../src/gfn';
import { AVAILABILITY_USER_AGENT } from '../src/http';
import { ItadClient, itadServiceId, steamAppIdFromShopGameId, steamShopGameId } from '../src/itad';
import type { Clock } from '../src/rate-limit';
import type { DisplayCatalogResponse, GfnEntry, SiglEntry } from '../src/types';
import displayCatalog from './fixtures/gamepass-displaycatalog.json';
import sigl from './fixtures/gamepass-sigl-console.json';
import gfnList from './fixtures/gfn-supported-games.json';
import itadLookup from './fixtures/itad-lookup-shop-steam.json';
import itadSubs from './fixtures/itad-games-subs.json';

class TestClock implements Clock {
  time = 0;
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.time += ms;
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Records every request, and answers from a url-to-body table. */
function recordingFetch(answer: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return answer(String(input), init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('steamAppIdFromStoreUrl', () => {
  it('reads the app id out of a Steam store URL', () => {
    expect(steamAppIdFromStoreUrl('https://store.steampowered.com/app/620')).toBe(620);
    expect(steamAppIdFromStoreUrl('https://store.steampowered.com/app/812140/Odyssey/')).toBe(812140);
    expect(steamAppIdFromStoreUrl('http://store.steampowered.com/app/620?l=en')).toBe(620);
  });

  it('gives null for the empty string every non-Steam entry carries', () => {
    expect(steamAppIdFromStoreUrl('')).toBeNull();
    expect(steamAppIdFromStoreUrl(undefined)).toBeNull();
    expect(steamAppIdFromStoreUrl(null)).toBeNull();
  });

  it('refuses a URL that is not a Steam app page', () => {
    expect(steamAppIdFromStoreUrl('https://store.epicgames.com/p/alan-wake')).toBeNull();
    expect(steamAppIdFromStoreUrl('https://store.steampowered.com/bundle/620')).toBeNull();
    expect(steamAppIdFromStoreUrl('https://store.steampowered.com/app/notanumber')).toBeNull();
    expect(steamAppIdFromStoreUrl('https://evil.example.com/store.steampowered.com/app/620')).toBeNull();
  });
});

describe('mapGfnEntries, against the live list', () => {
  const entries = gfnList as GfnEntry[];

  it('keeps every entry with a Steam app id and counts the rest', () => {
    const mapping = mapGfnEntries(entries);

    expect(mapping.total).toBe(6);
    expect(mapping.keys.map((key) => key.key)).toEqual(['812140', '620', '530700']);
    expect(mapping.withoutSteamId).toBe(3);
  });

  it('stores NVIDIA’s own entry id as the source ref', () => {
    const mapping = mapGfnEntries(entries);
    const portal = mapping.keys.find((key) => key.key === '620');

    expect(portal?.sourceRef).toMatch(/^\d+$/);
    expect(portal?.title).toBe('Portal 2');
  });

  it('keeps a game that is under maintenance: it has not left the service', () => {
    const argo = entries.find((entry) => entry.status === 'MAINTENANCE');
    expect(argo).toBeDefined();

    expect(mapGfnEntries(entries).keys.map((key) => key.key)).toContain('530700');
  });

  it('counts an empty list as nothing mapped rather than throwing', () => {
    expect(mapGfnEntries([])).toEqual({ keys: [], total: 0, withoutSteamId: 0 });
  });
});

describe('GeForceNowClient', () => {
  it('names itself on every request', async () => {
    const { impl, calls } = recordingFetch(() => json(gfnList));
    await new GeForceNowClient({ fetchImpl: impl, clock: new TestClock() }).list();

    const headers = new Headers(calls[0]!.init!.headers as HeadersInit);
    expect(headers.get('user-agent')).toBe(AVAILABILITY_USER_AGENT);
    expect(AVAILABILITY_USER_AGENT).toContain('github.com/rafael-sanchezf/verso');
  });

  it('falls back to the locale file when the documented URL answers null', async () => {
    // Which it does, as of 2026-09-16: gfnpc.json is four bytes of `null`.
    const { impl, calls } = recordingFetch((url) =>
      url === GFN_GAME_LIST_URL ? json(null) : json(gfnList),
    );

    const { entries, url } = await new GeForceNowClient({
      fetchImpl: impl,
      clock: new TestClock(),
    }).list();

    expect(calls.map((call) => call.url)).toEqual([GFN_GAME_LIST_URL, GFN_GAME_LIST_LOCALE_URL]);
    expect(url).toBe(GFN_GAME_LIST_LOCALE_URL);
    expect(entries).toHaveLength(6);
  });

  it('asks only once when the documented URL answers a list', async () => {
    const { impl, calls } = recordingFetch(() => json(gfnList));
    const { url } = await new GeForceNowClient({ fetchImpl: impl, clock: new TestClock() }).list();

    expect(calls).toHaveLength(1);
    expect(url).toBe(GFN_GAME_LIST_URL);
  });

  it('gives up rather than asking the second URL after a hard failure', async () => {
    const { impl, calls } = recordingFetch(() => json({}, 404));

    await expect(
      new GeForceNowClient({ fetchImpl: impl, clock: new TestClock() }).list(),
    ).rejects.toThrow(/GeForce NOW returned 404/);
    expect(calls).toHaveLength(1);
  });
});

describe('the Game Pass collection ids', () => {
  it('are the three from NikkelM/Game-Pass-API, one service each', () => {
    // Verified against js/gamePass.js in that repository on 2026-09-16, which
    // is where docs/research/game-data-sources.md 9.1 takes them from.
    expect(GAME_PASS_COLLECTIONS).toEqual([
      { service: 'game_pass_console', siglId: 'f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e' },
      { service: 'game_pass_pc', siglId: 'fdd9e2a7-0fee-49f6-ad69-4354098401ff' },
      { service: 'ea_play', siglId: 'b8900d09-a491-44cc-916e-32b5acae621b' },
    ]);
  });
});

describe('productIdsFromSigl, against the live collection', () => {
  it('skips the collection header and keeps every member', () => {
    const ids = productIdsFromSigl(sigl as SiglEntry[]);

    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe('9NPDN9R45JX4');
    expect(ids).not.toContain(undefined);
    expect((sigl as SiglEntry[])[0]!.siglId).toBe('f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e');
  });

  it('de-duplicates, because one product id can only mean one row', () => {
    expect(productIdsFromSigl([{ id: 'A' }, { id: 'A' }, { id: 'B' }])).toEqual(['A', 'B']);
  });

  it('survives a day when Microsoft drops or doubles the header', () => {
    expect(productIdsFromSigl([{ id: 'A' }])).toEqual(['A']);
    expect(productIdsFromSigl([{ siglId: 'x' }, { siglId: 'y' }, { id: 'A' }])).toEqual(['A']);
  });
});

describe('titlesFromDisplayCatalog, against the live answer', () => {
  it('reads one title per product from the first localized block', () => {
    const titles = titlesFromDisplayCatalog(displayCatalog as DisplayCatalogResponse);

    expect(titles.size).toBe(10);
    expect(titles.get('9ND0JVB184XL')).toBe('A Plague Tale: Requiem');
    expect(titles.get('BWVBNCMF22ZK')).toBe('A Way Out');
    expect(titles.get('9NGLST31DG26')).toBe('A Game About Digging A Hole™');
  });

  it('drops a product with no usable title rather than keying it on an empty string', () => {
    const titles = titlesFromDisplayCatalog({
      Products: [
        { ProductId: 'A', LocalizedProperties: [{ ProductTitle: '' }] },
        { ProductId: 'B', LocalizedProperties: [] },
        { ProductId: 'C' },
        { LocalizedProperties: [{ ProductTitle: 'No id' }] },
        { ProductId: 'D', LocalizedProperties: [{ ProductTitle: 'Kept' }] },
      ],
    });

    expect([...titles]).toEqual([['D', 'Kept']]);
  });

  it('gives an empty map for an answer with no products at all', () => {
    expect(titlesFromDisplayCatalog({}).size).toBe(0);
    expect(titlesFromDisplayCatalog({ Products: [] }).size).toBe(0);
  });
});

describe('GamePassClient', () => {
  it('asks the sigl endpoint for one collection in one market', async () => {
    const { impl, calls } = recordingFetch(() => json(sigl));
    const ids = await new GamePassClient({ fetchImpl: impl, clock: new TestClock() }).collection(
      'f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e',
      'US',
    );

    expect(calls[0]!.url).toBe(
      'https://catalog.gamepass.com/sigls/v2' +
        '?id=f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e&language=en-us&market=US',
    );
    expect(ids).toHaveLength(10);
  });

  it('batches product ids, at the size the reference tool uses', async () => {
    const ids = Array.from({ length: 450 }, (_, n) => `P${n}`);
    const { impl, calls } = recordingFetch(() => json({ Products: [] }));

    await new GamePassClient({ fetchImpl: impl, clock: new TestClock() }).titles(ids, 'US');

    expect(DISPLAY_CATALOG_BATCH_SIZE).toBe(200);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toContain('bigIds=P0,P1,');
    expect(calls[2]!.url.split('bigIds=')[1]!.split('&')[0]!.split(',')).toHaveLength(50);
  });

  it('loses one batch rather than the whole collection when a batch fails', async () => {
    const { impl } = recordingFetch((url) =>
      url.includes('P200') ? json({}, 500) : json(displayCatalog),
    );
    const ids = [...Array.from({ length: 200 }, (_, n) => `P${n}`), 'P200'];

    const result = await new GamePassClient({
      fetchImpl: impl,
      clock: new TestClock(),
      maxAttempts: 1,
    }).titles(ids, 'US');

    expect(result.failedBatches).toBe(1);
    expect(result.titles.size).toBe(10);
  });

  it('gives an empty collection rather than throwing when the answer is not a list', async () => {
    const { impl } = recordingFetch(() => json({ error: 'nope' }));
    const ids = await new GamePassClient({ fetchImpl: impl, clock: new TestClock() }).collection(
      'x',
      'US',
    );

    expect(ids).toEqual([]);
  });
});

describe('itadServiceId', () => {
  it('namespaces whatever IsThereAnyDeal calls a subscription', () => {
    expect(itadServiceId('Game Pass')).toBe('itad:game-pass');
    expect(itadServiceId('Prime Gaming')).toBe('itad:prime-gaming');
    expect(itadServiceId('Ubisoft+')).toBe('itad:ubisoft');
    expect(itadServiceId('EA Play Pro')).toBe('itad:ea-play-pro');
  });

  it('cannot collide with the four service ids this repository defines', () => {
    for (const name of ['Game Pass', 'EA Play', 'GeForce NOW']) {
      expect(itadServiceId(name).startsWith('itad:')).toBe(true);
    }
  });

  it('still produces something usable for a name with no letters at all', () => {
    expect(itadServiceId('+++')).toBe('itad:unknown');
  });
});

describe('the Steam shop-game-id round trip', () => {
  it('goes both ways', () => {
    expect(steamShopGameId(220)).toBe('app/220');
    expect(steamAppIdFromShopGameId('app/220')).toBe(220);
  });

  it('refuses anything that is not an app', () => {
    expect(steamAppIdFromShopGameId('sub/137730')).toBeNull();
    expect(steamAppIdFromShopGameId('bundle/27508')).toBeNull();
    expect(steamAppIdFromShopGameId('app/')).toBeNull();
  });
});

describe('ItadClient, against the documented responses', () => {
  const client = (impl: typeof fetch) =>
    new ItadClient({ apiKey: 'test-key', fetchImpl: impl, clock: new TestClock() });

  it('sends the key in a header rather than the URL, so it cannot land in a log', async () => {
    const { impl, calls } = recordingFetch(() => json(itadLookup));
    await client(impl).gameIdsBySteamAppId([220]);

    expect(calls[0]!.url).not.toContain('test-key');
    expect(new Headers(calls[0]!.init!.headers as HeadersInit).get('itad-api-key')).toBe('test-key');
  });

  it('posts app/<appid> to the Steam shop lookup and keeps the ids ITAD knows', async () => {
    const { impl, calls } = recordingFetch(() => json(itadLookup));
    const found = await client(impl).gameIdsBySteamAppId([220, 1145360, 504230, 137730]);

    expect(calls[0]!.url).toBe('https://api.isthereanydeal.com/lookup/id/shop/61/v1');
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual([
      'app/220',
      'app/1145360',
      'app/504230',
      'app/137730',
    ]);
    expect(found.get(1145360)).toBe('018d937f-24b7-731c-a789-8307ae059efa');
    // `"app/137730": null` in the fixture: ITAD does not have every Steam app,
    // and that is an answer rather than a failure.
    expect(found.has(137730)).toBe(false);
    expect(found.size).toBe(3);
  });

  it('asks for subscriptions in one country and reads the documented shape', async () => {
    const { impl, calls } = recordingFetch(() => json(itadSubs));
    const answers = await client(impl).subscriptions(
      ['018d937f-24b7-731c-a789-8307ae059efa', '018d937f-700e-7161-9c8d-5423af1b7c99'],
      'US',
    );

    expect(calls[0]!.url).toBe('https://api.isthereanydeal.com/games/subs/v1?country=US');
    expect(answers[0]!.subs![0]!.name).toBe('Prime Gaming');
    expect(answers[1]!.subs!.map((sub) => sub.name)).toEqual(['Game Pass', 'Ubisoft+']);
    expect(answers[2]!.subs).toEqual([]);
  });

  it('batches both endpoints at the documented maximum of 200', async () => {
    const { impl, calls } = recordingFetch(() => json([]));
    const gids = Array.from({ length: 201 }, (_, n) => `gid-${n}`);

    await client(impl).subscriptions(gids, 'US');

    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]!.init!.body))).toHaveLength(200);
    expect(JSON.parse(String(calls[1]!.init!.body))).toHaveLength(1);
  });

  it('asks nothing at all when there is nothing to ask about', async () => {
    const { impl, calls } = recordingFetch(() => json([]));

    expect(await client(impl).gameIdsBySteamAppId([])).toEqual(new Map());
    expect(await client(impl).subscriptions([], 'US')).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
