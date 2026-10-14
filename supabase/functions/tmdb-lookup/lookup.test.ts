/**
 * `lookup.ts` against fixtures. Run with:
 *
 *   deno test supabase/functions/tmdb-lookup
 *
 * No permissions and no network: every test passes its own `fetch`, which
 * answers from fixtures and records what was asked, and the database is a
 * recorder. The token is a fake string. What the mirror's statements do to a
 * real Postgres is packages/catalog's business (tmdb-live.test.ts runs them
 * against the local stack); what this file proves is that the lookup picks
 * the right film, asks TMDB for it exactly as the nightly run does, keeps and
 * maps it with the mirror's own rules, meters the caller, and hands the
 * mirror's own statements one film inside a locked transaction.
 *
 * The fixtures:
 *
 *   fixtures/search-movie.json   a `/3/search/movie` page for "fight club"
 *                                with an adult result, a near title, a
 *                                posterless exact title, then the real one.
 *   packages/catalog/test/fixtures/tmdb-movie-normal.json
 *                                Fight Club (550) with every sub-resource,
 *                                the mirror's own fixture.
 *   packages/catalog/test/fixtures/tmdb-movie-dropped.json
 *                                a film the keep rule refuses.
 */

import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import searchFixture from './fixtures/search-movie.json' with { type: 'json' };
import normalFixture from '../../../packages/catalog/test/fixtures/tmdb-movie-normal.json' with { type: 'json' };
import droppedFixture from '../../../packages/catalog/test/fixtures/tmdb-movie-dropped.json' with { type: 'json' };
import { mapMovie } from '../../../packages/catalog/src/tmdb-map.ts';
import { movieDetailPath } from '../../../packages/catalog/src/tmdb-paths.ts';
import type { MappedMovie, TmdbMovieDetail } from '../../../packages/catalog/src/tmdb-types.ts';
import type { SqlClient, SqlResult } from '../../../packages/catalog/src/tmdb-write.ts';
import {
  bestMatch,
  DEFAULT_PER_MINUTE,
  foldTitle,
  lookup,
  type LookupDb,
  LOOKUP_EVENT,
  parseLookupRequest,
  readPerMinute,
  searchPath,
  storeMovie,
  TmdbLookupError,
  type TmdbSearchResult,
} from './lookup.ts';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const TOKEN = 'test-token';
const UUID = '11111111-1111-4111-8111-111111111111';
const SEARCH = (searchFixture as { results: TmdbSearchResult[] }).results;

// -- Fakes ----------------------------------------------------------------------

/** A `fetch` that answers by path from a table and records every URL and header. */
function fakeFetch(routes: Array<{ match: (url: URL) => boolean; status?: number; body?: unknown }>) {
  const calls: Array<{ url: URL; authorization: string | null }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, authorization: new Headers(init?.headers).get('Authorization') });
    const route = routes.find((candidate) => candidate.match(url));
    if (!route) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const isSearch = (url: URL) => url.pathname === '/3/search/movie';
const isMovie = (id: number) => (url: URL) => url.pathname === `/3/movie/${id}`;

/** The database half: a meter with a count, and a store that records what it was given. */
function fakeDb(used = 0) {
  const recorded: string[] = [];
  const stored: MappedMovie[] = [];
  const db: LookupDb = {
    async countRecentLookups(since) {
      recorded.push(`count since ${since}`);
      return used;
    },
    async recordLookup() {
      recorded.push('record');
    },
    async storeMovie(movie, seenAt) {
      assertEquals(seenAt, NOW);
      stored.push(movie);
      return UUID;
    },
  };
  return { db, recorded, stored };
}

function deps(fetchImpl: typeof fetch, db: LookupDb, perMinute = DEFAULT_PER_MINUTE) {
  return { db, fetch: fetchImpl, token: TOKEN, perMinute, now: () => NOW };
}

// -- The request ------------------------------------------------------------------

Deno.test('a query is trimmed, its runs of spaces collapsed, and passed on', () => {
  assertEquals(parseLookupRequest({ query: '  fight   club ' }), {
    ok: true,
    value: { query: 'fight club', tmdbId: null },
  });
});

Deno.test('an id alone is enough, and skips nothing else', () => {
  assertEquals(parseLookupRequest({ tmdbId: 550 }), { ok: true, value: { query: null, tmdbId: 550 } });
});

Deno.test('the request refuses unknown fields, blanks, bad ids and essays', () => {
  for (const body of [
    null,
    [],
    'fight club',
    {},
    { query: '   ' },
    { query: 3 },
    { query: 'x', medium: 'movie' },
    { tmdbId: 0 },
    { tmdbId: 1.5 },
    { tmdbId: '550' },
    { query: 'a'.repeat(201) },
  ]) {
    const parsed = parseLookupRequest(body);
    assert(!parsed.ok, `accepted ${JSON.stringify(body)}`);
  }
});

