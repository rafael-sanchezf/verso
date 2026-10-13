import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The same `pg` stand-in `db-sql.test.ts` uses, and for the same reason: the
 * interesting part of these methods is the SQL, and none of it is visible from
 * a return value. Which conflict target a statement names, whether it merges
 * jsonb or replaces it, what the reconciliation is scoped to -- that is what
 * these tests read. The semantics behind the statements are checked against a
 * real Postgres by `tmdb-live.test.ts`.
 *
 * A separate file from `db-sql.test.ts` rather than more describes inside it,
 * because the two mirrors share nothing but the module: one recorded-statement
 * queue per file keeps a failure in one from reading as a failure in the other.
 */
interface Recorded {
  text: string;
  values: unknown[];
}

const recorded: Recorded[] = [];
let results: Array<{ rows?: unknown[]; rowCount?: number }> = [];
let resultIndex = 0;

const TRANSACTION_CONTROL = ['begin', 'commit', 'rollback'];

/**
 * An optional answer computed from the statement itself, consulted before the
 * queue. The batched writes need it: how many uuids the `media_items`
 * statement hands back depends on how many titles it was sent, which a fixed
 * queue cannot know.
 */
type Responder = (text: string, values: unknown[]) => { rows?: unknown[]; rowCount?: number } | undefined;
let responder: Responder | null = null;

function nextResult(text: string, values: unknown[] = []): { rows: unknown[]; rowCount: number } {
  if (TRANSACTION_CONTROL.includes(text)) return { rows: [], rowCount: 0 };

  const answered = responder?.(text, values);
  if (answered) {
    return { rows: answered.rows ?? [], rowCount: answered.rowCount ?? answered.rows?.length ?? 0 };
  }

  const queued = results[resultIndex] ?? {};
  resultIndex += 1;
  return { rows: queued.rows ?? [], rowCount: queued.rowCount ?? queued.rows?.length ?? 0 };
}

vi.mock('pg', () => {
  class FakeClient {
    async query(text: string, values?: unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return nextResult(text, values);
    }
    release(): void {}
  }
  class FakePool {
    async query(text: string, values?: unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return nextResult(text, values);
    }
    async connect() {
      return new FakeClient();
    }
    async end(): Promise<void> {}
  }
  return { default: { Pool: FakePool } };
});

const { BATCH_SIZE, CatalogStore, TMDB_MISSING_KEY, dedupeProviderStubs, detailsTable } =
  await import('../src/db');
const { mapMovie, mapTv } = await import('../src/tmdb-map');
type TmdbMovieDetail = import('../src/tmdb-types').TmdbMovieDetail;
type TmdbTvDetail = import('../src/tmdb-types').TmdbTvDetail;
type MappedMovie = import('../src/tmdb-types').MappedMovie;
type MappedTv = import('../src/tmdb-types').MappedTv;

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const NOW = new Date('2026-09-16T12:00:00.000Z');
const UUID = '11111111-1111-4111-8111-111111111111';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

function store() {
  return new CatalogStore(LOCAL);
}

function statements(): Recorded[] {
  return recorded.filter((entry) => !TRANSACTION_CONTROL.includes(entry.text));
}

function find(fragment: string): Recorded {
  const match = statements().find((entry) => entry.text.includes(fragment));
  if (!match) throw new Error(`no statement containing ${fragment}`);
  return match;
}

function findAll(fragment: string): Recorded[] {
  return statements().filter((entry) => entry.text.includes(fragment));
}

/** The order the statements ran in, named by the table each touches. */
function touchedTables(): string[] {
  const tables = [
    'public.media_items',
    'public.movie_details',
    'public.tv_details',
    'public.external_scores',
    'public.tv_seasons',
    'public.media_release_dates',
    'public.media_certifications',
    'public.watch_providers',
    'public.watch_availability',
  ];
  return statements().flatMap((entry) => {
    const table = tables.find((name) => entry.text.includes(name));
    return table ? [table] : [];
  });
}

beforeEach(() => {
  recorded.length = 0;
  results = [];
  resultIndex = 0;
  responder = null;
});

/** One `media_items` upsert's RETURNING, which every later statement needs. */
function mediaItemId() {
  return { rows: [{ id: UUID }] };
}

