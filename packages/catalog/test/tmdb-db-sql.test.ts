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

function nextResult(text: string): { rows: unknown[]; rowCount: number } {
  if (TRANSACTION_CONTROL.includes(text)) return { rows: [], rowCount: 0 };

  const queued = results[resultIndex] ?? {};
  resultIndex += 1;
  return { rows: queued.rows ?? [], rowCount: queued.rowCount ?? queued.rows?.length ?? 0 };
}

vi.mock('pg', () => {
  class FakeClient {
    async query(text: string, values?: unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return nextResult(text);
    }
    release(): void {}
  }
  class FakePool {
    async query(text: string, values?: unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return nextResult(text);
    }
    async connect() {
      return new FakeClient();
    }
    async end(): Promise<void> {}
  }
  return { default: { Pool: FakePool } };
});

const { CatalogStore, TMDB_MISSING_KEY, detailsTable } = await import('../src/db');
const { mapMovie, mapTv } = await import('../src/tmdb-map');
type TmdbMovieDetail = import('../src/tmdb-types').TmdbMovieDetail;
type TmdbTvDetail = import('../src/tmdb-types').TmdbTvDetail;

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

describe('upsertMovies', () => {
  const movie = () => mapMovie(fixture<TmdbMovieDetail>('tmdb-movie-normal.json'), NOW, ['US'])!;

  it('matches media_items through movie_details.tmdb_id, never through external_ids', async () => {
    results = [mediaItemId()];
    await store().upsertMovies([movie()], NOW);

    const upsert = find('with existing as');
    expect(upsert.text).toContain('from public.movie_details d where d.tmdb_id = $1');
    expect(upsert.text).toContain("insert into public.media_items");
    expect(upsert.text).toContain("'movie'::public.medium");
    expect(upsert.text).not.toContain("external_ids->>'tmdb'");
    expect(upsert.values[0]).toBe(550);
  });

  it('merges external_ids and metadata instead of replacing them', async () => {
    results = [mediaItemId()];
    await store().upsertMovies([movie()], NOW);

    const upsert = find('with existing as');
    expect(upsert.text).toContain('external_ids = m.external_ids || $6::jsonb');
    expect(upsert.text).toContain('metadata = m.metadata || $7::jsonb');
    expect(upsert.text).not.toContain('external_ids = $6');
    expect(upsert.text).not.toContain('metadata = $7');
  });

  it('runs the tables in the order the design doc sets out', async () => {
    results = [mediaItemId()];
    await store().upsertMovies([movie()], NOW);

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
    await store().upsertMovies([movie()], NOW);

    const details = find('insert into public.movie_details');
    expect(details.text).toContain('on conflict (tmdb_id) do update');
    expect(details.text).toContain('media_item_id = excluded.media_item_id');
    expect(details.values[0]).toBe(UUID);
    expect(details.values[1]).toBe(550);
  });

  it('writes the tmdb score in the same transaction, keyed by the returned uuid', async () => {
    results = [mediaItemId()];
    await store().upsertMovies([movie()], NOW);

    const score = find('insert into public.external_scores');
    expect(score.text).toContain('on conflict (media_item_id, source) do update');
    expect(score.values).toEqual([UUID, 'tmdb', 84.38, 30127]);
  });

  it('writes no external_scores row at all for a film nobody has voted on', async () => {
    results = [mediaItemId()];
    const unvoted = mapMovie(fixture<TmdbMovieDetail>('tmdb-movie-unvoted.json'), NOW, ['US'])!;
    await store().upsertMovies([unvoted], NOW);

    expect(findAll('insert into public.external_scores')).toHaveLength(0);
  });

  it('replaces release dates and certifications whole, scoped to the run regions', async () => {
    results = [mediaItemId()];
    await store().upsertMovies([movie()], NOW);

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
    await store().upsertMovies([movie()], NOW);

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
    await store().upsertMovies([movie()], NOW);

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
    await store().upsertMovies([movie()], NOW);

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
    await store().upsertMovies([unvoted], NOW);

    expect(findAll('insert into public.watch_availability')).toHaveLength(0);
    const closes = findAll('update public.watch_availability');
    expect(closes).toHaveLength(2);
    expect(closes.map((entry) => entry.values[1])).toEqual(['US', 'GB']);
  });

  it('writes each title in one transaction and rolls back on a failure', async () => {
    results = [mediaItemId()];
    await store().upsertMovies([movie()], NOW);

    expect(recorded[0]!.text).toBe('begin');
    expect(recorded[recorded.length - 1]!.text).toBe('commit');
  });

  it('keeps the last of two mappings that share a tmdb id', async () => {
    results = [mediaItemId()];
    const first = movie();
    const second = movie();
    second.mediaItem.title = 'Fight Club (2026 restoration)';

    await store().upsertMovies([first, second], NOW);

    const upserts = findAll('with existing as');
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.values[1]).toBe('Fight Club (2026 restoration)');
  });
});

describe('upsertShows', () => {
  const show = () => mapTv(fixture<TmdbTvDetail>('tmdb-tv-returning.json'), NOW, ['US'])!;

  it('runs the tables in the design doc order, seasons in place of release dates', async () => {
    results = [mediaItemId()];
    await store().upsertShows([show()], NOW);

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
    await store().upsertShows([show()], NOW);

    const upsert = find('with existing as');
    expect(upsert.text).toContain('from public.tv_details d where d.tmdb_id = $1');
    expect(upsert.text).toContain("'tv'::public.medium");
    expect(upsert.values[0]).toBe(1396);
  });

  it('replaces the whole season list rather than a per-region slice', async () => {
    results = [mediaItemId()];
    await store().upsertShows([show()], NOW);

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
    await store().upsertShows([show()], NOW);

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