Deno.test('the meter reads its limit from the environment, 0 included, and defaults otherwise', () => {
  assertEquals(readPerMinute(undefined), DEFAULT_PER_MINUTE);
  assertEquals(readPerMinute(''), DEFAULT_PER_MINUTE);
  assertEquals(readPerMinute('3'), 3);
  assertEquals(readPerMinute('0'), 0);
  assertEquals(readPerMinute('-1'), DEFAULT_PER_MINUTE);
  assertEquals(readPerMinute('lots'), DEFAULT_PER_MINUTE);
});

// -- The match --------------------------------------------------------------------

Deno.test('the match skips the adult result, the posterless one and the near title for the exact one', () => {
  assertEquals(bestMatch(SEARCH, 'fight club'), 550);
  assertEquals(bestMatch(SEARCH, 'FIGHT CLUB!'), 550);
});

Deno.test('with no exact title the match is TMDB\'s first usable result', () => {
  assertEquals(bestMatch(SEARCH, 'members only fight'), 1137350);
});

Deno.test('nothing usable is no match', () => {
  assertEquals(bestMatch([], 'anything'), null);
  assertEquals(bestMatch([SEARCH[0]!, SEARCH[2]!], 'fight club'), null);
  assertEquals(bestMatch([{ id: 7, title: 'Clip', video: true, poster_path: '/a.jpg' }], 'clip'), null);
});

Deno.test('titles fold case, accents and punctuation', () => {
  assertEquals(foldTitle('Amélie'), foldTitle('amelie'));
  assertEquals(foldTitle('Alien: Romulus'), 'alien romulus');
  assertEquals(foldTitle(undefined), '');
});

Deno.test('the search asks for one page in English with adult titles left out', () => {
  const url = new URL(`https://api.themoviedb.org${searchPath('amélie & co')}`);
  assertEquals(url.pathname, '/3/search/movie');
  assertEquals(url.searchParams.get('query'), 'amélie & co');
  assertEquals(url.searchParams.get('include_adult'), 'false');
  assertEquals(url.searchParams.get('language'), 'en-US');
  assertEquals(url.searchParams.get('page'), '1');
});

// -- The lookup -------------------------------------------------------------------

Deno.test('a miss is searched, fetched the way the mirror fetches, mapped by the mirror and stored', async () => {
  const { impl, calls } = fakeFetch([
    { match: isSearch, body: searchFixture },
    { match: isMovie(550), body: normalFixture },
  ]);
  const { db, recorded, stored } = fakeDb();

  const outcome = await lookup(deps(impl, db), { query: 'fight club', tmdbId: null });

  assertEquals(outcome, { status: 200, body: { mediaItemId: UUID, tmdbId: 550 } });
  assertEquals(calls.length, 2);
  assertEquals(`${calls[1]!.url.pathname}${calls[1]!.url.search}`, movieDetailPath(550));
  for (const call of calls) assertEquals(call.authorization, `Bearer ${TOKEN}`);

  // Exactly what the nightly run would have written for the same response.
  assertEquals(stored, [mapMovie(normalFixture as unknown as TmdbMovieDetail, NOW, ['US'])]);

  // The meter counted the last minute, then logged this lookup, before TMDB was asked.
  assertEquals(recorded, [`count since ${new Date(NOW.getTime() - 60_000).toISOString()}`, 'record']);
});

Deno.test('an id skips the search', async () => {
  const { impl, calls } = fakeFetch([{ match: isMovie(550), body: normalFixture }]);
  const { db, stored } = fakeDb();

  const outcome = await lookup(deps(impl, db), { query: null, tmdbId: 550 });

  assertEquals(outcome.status, 200);
  assertEquals(calls.map((call) => call.url.pathname), ['/3/movie/550']);
  assertEquals(stored.length, 1);
});

Deno.test('over the limit is a 429 that asks TMDB nothing and logs nothing', async () => {
  const { impl, calls } = fakeFetch([]);
  const { db, recorded } = fakeDb(5);

  const outcome = await lookup(deps(impl, db, 5), { query: 'fight club', tmdbId: null });

  assertEquals(outcome, {
    status: 429,
    body: { error: 'rate_limited', limit: 5, used: 5, retryAfterSeconds: 60 },
  });
  assertEquals(calls.length, 0);
  assertEquals(recorded.length, 1);
});

Deno.test('a limit of 0 turns lookups off', async () => {
  const { impl, calls } = fakeFetch([]);
  const outcome = await lookup(deps(impl, fakeDb().db, 0), { query: 'fight club', tmdbId: null });
  assertEquals(outcome.status, 429);
  assertEquals(calls.length, 0);
});