describe('the TMDB selection queries', () => {
  it('reads the ids of a medium through its details table, never external_ids', async () => {
    results = [{ rows: [{ tmdb_id: 550 }, { tmdb_id: 1396 }] }];
    const ids = await store().tmdbIds('movie');

    expect(ids).toEqual(new Set([550, 1396]));
    const query = find('select d.tmdb_id');
    expect(query.text).toContain('public.movie_details');
    expect(query.text).not.toContain('external_ids');
  });

  it('names the tv details table for a series', async () => {
    results = [{ rows: [] }];
    await store().tmdbIds('tv');
    expect(find('select d.tmdb_id').text).toContain('public.tv_details');
    expect(detailsTable('tv')).toBe('public.tv_details');
  });

  it('reads the fresh ids by joining media_items.refreshed_at', async () => {
    results = [{ rows: [{ tmdb_id: 7 }] }];
    await store().tmdbFreshIds('movie', new Date('2026-04-19T12:00:00.000Z'));

    const query = find('m.refreshed_at >= $1');
    expect(query.text).toContain('join public.media_items m on m.id = d.media_item_id');
    expect(query.values[0]).toBe('2026-04-19T12:00:00.000Z');
  });

  it('selects stale targets oldest first and skips the recently missing', async () => {
    results = [{ rows: [{ media_item_id: UUID, tmdb_id: '550' }] }];
    const targets = await store().tmdbStaleTargets({
      kind: 'movie',
      staleBefore: new Date('2026-04-19T12:00:00.000Z'),
      missingBefore: new Date('2026-06-18T12:00:00.000Z'),
      limit: 250,
    });

    expect(targets).toEqual([{ media_item_id: UUID, tmdb_id: 550 }]);
    const query = find('m.refreshed_at < $1');
    expect(query.text).toContain(`m.metadata->>'${TMDB_MISSING_KEY}' is null`);
    expect(query.text).toContain(`(m.metadata->>'${TMDB_MISSING_KEY}')::timestamptz < $2`);
    expect(query.text).toContain('order by m.refreshed_at asc, d.tmdb_id');
    expect(query.values).toEqual([
      '2026-04-19T12:00:00.000Z',
      '2026-06-18T12:00:00.000Z',
      250,
    ]);
  });

  it('counts one medium through the enum rather than a details table', async () => {
    results = [{ rows: [{ count: '41230' }] }];
    expect(await store().mediumRowCount('movie')).toBe(41230);
    expect(find('count(*)::text').values).toEqual(['movie']);
  });
});

describe('upsertWatchProviders', () => {
  it('replaces name, logo and priorities, and never deletes a provider', async () => {
    results = [{ rowCount: 5 }];
    await store().upsertWatchProviders([
      { provider_id: 8, name: 'Netflix', logo_image_id: '/n.jpg', display_priorities: { US: 0 } },
    ]);

    const upsert = find('insert into public.watch_providers');
    expect(upsert.text).toContain('on conflict (provider_id) do update');
    expect(upsert.text).toContain('display_priorities = excluded.display_priorities');
    expect(upsert.text).toContain('refreshed_at = excluded.refreshed_at');
    // watch_availability references this table `on delete no action`, so a
    // provider with offers could not be deleted anyway.
    expect(statements().some((entry) => entry.text.includes('delete from public.watch_providers')))
      .toBe(false);
  });
});

