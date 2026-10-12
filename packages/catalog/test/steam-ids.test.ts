import { describe, expect, it } from 'vitest';
import { dedupeSteamAppIds } from '../src/db';
import {
  EXTERNAL_GAME_BATCH_SIZE,
  EXTERNAL_GAME_FIELDS,
  IgdbClient,
  PAGE_SIZE,
  STEAM_EXTERNAL_GAME_SOURCE,
} from '../src/igdb';
import { selectSteamAppId } from '../src/map';
import type { Clock } from '../src/rate-limit';
import type { IgdbExternalGame } from '../src/types';
import recorded from './fixtures/igdb-external-games-steam.json';

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

/** Every recorded Steam row, grouped by IGDB game. Pulled live 2026-09-16. */
function recordedByGame(): Map<number, IgdbExternalGame[]> {
  const byGame = new Map<number, IgdbExternalGame[]>();
  for (const row of recorded as IgdbExternalGame[]) {
    const list = byGame.get(row.game);
    if (list) list.push(row);
    else byGame.set(row.game, [row]);
  }
  return byGame;
}

const steam = (game: number, uid: string, id = 1): IgdbExternalGame => ({
  id,
  game,
  uid,
  external_game_source: STEAM_EXTERNAL_GAME_SOURCE,
});

describe('STEAM_EXTERNAL_GAME_SOURCE', () => {
  it('is 1, the id /v4/external_game_sources gives Steam', () => {
    expect(STEAM_EXTERNAL_GAME_SOURCE).toBe(1);
  });
});

describe('selectSteamAppId', () => {
  it('takes the one app id when there is one', () => {
    expect(selectSteamAppId([steam(119133, '1245620')])).toBe(1245620);
  });

  it('takes the smallest app id when a game has several', () => {
    const rows = [steam(1011, '379880', 2), steam(1011, '49520', 1)];
    // Borderlands 2 (49520) rather than Borderlands 2 VR (379880).
    expect(selectSteamAppId(rows)).toBe(49520);
  });

  it('gives the same answer whatever order the rows arrive in', () => {
    const rows = [steam(545, '214630'), steam(545, '42700'), steam(545, '42710')];
    const forwards = selectSteamAppId(rows);
    const backwards = selectSteamAppId([...rows].reverse());
    const shuffled = selectSteamAppId([rows[1]!, rows[2]!, rows[0]!]);

    expect(forwards).toBe(42700);
    expect(backwards).toBe(42700);
    expect(shuffled).toBe(42700);
  });

  it('ignores entries from other stores', () => {
    const rows: IgdbExternalGame[] = [
      { id: 1, game: 7, uid: 'B07TMH1N6J', external_game_source: 20 }, // Amazon
      { id: 2, game: 7, uid: '1091500', external_game_source: STEAM_EXTERNAL_GAME_SOURCE },
      { id: 3, game: 7, uid: '1', external_game_source: 26 }, // Epic, and a smaller number
    ];

    expect(selectSteamAppId(rows)).toBe(1091500);
  });

  it('ignores an entry with no source at all', () => {
    expect(selectSteamAppId([{ id: 1, game: 7, uid: '5' }])).toBeNull();
  });

  it('returns null for a game that is not on Steam', () => {
    expect(selectSteamAppId([])).toBeNull();
    expect(selectSteamAppId([{ id: 1, game: 7, uid: 'abc', external_game_source: 20 }])).toBeNull();
  });

  it('refuses a uid that is not plain digits rather than coercing it', () => {
    expect(selectSteamAppId([steam(7, '')])).toBeNull();
    expect(selectSteamAppId([steam(7, ' 400 ')])).toBeNull();
    expect(selectSteamAppId([steam(7, '400a')])).toBeNull();
    expect(selectSteamAppId([steam(7, '4e2')])).toBeNull();
    expect(selectSteamAppId([steam(7, '-400')])).toBeNull();
    expect(selectSteamAppId([steam(7, '400.5')])).toBeNull();
    expect(selectSteamAppId([{ id: 1, game: 7, external_game_source: 1 }])).toBeNull();
  });

  it('refuses zero, which is not an app id', () => {
    expect(selectSteamAppId([steam(7, '0')])).toBeNull();
  });

  it('skips an unusable uid without losing a usable sibling', () => {
    expect(selectSteamAppId([steam(7, 'not-a-number'), steam(7, '400')])).toBe(400);
  });
});

