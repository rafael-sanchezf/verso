import { describe, expect, it } from 'vitest';
import { IgdbClient, PAGE_SIZE } from '../src/igdb';
import type { Clock } from '../src/rate-limit';
import type { IgdbGame } from '../src/types';

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
  headers: Headers;
}

/** A fetch stand-in that records calls and replays queued responses. */
function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  let index = 0;

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body;
    calls.push({
      url,
      body: body instanceof URLSearchParams ? body.toString() : String(body ?? ''),
      headers: new Headers(init?.headers),
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next!();
  }) as unknown as typeof fetch;

  return { impl, calls, get count() { return index; } };
}

const tokenResponse = () => json({ access_token: 'tok_abc', expires_in: 5_000_000 });
const game = (id: number): IgdbGame => ({ id, name: `Game ${id}`, game_type: 0 });

describe('IgdbClient', () => {
  it('exchanges client credentials once and caches the token', async () => {
    const fetcher = fakeFetch([tokenResponse, () => json([game(1)])]);
    const clock = new TestClock();
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock,
      fetchImpl: fetcher.impl,
    });

    await client.query('fields name;');
    await client.query('fields name;');

    const tokenCalls = fetcher.calls.filter((call) => call.url.includes('id.twitch.tv'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.body).toContain('grant_type=client_credentials');
  });

  it('sends the Client-ID header and the bearer token on every query', async () => {
    const fetcher = fakeFetch([tokenResponse, () => json([game(1)])]);
    const client = new IgdbClient({
      clientId: 'my-client-id',
      clientSecret: 'secret',
      clock: new TestClock(),
      fetchImpl: fetcher.impl,
    });

    await client.query('fields name;');

    const apiCall = fetcher.calls.find((call) => call.url.includes('api.igdb.com'))!;
    expect(apiCall.headers.get('Client-ID')).toBe('my-client-id');
    expect(apiCall.headers.get('Authorization')).toBe('Bearer tok_abc');
  });

  it('re-requests the token once it has expired', async () => {
    const fetcher = fakeFetch([
      () => json({ access_token: 'tok_1', expires_in: 120 }),
      () => json([game(1)]),
      () => json({ access_token: 'tok_2', expires_in: 120 }),
      () => json([game(2)]),
    ]);
    const clock = new TestClock();
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock,
      fetchImpl: fetcher.impl,
    });

    await client.query('fields name;');
    // 120s lifetime minus the 60s safety margin leaves 60s of usable life.
    clock.time += 61_000;
    await client.query('fields name;');

    const tokenCalls = fetcher.calls.filter((call) => call.url.includes('id.twitch.tv'));
    expect(tokenCalls).toHaveLength(2);
  });

  it('retries a 429 with exponential backoff', async () => {
    let apiCalls = 0;
    const fetcher = fakeFetch([
      tokenResponse,
      () => {
        apiCalls += 1;
        return apiCalls <= 2 ? json({ message: 'Too Many Requests' }, 429) : json([game(1)]);
      },
    ]);
    const clock = new TestClock();
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock,
      fetchImpl: fetcher.impl,
    });

    const games = await client.query('fields name;');

    expect(games).toEqual([game(1)]);
    expect(clock.sleeps).toEqual([1000, 2000]);
    expect(client.retryCount).toBe(2);
  });

  it('gives up after maxAttempts and reports the status', async () => {
    const fetcher = fakeFetch([tokenResponse, () => json({ message: 'nope' }, 500)]);
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock: new TestClock(),
      fetchImpl: fetcher.impl,
      maxAttempts: 2,
    });

    await expect(client.query('fields name;')).rejects.toThrow(/failed with 500 after 2/);
  });

  it('does not retry a 400, which means a malformed query', async () => {
    const fetcher = fakeFetch([tokenResponse, () => json({ message: 'bad syntax' }, 400)]);
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock: new TestClock(),
      fetchImpl: fetcher.impl,
    });

    await expect(client.query('nonsense;')).rejects.toThrow(/failed with 400 after 1/);
  });

  it('pages with limit and offset until a short page ends the walk', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => game(i));
    const tail = [game(9001), game(9002)];
    let apiCalls = 0;

    const fetcher = fakeFetch([
      tokenResponse,
      () => {
        apiCalls += 1;
        return json(apiCalls === 1 ? full : tail);
      },
    ]);
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock: new TestClock(),
      fetchImpl: fetcher.impl,
    });

    const pages: IgdbGame[][] = [];
    for await (const page of client.pages(new Date('2026-09-15T12:00:00.000Z'))) {
      pages.push(page);
    }

    expect(pages.map((page) => page.length)).toEqual([PAGE_SIZE, 2]);

    const bodies = fetcher.calls
      .filter((call) => call.url.includes('api.igdb.com'))
      .map((call) => call.body);
    expect(bodies[0]).toContain(`limit ${PAGE_SIZE};`);
    expect(bodies[0]).toContain('offset 0;');
    expect(bodies[1]).toContain(`offset ${PAGE_SIZE};`);
    expect(bodies[0]).toContain('sort id asc;');
    expect(bodies[0]).toContain('game_type');
    expect(bodies[0]).toContain('where game_type = (0,8) & cover != null');
    expect(bodies[0]).toContain('parent_game,version_parent');
    expect(bodies[0]).toContain('involved_companies.developer');
  });

  it('adds an updated_at cursor for a delta run and omits it for a full pull', async () => {
    const fetcher = fakeFetch([tokenResponse, () => json([])]);
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      clock: new TestClock(),
      fetchImpl: fetcher.impl,
    });

    const since = new Date('2026-09-14T10:00:00.000Z');
    for await (const _page of client.pages(new Date('2026-09-15T12:00:00.000Z'), since)) {
      // consume
    }

    const body = fetcher.calls.find((call) => call.url.includes('api.igdb.com'))!.body;
    expect(body).toContain(`updated_at >= ${Math.floor(since.getTime() / 1000)}`);
    // The delta carries the same trim, so a remake IGDB adds or edits is
    // picked up nightly; remakes it has not touched need the full pull.
    expect(body).toContain('where game_type = (0,8) & cover != null');
  });

  it('never puts the client secret in a token error message', async () => {
    const fetcher = fakeFetch([() => json({ message: 'invalid client' }, 403)]);
    const client = new IgdbClient({
      clientId: 'id',
      clientSecret: 'super-secret-value',
      clock: new TestClock(),
      fetchImpl: fetcher.impl,
    });

    await expect(client.query('fields name;')).rejects.toThrow(
      /Twitch token request failed with 403/,
    );
    await client.query('fields name;').catch((error: Error) => {
      expect(error.message).not.toContain('super-secret-value');
    });
  });
});