describe('upsertMoviesPerTitle, the reference path', () => {
  const movie = () => mapMovie(fixture<TmdbMovieDetail>('tmdb-movie-normal.json'), NOW, ['US'])!;

  it('matches media_items through movie_details.tmdb_id, never through external_ids', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const upsert = find('with existing as');
    expect(upsert.text).toContain('from public.movie_details d where d.tmdb_id = $1');
    expect(upsert.text).toContain("insert into public.media_items");
    expect(upsert.text).toContain("'movie'::public.medium");
    expect(upsert.text).not.toContain("external_ids->>'tmdb'");
    expect(upsert.values[0]).toBe(550);
  });

  it('merges external_ids and metadata instead of replacing them', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const upsert = find('with existing as');
    expect(upsert.text).toContain('external_ids = m.external_ids || $6::jsonb');
    expect(upsert.text).toContain('metadata = m.metadata || $7::jsonb');
    expect(upsert.text).not.toContain('external_ids = $6');
    expect(upsert.text).not.toContain('metadata = $7');
  });

  it('runs the tables in the order the design doc sets out', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    expect(touchedTables()).toEqual([
      'public.media_items',
      'public.movie_details',
      'public.external_scores',
      'public.media_release_dates',
      'public.media_release_dates',
      'public.media_certifications',
      'public.media_certifications',
      'public.watch_providers',
      'public.watch_availability',
      'public.watch_availability',
    ]);
  });

  it('upserts movie_details on its tmdb_id and repoints media_item_id', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const details = find('insert into public.movie_details');
    expect(details.text).toContain('on conflict (tmdb_id) do update');
    expect(details.text).toContain('media_item_id = excluded.media_item_id');
    expect(details.values[0]).toBe(UUID);
    expect(details.values[1]).toBe(550);
  });

  it('writes the tmdb score in the same transaction, keyed by the returned uuid', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const score = find('insert into public.external_scores');
    expect(score.text).toContain('on conflict (media_item_id, source) do update');
    expect(score.values).toEqual([UUID, 'tmdb', 84.38, 30127]);
  });

  it('writes no external_scores row at all for a film nobody has voted on', async () => {
    results = [mediaItemId()];
    const unvoted = mapMovie(fixture<TmdbMovieDetail>('tmdb-movie-unvoted.json'), NOW, ['US'])!;
    await store().upsertMoviesPerTitle([unvoted], NOW);

    expect(findAll('insert into public.external_scores')).toHaveLength(0);
  });

  it('replaces release dates and certifications whole, scoped to the run regions', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const deleteDates = find('delete from public.media_release_dates');
    expect(deleteDates.text).toContain('media_item_id = $1::uuid and region = any($2::text[])');
    expect(deleteDates.values).toEqual([UUID, ['US']]);

    const deleteCerts = find('delete from public.media_certifications');
    expect(deleteCerts.text).toContain('region = any($2::text[])');
    expect(deleteCerts.values).toEqual([UUID, ['US']]);

    // The insert follows the delete, never the other way round.
    const order = statements().map((entry) => entry.text);
    expect(order.findIndex((text) => text.includes('delete from public.media_release_dates')))
      .toBeLessThan(
        order.findIndex((text) => text.includes('insert into public.media_release_dates')),
      );
  });

  it('sends one release-date row per region, type and date', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const insert = find('insert into public.media_release_dates');
    const rows = JSON.parse(String(insert.values[1])) as Array<{
      region: string;
      release_type: number;
      released_on: string;
    }>;
    const keys = rows.map((row) => `${row.region} ${row.release_type} ${row.released_on}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('inserts the provider stubs before the availability rows, without clobbering the directory', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const stubs = find('on conflict (provider_id) do nothing');
    expect(stubs.text).toContain('insert into public.watch_providers');

    const order = statements().map((entry) => entry.text);
    expect(order.findIndex((text) => text.includes('on conflict (provider_id) do nothing')))
      .toBeLessThan(
        order.findIndex((text) => text.includes('insert into public.watch_availability')),
      );
  });

  it('reconciles availability scoped to the one title and the one region', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    const seen = find('insert into public.watch_availability');
    expect(seen.text).toContain(
      'on conflict (media_item_id, region, provider_id, offer_type) do update',
    );
    expect(seen.text).toContain('last_seen_at = excluded.last_seen_at');
    expect(seen.text).toContain('removed_at = null');
    // first_seen_at is absent from the update list on purpose: a title that
    // comes back keeps the day it first arrived.
    expect(seen.text).not.toContain('first_seen_at = excluded');
    expect(seen.values[2]).toBe(NOW.toISOString());

    const close = find('update public.watch_availability');
    expect(close.text).toContain('media_item_id = $1::uuid');
    expect(close.text).toContain('and region = $2');
    expect(close.text).toContain('and removed_at is null');
    expect(close.text).toContain('and last_seen_at < $3::timestamptz');
    expect(close.values).toEqual([UUID, 'US', NOW.toISOString()]);
  });

  it('still closes out a region for a title with no offers anywhere', async () => {
    results = [mediaItemId()];
    const unvoted = mapMovie(fixture<TmdbMovieDetail>('tmdb-movie-unvoted.json'), NOW, [
      'US',
      'GB',
    ])!;
    await store().upsertMoviesPerTitle([unvoted], NOW);

    expect(findAll('insert into public.watch_availability')).toHaveLength(0);
    const closes = findAll('update public.watch_availability');
    expect(closes).toHaveLength(2);
    expect(closes.map((entry) => entry.values[1])).toEqual(['US', 'GB']);
  });

  it('writes each title in one transaction and rolls back on a failure', async () => {
    results = [mediaItemId()];
    await store().upsertMoviesPerTitle([movie()], NOW);

    expect(recorded[0]!.text).toBe('begin');
    expect(recorded[recorded.length - 1]!.text).toBe('commit');
  });

  it('keeps the last of two mappings that share a tmdb id', async () => {
    results = [mediaItemId()];
    const first = movie();
    const second = movie();
    second.mediaItem.title = 'Fight Club (2026 restoration)';

    await store().upsertMoviesPerTitle([first, second], NOW);

    const upserts = findAll('with existing as');
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.values[1]).toBe('Fight Club (2026 restoration)');
  });
});

describe('upsertShowsPerTitle, the reference path', () => {
  const show = () => mapTv(fixture<TmdbTvDetail>('tmdb-tv-returning.json'), NOW, ['US'])!;

  it('runs the tables in the design doc order, seasons in place of release dates', async () => {
    results = [mediaItemId()];
    await store().upsertShowsPerTitle([show()], NOW);

    expect(touchedTables()).toEqual([
      'public.media_items',
      'public.tv_details',
      'public.external_scores',
      'public.tv_seasons',
      'public.tv_seasons',
      'public.media_certifications',
      'public.media_certifications',
      'public.watch_providers',
      'public.watch_availability',
      'public.watch_availability',
    ]);
  });

  it("matches media_items through tv_details.tmdb_id and inserts with medium 'tv'", async () => {
    results = [mediaItemId()];
    await store().upsertShowsPerTitle([show()], NOW);

    const upsert = find('with existing as');
    expect(upsert.text).toContain('from public.tv_details d where d.tmdb_id = $1');
    expect(upsert.text).toContain("'tv'::public.medium");
    expect(upsert.values[0]).toBe(1396);
  });

  it('replaces the whole season list rather than a per-region slice', async () => {
    results = [mediaItemId()];
    await store().upsertShowsPerTitle([show()], NOW);

    const remove = find('delete from public.tv_seasons');
    expect(remove.text).toContain('where media_item_id = $1::uuid');
    expect(remove.text).not.toContain('region');
    expect(remove.values).toEqual([UUID]);

    const insert = find('insert into public.tv_seasons');
    const rows = JSON.parse(String(insert.values[1])) as Array<{ season_number: number }>;
    expect(rows.map((row) => row.season_number)).toEqual([0, 1, 2, 3]);
  });

  it('upserts tv_details on its tmdb_id', async () => {
    results = [mediaItemId()];
    await store().upsertShowsPerTitle([show()], NOW);

    const details = find('insert into public.tv_details');
    expect(details.text).toContain('on conflict (tmdb_id) do update');
    expect(details.text).toContain('media_item_id = excluded.media_item_id');
    expect(details.text).toContain('next_episode_air_date = excluded.next_episode_air_date');
  });
});

describe('markTmdbMissing', () => {
  it('merges the stamp into metadata and touches nothing else', async () => {
    results = [{ rowCount: 1 }];
    await store().markTmdbMissing('movie', 550, NOW);

    const update = find('update public.media_items');
    expect(update.text).toContain(
      `metadata = m.metadata || jsonb_build_object('${TMDB_MISSING_KEY}', $2::text)`,
    );
    expect(update.text).toContain('from public.movie_details d');
    expect(update.text).toContain('where d.tmdb_id = $1');
    expect(update.values).toEqual([550, NOW.toISOString()]);
    // Never a delete: a user may have ranked the title.
    expect(statements().some((entry) => entry.text.includes('delete from public.media_items')))
      .toBe(false);
  });

  it('names the tv details table for a series', async () => {
    results = [{ rowCount: 0 }];
    await store().markTmdbMissing('tv', 1396, NOW);
    expect(find('update public.media_items').text).toContain('from public.tv_details d');
  });
});

// --- The batched writes the sync calls (VER-163) ----------------------------

/** A uuid per TMDB id, the same on both paths, so their rows can be compared. */
function uuidFor(tmdbId: number): string {
  return `00000000-0000-4000-8000-${tmdbId.toString(16).padStart(12, '0')}`;
}

/**
 * Answer every `media_items` statement, per-title or batched, with the uuid
 * {@link uuidFor} derives from the TMDB id it was sent.
 */
function answerMediaItems(): void {
  responder = (text, values) => {
    if (text.includes('with incoming as')) {
      const rows = JSON.parse(String(values[0])) as Array<{ tmdb_id: number }>;
      return { rows: rows.map((row) => ({ id: uuidFor(row.tmdb_id), tmdb_id: row.tmdb_id })) };
    }
    if (text.includes('with existing as')) return { rows: [{ id: uuidFor(Number(values[0])) }] };
    return undefined;
  };
}

function mappedMovie(name: string, regions: string[], id?: number): MappedMovie {
  const detail = fixture<TmdbMovieDetail>(name);
  if (id !== undefined) detail.id = id;
  return mapMovie(detail, NOW, regions)!;
}

function mappedShow(name: string, regions: string[], id?: number): MappedTv {
  const detail = fixture<TmdbTvDetail>(name);
  if (id !== undefined) detail.id = id;
  return mapTv(detail, NOW, regions)!;
}

/** `count` copies of the normal film, each with its own TMDB id. */
function manyMovies(count: number, regions = ['US', 'GB']): MappedMovie[] {
  return Array.from({ length: count }, (_, index) =>
    mappedMovie('tmdb-movie-normal.json', regions, 1_000 + index),
  );
}

const MOVIE_BATCH_TABLES = [
  'public.media_items',
  'public.movie_details',
  'public.external_scores',
  'public.media_release_dates',
  'public.media_release_dates',
  'public.media_certifications',
  'public.media_certifications',
  'public.watch_providers',
  'public.watch_availability',
  'public.watch_availability',
];

describe('upsertMovies, batched', () => {
  it(`writes a ${BATCH_SIZE}-title batch in ten statements inside one transaction`, async () => {
    answerMediaItems();
    const counts = await store().upsertMovies(manyMovies(BATCH_SIZE), NOW);

    expect(recorded[0]!.text).toBe('begin');
    expect(recorded[recorded.length - 1]!.text).toBe('commit');
    expect(recorded.filter((entry) => entry.text === 'begin')).toHaveLength(1);
    expect(statements()).toHaveLength(10);
    expect(touchedTables()).toEqual(MOVIE_BATCH_TABLES);

    expect(JSON.parse(String(find('with incoming as').values[0]))).toHaveLength(BATCH_SIZE);
    expect(JSON.parse(String(find('insert into public.movie_details').values[0]))).toHaveLength(
      BATCH_SIZE,
    );
    expect(counts.mediaItems).toBe(BATCH_SIZE);
    expect(counts.details).toBe(BATCH_SIZE);
  });

  it('sends the same number of statements for one title as for many', async () => {
    answerMediaItems();
    await store().upsertMovies(manyMovies(1), NOW);
    const one = statements().length;

    recorded.length = 0;
    await store().upsertMovies(manyMovies(37), NOW);
    expect(statements().length).toBe(one);
  });

  it('starts a second transaction past BATCH_SIZE titles', async () => {
    answerMediaItems();
    await store().upsertMovies(manyMovies(BATCH_SIZE + 1), NOW);

    expect(recorded.filter((entry) => entry.text === 'begin')).toHaveLength(2);
    expect(recorded.filter((entry) => entry.text === 'commit')).toHaveLength(2);
    const sizes = findAll('with incoming as').map(
      (entry) => (JSON.parse(String(entry.values[0])) as unknown[]).length,
    );
    expect(sizes).toEqual([BATCH_SIZE, 1]);
  });

  it('matches media_items through movie_details.tmdb_id and merges the jsonb columns', async () => {
    answerMediaItems();
    await store().upsertMovies(manyMovies(2), NOW);

    const upsert = find('with incoming as');
    expect(upsert.text).toContain('left join public.movie_details d on d.tmdb_id = i.tmdb_id');
    expect(upsert.text).toContain("'movie'::public.medium");
    expect(upsert.text).toContain('where m.id = e.id');
    expect(upsert.text).toContain('where e.id is null');
    expect(upsert.text).toContain('external_ids = m.external_ids || e.external_ids');
    expect(upsert.text).toContain('metadata = m.metadata || e.metadata');
    // The identity is never looked up through external_ids; the insert branch
    // only reads its own id back out of the row it wrote.
    expect(upsert.text).not.toContain("external_ids->>'tmdb' =");
    expect(upsert.values).toHaveLength(1);
  });

  it('fails the batch, and rolls it back, when a title gets no uuid back', async () => {
    responder = (text) => (text.includes('with incoming as') ? { rows: [] } : undefined);

    await expect(store().upsertMovies(manyMovies(1), NOW)).rejects.toThrow(
      'media_items upsert returned no id for tmdb 1000',
    );
    expect(recorded.map((entry) => entry.text)).toContain('rollback');
    expect(recorded.map((entry) => entry.text)).not.toContain('commit');
  });

  it('keeps the last of two mappings that share a tmdb id', async () => {
    answerMediaItems();
    const first = mappedMovie('tmdb-movie-normal.json', ['US']);
    const second = mappedMovie('tmdb-movie-normal.json', ['US']);
    second.mediaItem.title = 'Fight Club (2026 restoration)';

    await store().upsertMovies([first, second], NOW);

    const rows = JSON.parse(String(find('with incoming as').values[0])) as Array<{ title: string }>;
    expect(rows.map((row) => row.title)).toEqual(['Fight Club (2026 restoration)']);
  });

  it('scopes the replacements and the close-out to each title and its own regions', async () => {
    answerMediaItems();
    const us = mappedMovie('tmdb-movie-normal.json', ['US'], 1);
    const both = mappedMovie('tmdb-movie-normal.json', ['US', 'GB'], 2);
    await store().upsertMovies([us, both], NOW);

    const pairs = [
      [uuidFor(1), uuidFor(2), uuidFor(2)],
      ['US', 'US', 'GB'],
    ];

    for (const table of ['public.media_release_dates', 'public.media_certifications']) {
      const remove = find(`delete from ${table}`);
      expect(remove.text).toContain('using unnest($1::uuid[], $2::text[]) as s(media_item_id, region)');
      expect(remove.text).toContain('t.media_item_id = s.media_item_id');
      expect(remove.text).toContain('t.region = s.region');
      expect(remove.values).toEqual(pairs);
    }

    const close = find('update public.watch_availability');
    expect(close.text).toContain('from unnest($1::uuid[], $2::text[]) as s(media_item_id, region)');
    expect(close.text).toContain('and w.removed_at is null');
    expect(close.text).toContain('and w.last_seen_at < $3::timestamptz');
    expect(close.values).toEqual([...pairs, NOW.toISOString()]);
  });

  it('still closes out the regions of a title with no offers anywhere', async () => {
    answerMediaItems();
    const unvoted = mappedMovie('tmdb-movie-unvoted.json', ['US', 'GB']);
    await store().upsertMovies([unvoted], NOW);

    expect(findAll('insert into public.watch_availability')).toHaveLength(0);
    expect(findAll('insert into public.external_scores')).toHaveLength(0);
    const close = find('update public.watch_availability');
    expect(close.values[1]).toEqual(['US', 'GB']);
  });

  it('inserts each provider stub once, the first title to name it winning', async () => {
    answerMediaItems();
    const first = mappedMovie('tmdb-movie-normal.json', ['US'], 1);
    const second = mappedMovie('tmdb-movie-normal.json', ['US'], 2);
    second.providerStubs = second.providerStubs.map((stub) => ({ ...stub, name: 'Renamed' }));
    await store().upsertMovies([first, second], NOW);

    const stubs = find('on conflict (provider_id) do nothing');
    const sent = JSON.parse(String(stubs.values[0])) as Array<{ provider_id: number; name: string }>;
    expect(new Set(sent.map((row) => row.provider_id)).size).toBe(sent.length);
    expect(sent).toEqual(first.providerStubs);
    expect(sent.some((row) => row.name === 'Renamed')).toBe(false);
  });

  it('keeps first_seen_at out of the availability update list', async () => {
    answerMediaItems();
    await store().upsertMovies(manyMovies(2), NOW);

    const seen = find('insert into public.watch_availability');
    expect(seen.text).toContain('on conflict (media_item_id, region, provider_id, offer_type) do update');
    expect(seen.text).not.toContain('first_seen_at = excluded');
    expect(seen.values[1]).toBe(NOW.toISOString());
  });
});

describe('upsertShows, batched', () => {
  it(`writes a ${BATCH_SIZE}-series batch in ten statements, seasons in place of dates`, async () => {
    answerMediaItems();
    const shows = Array.from({ length: BATCH_SIZE }, (_, index) =>
      mappedShow('tmdb-tv-returning.json', ['US'], 2_000 + index),
    );
    const counts = await store().upsertShows(shows, NOW);

    expect(statements()).toHaveLength(10);
    expect(touchedTables()).toEqual([
      'public.media_items',
      'public.tv_details',
      'public.external_scores',
      'public.tv_seasons',
      'public.tv_seasons',
      'public.media_certifications',
      'public.media_certifications',
      'public.watch_providers',
      'public.watch_availability',
      'public.watch_availability',
    ]);
    expect(find('with incoming as').text).toContain(
      'left join public.tv_details d on d.tmdb_id = i.tmdb_id',
    );
    expect(find('with incoming as').text).toContain("'tv'::public.medium");
    expect(counts.mediaItems).toBe(BATCH_SIZE);
  });

  it('replaces whole season lists for every series of the batch, never by region', async () => {
    answerMediaItems();
    const shows = [
      mappedShow('tmdb-tv-returning.json', ['US'], 1),
      mappedShow('tmdb-tv-returning.json', ['US'], 2),
    ];
    await store().upsertShows(shows, NOW);

    const remove = find('delete from public.tv_seasons');
    expect(remove.text).toContain('where media_item_id = any($1::uuid[])');
    expect(remove.text).not.toContain('region');
    expect(remove.values).toEqual([[uuidFor(1), uuidFor(2)]]);
  });
});

describe('markTmdbMissingMany', () => {
  it('stamps every 404 of a batch in one statement', async () => {
    results = [{ rowCount: 2 }];
    expect(await store().markTmdbMissingMany('tv', [1396, 1397], NOW)).toBe(2);

    const update = find('update public.media_items');
    expect(statements()).toHaveLength(1);
    expect(update.text).toContain(
      `metadata = m.metadata || jsonb_build_object('${TMDB_MISSING_KEY}', $2::text)`,
    );
    expect(update.text).toContain('from public.tv_details d');
    expect(update.text).toContain('where d.tmdb_id = any($1::integer[])');
    expect(update.values).toEqual([[1396, 1397], NOW.toISOString()]);
  });

  it('sends nothing for a batch with no 404s', async () => {
    expect(await store().markTmdbMissingMany('movie', [], NOW)).toBe(0);
    expect(statements()).toHaveLength(0);
  });
});

// --- The batched path against the per-title one ----------------------------
//
// Both paths are run over the same titles and every statement is reduced to
// the rows it sends to each table, keyed by the same uuids. The two paths have
// to agree on every row, on every delete and close-out scope, and on every
// conflict clause, which together are what decide the rows that end up in the
// tables. What a real Postgres does with them is `tmdb-live.test.ts`'s job.

type Row = Record<string, unknown>;

/** Key-sorted JSON, so two rows compare equal whatever order their keys came in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Row)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The column list of an `insert into <table> (...)`. */
function insertColumns(text: string): string[] {
  const match = /insert into public\.\w+\s*\(([^)]*)\)/.exec(text);
  if (!match) throw new Error(`no column list in ${text.slice(0, 60)}`);
  return match[1]!.split(',').map((column) => column.trim());
}

/** A row restricted to `columns`, a missing key reading as null the way jsonb_to_recordset reads it. */
function pick(row: Row, columns: string[]): Row {
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
}

/** The text from `on conflict` to the end, whitespace collapsed. */
function conflictClause(text: string): string {
  const at = text.indexOf('on conflict');
  return at === -1 ? '' : text.slice(at).replace(/\s+/g, ' ').trim();
}

interface Sent {
  rows: Map<string, string[]>;
  conflicts: Map<string, string>;
}

function add(sent: Sent, key: string, rows: Row[]): void {
  const list = sent.rows.get(key) ?? [];
  list.push(...rows.map(canonical));
  sent.rows.set(key, list);
}

function zipPairs(ids: unknown, regions: unknown, extra: Row = {}): Row[] {
  return (ids as string[]).map((id, index) => ({
    media_item_id: id,
    region: (regions as string[])[index],
    ...extra,
  }));
}

const MEDIA_ITEM_COLUMNS = [
  'tmdb_id',
  'title',
  'year',
  'release_date',
  'cover_image_id',
  'external_ids',
  'metadata',
  'refreshed_at',
];

/** What one run of either path sent to each table, from the recorded statements. */
function sentRows(batched: boolean): Sent {
  const sent: Sent = { rows: new Map(), conflicts: new Map() };
  const stubs: Row[] = [];

  for (const { text, values } of statements()) {
    const table = /(?:insert into|delete from|update) (public\.\w+)/.exec(text)?.[1] ?? 'unknown';
    const kind = text.trimStart().split(/\s/)[0]!;
    const key = /with (existing|incoming) as/.test(text) ? 'media_items' : `${kind} ${table}`;
    if (kind === 'insert') sent.conflicts.set(key, conflictClause(text));

    if (key === 'media_items') {
      const rows = batched
        ? (JSON.parse(String(values[0])) as Row[])
        : [
            Object.fromEntries(
              MEDIA_ITEM_COLUMNS.map((column, index) => [
                column,
                column === 'external_ids' || column === 'metadata'
                  ? JSON.parse(String(values[index]))
                  : values[index],
              ]),
            ),
          ];
      add(sent, key, rows.map((row) => pick(row, MEDIA_ITEM_COLUMNS)));
    } else if (table.endsWith('_details')) {
      const columns = insertColumns(text);
      const rows = batched
        ? (JSON.parse(String(values[0])) as Row[])
        : [
            Object.fromEntries(
              columns.map((column, index) => [
                column,
                column === 'top_cast' ? JSON.parse(String(values[index])) : values[index],
              ]),
            ),
          ];
      add(sent, key, rows.map((row) => pick(row, columns)));
    } else if (table === 'public.external_scores') {
      const columns = ['media_item_id', 'source', 'score', 'score_count'];
      const rows = batched
        ? (JSON.parse(String(values[0])) as Row[])
        : [Object.fromEntries(columns.map((column, index) => [column, values[index]]))];
      add(sent, key, rows.map((row) => pick(row, columns)));
    } else if (kind === 'delete' && table === 'public.tv_seasons') {
      const ids = batched ? (values[0] as string[]) : [values[0] as string];
      add(sent, key, ids.map((id) => ({ media_item_id: id })));
    } else if (kind === 'delete') {
      add(
        sent,
        key,
        batched
          ? zipPairs(values[0], values[1])
          : (values[1] as string[]).map((region) => ({ media_item_id: values[0], region })),
      );
    } else if (kind === 'update' && table === 'public.watch_availability') {
      add(
        sent,
        key,
        batched
          ? zipPairs(values[0], values[1], { at: values[2] })
          : [{ media_item_id: values[0], region: values[1], at: values[2] }],
      );
    } else if (table === 'public.watch_providers') {
      // The rows the table ends up with, not the rows sent: per title, the
      // first stub for a provider is inserted and every later one is a `do
      // nothing`, so the per-title path's effect is its stubs deduplicated
      // first-wins.
      stubs.push(...(JSON.parse(String(values[0])) as Row[]));
    } else if (kind === 'insert') {
      // Release dates, seasons, certifications and availability: per title the
      // uuid is $1 and the rows are $2; batched, the uuid is inside each row.
      const columns = insertColumns(text).filter(
        (column) => !['first_seen_at', 'last_seen_at', 'removed_at'].includes(column),
      );
      const rows = batched
        ? (JSON.parse(String(values[0])) as Row[])
        : (JSON.parse(String(values[1])) as Row[]).map((row) => ({
            media_item_id: values[0],
            ...row,
          }));
      const at = table === 'public.watch_availability' ? { at: batched ? values[1] : values[2] } : {};
      add(sent, key, rows.map((row) => ({ ...pick(row, columns), ...at })));
    } else {
      throw new Error(`unclassified statement: ${text.slice(0, 80)}`);
    }
  }

  type StubRow = Parameters<typeof dedupeProviderStubs>[0][number];
  add(
    sent,
    'insert public.watch_providers',
    dedupeProviderStubs(stubs as unknown as StubRow[]) as unknown as Row[],
  );
  for (const list of sent.rows.values()) list.sort();
  return sent;
}

