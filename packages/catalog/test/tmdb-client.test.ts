import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Clock } from '../src/rate-limit';
import {
  MOVIE_APPEND,
  TmdbClient,
  TmdbError,
  TMDB_REQUESTS_PER_SECOND,
  TV_APPEND,
  changesDate,
  exportDateStamp,
  exportFileName,
} from '../src/tmdb';

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

interface Call {
  url: string;
  headers: Headers;
}

/**
 * A fetch stand-in that records calls and replays queued responses.
 *
 * The same shape `igdb.test.ts` uses: a list of thunks, the last one repeating
 * once the queue runs dry, so a test only has to queue the responses it cares
 * about.
 */
function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  let index = 0;

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next!();
  }) as unknown as typeof fetch;

  return {
    impl,
    calls,
    get count() {
      return index;
    },
  };
}

function client(fetcher: ReturnType<typeof fakeFetch>, clock = new TestClock()) {
  return new TmdbClient({
    readAccessToken: 'read-token',
    clock,
    fetchImpl: fetcher.impl,
  });
}

/** A gzipped newline-delimited export, built in memory. */
function gzippedExport(lines: unknown[]): Response {
  const body = gzipSync(Buffer.from(lines.map((line) => JSON.stringify(line)).join('\n') + '\n'));
  return new Response(body, { status: 200 });
}

describe('TmdbClient auth and request shape', () => {
  it('sends the read access token as a bearer on every request', async () => {
    const fetcher = fakeFetch([() => json({ id: 550 })]);
    await client(fetcher).movie(550);

    expect(fetcher.calls[0]!.headers.get('Authorization')).toBe('Bearer read-token');
    expect(fetcher.calls[0]!.headers.get('Accept')).toBe('application/json');
  });

  it('asks for exactly the movie append list and en-US', async () => {
    const fetcher = fakeFetch([() => json({ id: 550 })]);
    await client(fetcher).movie(550);

    const url = decodeURIComponent(fetcher.calls[0]!.url);
    expect(url).toContain('/3/movie/550');
    expect(url).toContain('language=en-US');
    expect(url).toContain(`append_to_response=${MOVIE_APPEND}`);
    expect(MOVIE_APPEND).toBe('credits,external_ids,release_dates,watch/providers');
  });

  it('asks for aggregate_credits rather than credits on a series', async () => {
    const fetcher = fakeFetch([() => json({ id: 1396 })]);
    await client(fetcher).tv(1396);

    const url = decodeURIComponent(fetcher.calls[0]!.url);
    expect(url).toContain('/3/tv/1396');
    expect(url).toContain(`append_to_response=${TV_APPEND}`);
    expect(TV_APPEND).toBe('aggregate_credits,external_ids,content_ratings,watch/providers');
  });

  it('answers null for a 404 on a title and throws on anything else', async () => {
    const missing = fakeFetch([() => json({ status_code: 34 }, 404)]);
    await expect(client(missing).movie(1)).resolves.toBeNull();

    const forbidden = fakeFetch([() => json({ status_code: 7 }, 401)]);
    await expect(client(forbidden).movie(1)).rejects.toBeInstanceOf(TmdbError);
  });
});

describe('TmdbClient rate limiting', () => {
  it('retries a 429 with a blind backoff when no Retry-After is sent', async () => {
    let calls = 0;
    const fetcher = fakeFetch([
      () => {
        calls += 1;
        return calls <= 2 ? json({ status_code: 25 }, 429) : json({ id: 550 });
      },
    ]);
    const clock = new TestClock();

    const result = await client(fetcher, clock).movie(550);

    expect(result).toEqual({ id: 550 });
    expect(clock.sleeps).toEqual([2000, 4000]);
  });

  it('honours Retry-After, capped as http.ts caps it', async () => {
    let calls = 0;
    const fetcher = fakeFetch([
      () => {
        calls += 1;
        return calls === 1
          ? json({ status_code: 25 }, 429, { 'retry-after': '7' })
          : json({ id: 550 });
      },
    ]);
    const clock = new TestClock();

    await client(fetcher, clock).movie(550);
    expect(clock.sleeps).toEqual([7000]);

    let more = 0;
    const hostile = fakeFetch([
      () => {
        more += 1;
        return more === 1
          ? json({ status_code: 25 }, 429, { 'retry-after': '99999' })
          : json({ id: 550 });
      },
    ]);
    const clock2 = new TestClock();
    await client(hostile, clock2).movie(550);
    expect(clock2.sleeps).toEqual([60_000]);
  });

  it('halves the pace after a second 429 in a row, and only then', async () => {
    const fetcher = fakeFetch([() => json({ status_code: 25 }, 429)]);
    const clock = new TestClock();
    const tmdb = new TmdbClient({
      readAccessToken: 'read-token',
      clock,
      fetchImpl: fetcher.impl,
      maxAttempts: 2,
    });

    expect(tmdb.requestsPerSecond).toBe(TMDB_REQUESTS_PER_SECOND);

    await expect(tmdb.movie(1)).rejects.toBeInstanceOf(TmdbError);

    // Two attempts, so exactly one pair of consecutive refusals.
    expect(tmdb.paceHalvings).toBe(1);
    expect(tmdb.requestsPerSecond).toBe(TMDB_REQUESTS_PER_SECOND / 2);
  });

  it('forgets a lone 429 once a good answer arrives', async () => {
    let calls = 0;
    const fetcher = fakeFetch([
      () => {
        calls += 1;
        // Refuse, succeed, refuse, succeed: never two in a row.
        return calls % 2 === 1 ? json({ status_code: 25 }, 429) : json({ id: calls });
      },
    ]);
    const clock = new TestClock();
    const tmdb = new TmdbClient({ readAccessToken: 't', clock, fetchImpl: fetcher.impl });

    await tmdb.movie(1);
    await tmdb.movie(2);

    expect(tmdb.paceHalvings).toBe(0);
    expect(tmdb.requestsPerSecond).toBe(TMDB_REQUESTS_PER_SECOND);
  });
});