describe('selectSteamAppId against the recorded catalogue', () => {
  const byGame = recordedByGame();

  it('recorded more than one Steam row for a real share of popular games', () => {
    const multi = [...byGame.values()].filter((rows) => rows.length > 1);
    expect(multi.length).toBeGreaterThan(5);
  });

  it('picks exactly one app id for every recorded game', () => {
    for (const [game, rows] of byGame) {
      const picked = selectSteamAppId(rows);
      expect(picked, `game ${game}`).not.toBeNull();
      expect(rows.map((row) => Number(row.uid))).toContain(picked);
    }
  });

  it('picks the base game over its spin-offs and re-releases', () => {
    // Spot checks from the recorded rows, all games with two or three entries.
    const expected: Array<[number, number]> = [
      [71, 400], // Half-Life's real app id over its duplicate entry
      [1011, 49520], // Borderlands 2 over Borderlands 2 VR
      [1122, 202970], // Black Ops II over its multiplayer client
      [74, 24980], // Mass Effect 2 over the 2010 re-release entry
      [11118, 403640], // Dishonored 2 over Death of the Outsider
    ];

    for (const [game, appId] of expected) {
      expect(selectSteamAppId(byGame.get(game) ?? []), `game ${game}`).toBe(appId);
    }
  });

  it('never picks something that is not in the rows it was given', () => {
    const all = recorded as IgdbExternalGame[];
    const picked = selectSteamAppId(all);
    expect(all.map((row) => Number(row.uid))).toContain(picked);
  });
});