describe('the batched path writes what the per-title path wrote', () => {
  const movies = () => [
    mappedMovie('tmdb-movie-normal.json', ['US', 'GB']),
    mappedMovie('tmdb-movie-normal.json', ['US', 'GB'], 551),
    mappedMovie('tmdb-movie-unvoted.json', ['US', 'GB']),
    mappedMovie('tmdb-movie-dropped.json', ['US', 'GB']),
  ];
  const shows = () => [
    mappedShow('tmdb-tv-returning.json', ['US', 'GB']),
    mappedShow('tmdb-tv-miniseries.json', ['US', 'GB']),
    mappedShow('tmdb-tv-returning.json', ['US', 'GB'], 1397),
  ];

  it('for films: the same rows, scopes and conflict clauses on every table', async () => {
    answerMediaItems();
    const perTitleCounts = await store().upsertMoviesPerTitle(movies(), NOW);
    const perTitle = sentRows(false);

    recorded.length = 0;
    const batchedCounts = await store().upsertMovies(movies(), NOW);
    const batched = sentRows(true);

    expect([...batched.rows.keys()].sort()).toEqual([...perTitle.rows.keys()].sort());
    for (const [key, rows] of perTitle.rows) {
      expect(batched.rows.get(key), key).toEqual(rows);
    }
    expect(batched.rows.get('insert public.media_release_dates')!.length).toBeGreaterThan(0);
    expect(batched.rows.get('insert public.watch_availability')!.length).toBeGreaterThan(0);

    for (const [key, clause] of perTitle.conflicts) {
      expect(batched.conflicts.get(key), key).toBe(clause);
    }
    expect(batchedCounts.mediaItems).toBe(perTitleCounts.mediaItems);
    expect(batchedCounts.details).toBe(perTitleCounts.details);
  });

  it('for series: the same rows, scopes and conflict clauses on every table', async () => {
    answerMediaItems();
    await store().upsertShowsPerTitle(shows(), NOW);
    const perTitle = sentRows(false);

    recorded.length = 0;
    await store().upsertShows(shows(), NOW);
    const batched = sentRows(true);

    expect([...batched.rows.keys()].sort()).toEqual([...perTitle.rows.keys()].sort());
    for (const [key, rows] of perTitle.rows) {
      expect(batched.rows.get(key), key).toEqual(rows);
    }
    expect(batched.rows.get('insert public.tv_seasons')!.length).toBeGreaterThan(0);

    for (const [key, clause] of perTitle.conflicts) {
      expect(batched.conflicts.get(key), key).toBe(clause);
    }
  });
});
