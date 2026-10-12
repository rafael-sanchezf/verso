import { describe, expect, it } from 'vitest';
import { dedupeTimeToBeat } from '../src/db';
import { IgdbClient, TIME_TO_BEAT_BATCH_SIZE, TIME_TO_BEAT_FIELDS } from '../src/igdb';
import { mapTimeToBeat } from '../src/map';
import type { Clock } from '../src/rate-limit';
import type { IgdbTimeToBeat, TimeToBeatRow } from '../src/types';

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

interface Call {
  url: string;
  body: string;
}

/**
 * A fetch stand-in that answers the token exchange and then serves
 * time-to-beat rows for exactly the ids each request asked for, the way the
 * real endpoint does: a game with no figures is absent rather than null.
 */
function fakeIgdb(rowsByGameId: Map<number, IgdbTimeToBeat>) {
  const calls: Call[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body;
    const text = body instanceof URLSearchParams ? body.toString() : String(body ?? '');
    calls.push({ url, body: text });

    if (url.includes('id.twitch.tv')) {
      return json({ access_token: 'tok_abc', expires_in: 5_000_000 });
    }

    const ids = /where game_id = \(([^)]*)\)/.exec(text)?.[1] ?? '';
    const requested = ids
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id));

    return json(requested.flatMap((id) => (rowsByGameId.has(id) ? [rowsByGameId.get(id)!] : [])));
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

/** The endpoint's own rows for a handful of ids. */
function rows(ids: number[]): Map<number, IgdbTimeToBeat> {
  return new Map(
    ids.map((id) => [
      id,
      { id: id + 100_000, game_id: id, hastily: id, normally: id * 2, completely: id * 3, count: 7 },
    ]),
  );
}

function apiCalls(calls: Call[]): Call[] {
  return calls.filter((call) => call.url.includes('game_time_to_beats'));
}