describe('TmdbClient.changes', () => {
  it('walks every page and yields the ids', async () => {
    const pages = [
      () => json({ page: 1, total_pages: 3, results: [{ id: 1 }, { id: 2 }] }),
      () => json({ page: 2, total_pages: 3, results: [{ id: 3 }] }),
      () => json({ page: 3, total_pages: 3, results: [{ id: 4 }, { id: 5 }] }),
    ];
    const fetcher = fakeFetch(pages);

    const ids: number[] = [];
    for await (const id of client(fetcher).changes(
      'movie',
      new Date('2026-09-15T10:00:00.000Z'),
      new Date('2026-09-16T12:00:00.000Z'),
    )) {
      ids.push(id);
    }

    expect(ids).toEqual([1, 2, 3, 4, 5]);
    expect(fetcher.count).toBe(3);
    expect(fetcher.calls[0]!.url).toContain('/3/movie/changes');
    expect(fetcher.calls[0]!.url).toContain('start_date=2026-09-15');
    expect(fetcher.calls[0]!.url).toContain('end_date=2026-09-16');
    expect(fetcher.calls[2]!.url).toContain('page=3');
  });

  it('stops on an empty page whatever total_pages claims', async () => {
    const fetcher = fakeFetch([
      () => json({ page: 1, total_pages: 900, results: [{ id: 7 }] }),
      () => json({ page: 2, total_pages: 900, results: [] }),
    ]);

    const ids: number[] = [];
    for await (const id of client(fetcher).changes('tv', new Date(0), new Date(0))) ids.push(id);

    expect(ids).toEqual([7]);
    expect(fetcher.count).toBe(2);
    expect(fetcher.calls[0]!.url).toContain('/3/tv/changes');
  });
});

describe('TmdbClient.exportIds', () => {
  const date = new Date('2026-09-16T14:00:00.000Z');

  it('streams a gzipped export line by line', async () => {
    const fetcher = fakeFetch([
      () =>
        gzippedExport([
          { adult: false, id: 3924, original_title: 'Blondie', popularity: 2.17, video: false },
          { adult: false, id: 8773, original_title: "L'Amour", popularity: 1.59, video: false },
        ]),
    ]);

    const lines = [];
    for await (const line of client(fetcher).exportIds('movie', date)) lines.push(line);

    expect(lines.map((line) => line.id)).toEqual([3924, 8773]);
    expect(lines[0]!.popularity).toBe(2.17);
    expect(fetcher.calls[0]!.url).toBe(
      'https://files.tmdb.org/p/exports/movie_ids_09_16_2026.json.gz',
    );
  });

  it('sends no bearer token to the file host', async () => {
    const fetcher = fakeFetch([() => gzippedExport([{ id: 1, popularity: 9 }])]);
    for await (const _ of client(fetcher).exportIds('tv', date)) break;

    expect(fetcher.calls[0]!.headers.get('Authorization')).toBeNull();
    expect(fetcher.calls[0]!.url).toContain('tv_series_ids_09_16_2026.json.gz');
  });

  it("falls back to yesterday's file and says which date it read", async () => {
    let calls = 0;
    const fetcher = fakeFetch([
      () => {
        calls += 1;
        return calls === 1
          ? new Response('', { status: 404 })
          : gzippedExport([{ id: 42, popularity: 12 }]);
      },
    ]);
    const logged: string[] = [];

    const ids = [];
    for await (const line of client(fetcher).exportIds('movie', date, (m) => logged.push(m))) {
      ids.push(line.id);
    }

    expect(ids).toEqual([42]);
    expect(fetcher.calls[0]!.url).toContain('movie_ids_09_16_2026.json.gz');
    expect(fetcher.calls[1]!.url).toContain('movie_ids_09_15_2026.json.gz');
    expect(logged.join('\n')).toContain('movie_ids_09_15_2026.json.gz');
  });

  it('throws when neither day has a file', async () => {
    const fetcher = fakeFetch([() => new Response('', { status: 404 })]);

    await expect(async () => {
      for await (const _ of client(fetcher).exportIds('movie', date)) break;
    }).rejects.toThrow(/no movie export/);
  });

  it('skips a malformed line rather than abandoning the file', async () => {
    const body = gzipSync(Buffer.from(['{"id":1,"popularity":9}', 'not json', '', '{"id":2}'].join('\n')));
    const fetcher = fakeFetch([() => new Response(body, { status: 200 })]);

    const ids = [];
    for await (const line of client(fetcher).exportIds('movie', date)) ids.push(line.id);

    expect(ids).toEqual([1, 2]);
  });
});

describe('date helpers', () => {
  it('stamps an export file name in UTC', () => {
    // 00:30 UTC on the 16th is still the 15th in New York; the file name has
    // to follow TMDB's clock, not the runner's.
    expect(exportDateStamp(new Date('2026-09-16T00:30:00.000Z'))).toBe('09_16_2026');
    expect(exportFileName('movie', new Date('2026-01-02T23:00:00.000Z'))).toBe(
      'movie_ids_01_02_2026.json.gz',
    );
    expect(exportFileName('tv', new Date('2026-01-02T23:00:00.000Z'))).toBe(
      'tv_series_ids_01_02_2026.json.gz',
    );
  });

  it('gives the changes endpoint a plain UTC date', () => {
    expect(changesDate(new Date('2026-09-16T23:59:59.000Z'))).toBe('2026-09-16');
  });
});