describe('dedupeSteamAppIds', () => {
  it('collapses a repeated IGDB id to the smallest app id, not the last', () => {
    const rows = dedupeSteamAppIds([
      { igdb_id: 1, steam_app_id: 900 },
      { igdb_id: 2, steam_app_id: 50 },
      { igdb_id: 1, steam_app_id: 100 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.igdb_id === 1)!.steam_app_id).toBe(100);
  });

  it('agrees with selectSteamAppId, so page order cannot change the answer', () => {
    const rows = [steam(5, '900'), steam(5, '100')];
    const fromSelect = selectSteamAppId(rows);
    const fromDedupe = dedupeSteamAppIds(
      rows.map((row) => ({ igdb_id: row.game, steam_app_id: Number(row.uid) })),
    );

    expect(fromDedupe[0]!.steam_app_id).toBe(fromSelect);
  });

  it('leaves a batch with no repeats alone', () => {
    const rows = [
      { igdb_id: 1, steam_app_id: 10 },
      { igdb_id: 2, steam_app_id: 20 },
    ];
    expect(dedupeSteamAppIds(rows)).toEqual(rows);
  });
});

describe('IgdbClient.externalGamesSteam', () => {
  interface Call {
    url: string;
    body: string;
  }

  /** A fetch stand-in that serves the recorded rows for the ids asked for. */
  function fakeIgdb(rows: IgdbExternalGame[], pageSize = PAGE_SIZE) {
    const calls: Call[] = [];

    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const text = body instanceof URLSearchParams ? body.toString() : String(body ?? '');

      if (url.includes('id.twitch.tv')) {
        return json({ access_token: 'tok', expires_in: 5_000_000 });
      }
      calls.push({ url, body: text });

      const ids = new Set(
        (/where game = \(([^)]*)\)/.exec(text)?.[1] ?? '')
          .split(',')
          .map((id) => Number(id.trim())),
      );
      const offset = Number(/offset (\d+)/.exec(text)?.[1] ?? '0');
      const matching = rows.filter((row) => ids.has(row.game));

      return json(matching.slice(offset, offset + pageSize));
    }) as unknown as typeof fetch;

    return { impl, calls };
  }

  function client(impl: typeof fetch): IgdbClient {
    return new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock: new TestClock(),
      fetchImpl: impl,
    });
  }

  it('posts to /v4/external_games with the documented fields', async () => {
    const fetcher = fakeIgdb([steam(1, '400')]);
    await client(fetcher.impl).externalGamesSteam([1]);

    const [call] = fetcher.calls;
    expect(call!.url).toBe('https://api.igdb.com/v4/external_games');
    expect(call!.body).toContain(`fields ${EXTERNAL_GAME_FIELDS};`);
    expect(EXTERNAL_GAME_FIELDS).toBe('game,uid,external_game_source,url');
  });

  it('does not ask for the deprecated category field', () => {
    expect(EXTERNAL_GAME_FIELDS).not.toContain('category');
  });

  it('filters to Steam server-side, so other stores never cross the wire', async () => {
    const fetcher = fakeIgdb([steam(1, '400')]);
    await client(fetcher.impl).externalGamesSteam([1]);

    expect(fetcher.calls[0]!.body).toContain(
      `& external_game_source = ${STEAM_EXTERNAL_GAME_SOURCE};`,
    );
  });

  it('asks for a whole batch of game ids in one where clause', async () => {
    const fetcher = fakeIgdb([steam(1, '400'), steam(2, '500'), steam(3, '600')]);
    const rows = await client(fetcher.impl).externalGamesSteam([1, 2, 3]);

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]!.body).toContain('where game = (1,2,3)');
    expect(rows).toHaveLength(3);
  });

  it('splits more ids than the batch size across requests', async () => {
    const ids = Array.from({ length: EXTERNAL_GAME_BATCH_SIZE + 2 }, (_, i) => i + 1);
    const fetcher = fakeIgdb(ids.map((id) => steam(id, String(id * 10))));

    const rows = await client(fetcher.impl).externalGamesSteam(ids);

    expect(fetcher.calls).toHaveLength(2);
    expect(rows).toHaveLength(ids.length);
  });

  it('de-duplicates ids, so a repeat cannot buy a second request', async () => {
    const ids = Array.from({ length: EXTERNAL_GAME_BATCH_SIZE }, (_, i) => i + 1);
    const fetcher = fakeIgdb(ids.map((id) => steam(id, String(id * 10))));

    await client(fetcher.impl).externalGamesSteam([...ids, ...ids]);

    expect(fetcher.calls).toHaveLength(1);
  });

  it('pages on offset when one batch fills IGDB\'s row limit', async () => {
    // A tiny page size stands in for IGDB's 500: the point is that a batch
    // returning a full page is followed up rather than truncated.
    const rows = Array.from({ length: 7 }, (_, i) => steam(1, String(100 + i), i));
    const fetcher = fakeIgdb(rows, PAGE_SIZE);
    const many = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => steam(1, String(1000 + i), i));
    const pager = fakeIgdb(many, PAGE_SIZE);

    const short = await client(fetcher.impl).externalGamesSteam([1]);
    expect(short).toHaveLength(7);
    expect(fetcher.calls).toHaveLength(1);

    const full = await client(pager.impl).externalGamesSteam([1]);
    expect(full).toHaveLength(PAGE_SIZE + 3);
    expect(pager.calls).toHaveLength(2);
    expect(pager.calls[0]!.body).toContain('offset 0;');
    expect(pager.calls[1]!.body).toContain(`offset ${PAGE_SIZE};`);
  });

  it('sorts by id, so the offset window is stable across pages', async () => {
    const fetcher = fakeIgdb([steam(1, '400')]);
    await client(fetcher.impl).externalGamesSteam([1]);

    expect(fetcher.calls[0]!.body).toContain('sort id asc;');
  });

  it('asks for nothing when there are no ids', async () => {
    const fetcher = fakeIgdb([]);
    const rows = await client(fetcher.impl).externalGamesSteam([]);

    expect(rows).toEqual([]);
    expect(fetcher.calls).toHaveLength(0);
  });

  it('shares the token and the rate limiter with the other endpoints', async () => {
    const fetcher = fakeIgdb([steam(1, '400')]);
    const igdb = client(fetcher.impl);

    await igdb.query('fields name;');
    await igdb.externalGamesSteam([1]);

    expect(igdb.requestCount).toBe(2);
  });
});