describe('IgdbClient.timeToBeat', () => {
  it('posts to the game_time_to_beats endpoint with the documented fields', async () => {
    const fetcher = fakeIgdb(rows([1, 2, 3]));
    await client(fetcher.impl).timeToBeat([1, 2, 3]);

    const [call] = apiCalls(fetcher.calls);
    expect(call!.url).toBe('https://api.igdb.com/v4/game_time_to_beats');
    expect(call!.body).toContain(`fields ${TIME_TO_BEAT_FIELDS};`);
    expect(TIME_TO_BEAT_FIELDS).toBe('game_id,hastily,normally,completely,count');
  });

  it('asks for a whole batch of ids in one where clause', async () => {
    const fetcher = fakeIgdb(rows([1, 2, 3]));
    const result = await client(fetcher.impl).timeToBeat([1, 2, 3]);

    expect(apiCalls(fetcher.calls)).toHaveLength(1);
    expect(apiCalls(fetcher.calls)[0]!.body).toContain('where game_id = (1,2,3);');
    expect(result.map((row) => row.game_id)).toEqual([1, 2, 3]);
  });

  it('carries a limit matching the batch size, so no row can fall off the end', async () => {
    const fetcher = fakeIgdb(rows([1]));
    await client(fetcher.impl).timeToBeat([1]);

    expect(apiCalls(fetcher.calls)[0]!.body).toContain(`limit ${TIME_TO_BEAT_BATCH_SIZE};`);
  });

  it('splits more ids than the batch size across requests and keeps every row', async () => {
    const ids = Array.from({ length: TIME_TO_BEAT_BATCH_SIZE + 3 }, (_, i) => i + 1);
    const fetcher = fakeIgdb(rows(ids));

    const result = await client(fetcher.impl).timeToBeat(ids);

    const bodies = apiCalls(fetcher.calls).map((call) => call.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain(`where game_id = (1,2,3,`);
    expect(bodies[1]).toContain(
      `where game_id = (${TIME_TO_BEAT_BATCH_SIZE + 1},${TIME_TO_BEAT_BATCH_SIZE + 2},${TIME_TO_BEAT_BATCH_SIZE + 3});`,
    );
    expect(result).toHaveLength(ids.length);
    expect(new Set(result.map((row) => row.game_id)).size).toBe(ids.length);
  });

  it('sends exactly one request for a full page of games', async () => {
    const ids = Array.from({ length: TIME_TO_BEAT_BATCH_SIZE }, (_, i) => i + 1);
    const fetcher = fakeIgdb(rows(ids));

    await client(fetcher.impl).timeToBeat(ids);

    expect(apiCalls(fetcher.calls)).toHaveLength(1);
  });

  it('de-duplicates ids before batching, so a repeat cannot buy a second request', async () => {
    const ids = Array.from({ length: TIME_TO_BEAT_BATCH_SIZE }, (_, i) => i + 1);
    const fetcher = fakeIgdb(rows(ids));

    await client(fetcher.impl).timeToBeat([...ids, ...ids]);

    expect(apiCalls(fetcher.calls)).toHaveLength(1);
  });

  it('asks for nothing when there are no ids', async () => {
    const fetcher = fakeIgdb(new Map());
    const result = await client(fetcher.impl).timeToBeat([]);

    expect(result).toEqual([]);
    expect(fetcher.calls).toHaveLength(0);
  });

  it('returns only the games IGDB has figures for, leaving the rest unmentioned', async () => {
    const fetcher = fakeIgdb(rows([2]));
    const result = await client(fetcher.impl).timeToBeat([1, 2, 3]);

    expect(result.map((row) => row.game_id)).toEqual([2]);
  });

  it('shares the token and the rate limiter with the games endpoint', async () => {
    const fetcher = fakeIgdb(rows([1]));
    const igdb = client(fetcher.impl);

    await igdb.query('fields name;');
    await igdb.timeToBeat([1]);

    const tokenCalls = fetcher.calls.filter((call) => call.url.includes('id.twitch.tv'));
    expect(tokenCalls).toHaveLength(1);
    // Two API calls plus the one token exchange, all counted on one budget.
    expect(igdb.requestCount).toBe(2);
  });

  it('retries a 429 on the time-to-beat endpoint like any other request', async () => {
    let attempts = 0;
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('id.twitch.tv')) return json({ access_token: 'tok', expires_in: 5_000_000 });
      attempts += 1;
      return attempts === 1 ? json({ message: 'slow down' }, 429) : json([{ game_id: 1 }]);
    }) as unknown as typeof fetch;

    const clock = new TestClock();
    const igdb = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock,
      fetchImpl: impl,
    });

    await expect(igdb.timeToBeat([1])).resolves.toHaveLength(1);
    expect(clock.sleeps).toEqual([1000]);
  });
});

describe('the batch that reaches Postgres', () => {
  it('maps a batch of endpoint rows onto writable rows, dropping the empty ones', async () => {
    const fetcher = fakeIgdb(
      new Map<number, IgdbTimeToBeat>([
        [1, { game_id: 1, hastily: 100, normally: 200, completely: 300, count: 9 }],
        // A game IGDB tracks but has no figures for: a submission count only.
        [2, { game_id: 2, count: 0 }],
      ]),
    );

    const fetched = await client(fetcher.impl).timeToBeat([1, 2, 3]);
    const writable = fetched.flatMap((row) => {
      const mapped = mapTimeToBeat(row);
      return mapped ? [mapped] : [];
    });

    expect(writable).toEqual<TimeToBeatRow[]>([
      { igdb_id: 1, hastily_seconds: 100, normally_seconds: 200, completely_seconds: 300 },
    ]);
  });

  it('collapses a repeated game to its last row, last one winning', () => {
    const deduped = dedupeTimeToBeat([
      { igdb_id: 1, hastily_seconds: 1, normally_seconds: 2, completely_seconds: 3 },
      { igdb_id: 2, hastily_seconds: 9, normally_seconds: 9, completely_seconds: 9 },
      { igdb_id: 1, hastily_seconds: 10, normally_seconds: 20, completely_seconds: 30 },
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((row) => row.igdb_id === 1)!.normally_seconds).toBe(20);
  });

  it('leaves a batch with no repeats alone', () => {
    const batch: TimeToBeatRow[] = [
      { igdb_id: 1, hastily_seconds: 1, normally_seconds: 2, completely_seconds: 3 },
      { igdb_id: 2, hastily_seconds: 4, normally_seconds: 5, completely_seconds: 6 },
    ];
    expect(dedupeTimeToBeat(batch)).toEqual(batch);
  });
});