Deno.test('no match is a 200 with nothing, after one request', async () => {
  const { impl, calls } = fakeFetch([{ match: isSearch, body: { page: 1, results: [] } }]);
  const { db, stored } = fakeDb();

  const outcome = await lookup(deps(impl, db), { query: 'zzzz', tmdbId: null });

  assertEquals(outcome, { status: 200, body: { mediaItemId: null, tmdbId: null } });
  assertEquals(calls.length, 1);
  assertEquals(stored.length, 0);
});

Deno.test('a film the keep rule refuses is not written', async () => {
  const { impl } = fakeFetch([{ match: isMovie(424242), body: droppedFixture }]);
  const { db, stored } = fakeDb();

  const outcome = await lookup(deps(impl, db), { query: null, tmdbId: 424242 });

  assertEquals(outcome, { status: 200, body: { mediaItemId: null, tmdbId: 424242 } });
  assertEquals(stored.length, 0);
});

Deno.test('an adult film is not written even when its id is asked for directly', async () => {
  const { impl } = fakeFetch([{ match: isMovie(550), body: { ...normalFixture, adult: true } }]);
  const { db, stored } = fakeDb();

  const outcome = await lookup(deps(impl, db), { query: null, tmdbId: 550 });

  assertEquals(outcome.body, { mediaItemId: null, tmdbId: 550 });
  assertEquals(stored.length, 0);
});

Deno.test('a 404 for the film is nothing, not an error', async () => {
  const { impl } = fakeFetch([]);
  const { db, stored } = fakeDb();

  const outcome = await lookup(deps(impl, db), { query: null, tmdbId: 1 });

  assertEquals(outcome.body, { mediaItemId: null, tmdbId: 1 });
  assertEquals(stored.length, 0);
});

Deno.test('a TMDB failure throws a status, never the URL or the token, and still counts', async () => {
  const { impl } = fakeFetch([{ match: isSearch, status: 503, body: { status_message: 'down' } }]);
  const { db, recorded } = fakeDb();

  const error = await assertRejects(
    () => lookup(deps(impl, db), { query: 'fight club', tmdbId: null }),
    TmdbLookupError,
  );
  assertEquals((error as TmdbLookupError).status, 503);
  assert(!error.message.includes(TOKEN));
  assert(!error.message.includes('themoviedb'));
  assert(recorded.includes('record'));
});

// -- The write --------------------------------------------------------------------

interface Statement {
  text: string;
  values: unknown[];
}

/** A `SqlClient` that records statements and answers the `media_items` one with a uuid. */
function recordingClient(failOn?: string) {
  const statements: Statement[] = [];
  const client: SqlClient = {
    async query(text: string, values: unknown[] = []): Promise<SqlResult> {
      statements.push({ text, values });
      if (failOn && text.includes(failOn)) throw new Error('boom');
      if (text.includes('insert into public.media_items')) {
        return { rows: [{ id: UUID, tmdb_id: 550 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, statements };
}

const MAPPED = mapMovie(normalFixture as unknown as TmdbMovieDetail, NOW, ['US'])!;

Deno.test('one film is written in one transaction, locked on its TMDB id, through the mirror\'s statements', async () => {
  const { client, statements } = recordingClient();

  const id = await storeMovie(client, MAPPED, NOW);

  assertEquals(id, UUID);
  assertEquals(statements[0]!.text, 'begin');
  assertStringIncludes(statements[1]!.text, 'pg_advisory_xact_lock');
  assertEquals(statements[1]!.values, [LOOKUP_EVENT, 550]);
  assertEquals(statements.at(-1)!.text, 'commit');

  const body = statements.slice(2, -1).map((statement) => statement.text).join('\n');
  // The identity lives in movie_details, and the jsonb columns merge, as the mirror's do.
  assertStringIncludes(body, 'left join public.movie_details d on d.tmdb_id = i.tmdb_id');
  assertStringIncludes(body, 'metadata = m.metadata || e.metadata');
  for (const table of [
    'public.movie_details',
    'public.external_scores',
    'public.media_release_dates',
    'public.media_certifications',
    'public.watch_providers',
    'public.watch_availability',
  ]) {
    assertStringIncludes(body, table);
  }

  // The media_items row carries the mapped film, tmdb id and all.
  const rows = JSON.parse(statements[2]!.values[0] as string) as Array<{ tmdb_id: number; title: string }>;
  assertEquals(rows.map((row) => [row.tmdb_id, row.title]), [[550, 'Fight Club']]);
});

Deno.test('a failed statement rolls the whole film back', async () => {
  const { client, statements } = recordingClient('public.watch_availability');

  await assertRejects(() => storeMovie(client, MAPPED, NOW), Error, 'boom');

  assertEquals(statements.at(-1)!.text, 'rollback');
  assert(!statements.some((statement) => statement.text === 'commit'));
});
