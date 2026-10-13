import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogStore } from '../src/db';
import { mapMovie, mapTv } from '../src/tmdb-map';
import type { MappedMovie, MappedTv, TmdbMovieDetail, TmdbTvDetail } from '../src/tmdb-types';

/**
 * The store's statements against a real Postgres.
 *
 * `tmdb-db-sql.test.ts` reads the SQL; this one runs it. They answer different
 * questions and neither replaces the other: a recorded statement proves the
 * conflict target is spelled the way the migration spells it, and only an
 * actual database proves the column exists, the check constraint accepts the
 * value, the foreign key holds and the reconciliation moves the rows it says
 * it moves.
 *
 * Skipped unless DATABASE_URL is set, so `pnpm test` stays a no-database run:
 *
 *   supabase start
 *   supabase db reset --local
 *   eval "$(supabase status -o env)"
 *   DATABASE_URL="$DB_URL" pnpm --filter @verso/catalog test
 *
 * Never point it at the hosted project. It writes and deletes rows.
 *
 * Its fixtures use TMDB ids in a band nothing real occupies
 * ({@link FIXTURE_MOVIE_ID} and {@link FIXTURE_TV_ID}) and every assertion is
 * scoped to them, so the suite says nothing about whatever else is in the
 * database and cleans up exactly what it made. The `media_items` rows cascade,
 * so deleting those two takes every dependent row with them.
 */
const connectionString = process.env.DATABASE_URL;
const live = connectionString ? describe : describe.skip;

/** Two ids well above anything TMDB has issued, so a real title cannot collide. */
const FIXTURE_MOVIE_ID = 99_000_001;
const FIXTURE_TV_ID = 99_000_002;

const FIRST_RUN = new Date('2026-09-16T12:00:00.000Z');
const SECOND_RUN = new Date('2026-09-17T12:00:00.000Z');
const REGIONS = ['US', 'GB'];

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

function movieAt(now: Date): MappedMovie {
  const detail = fixture<TmdbMovieDetail>('tmdb-movie-normal.json');
  detail.id = FIXTURE_MOVIE_ID;
  return mapMovie(detail, now, REGIONS)!;
}

function showAt(now: Date): MappedTv {
  const detail = fixture<TmdbTvDetail>('tmdb-tv-returning.json');
  detail.id = FIXTURE_TV_ID;
  return mapTv(detail, now, REGIONS)!;
}

live('the TMDB store against a real database', () => {
  const store = new CatalogStore(connectionString!);
  let movieItemId = '';
  let showItemId = '';

  async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    // The store owns the pool; this reaches through it rather than opening a
    // second one, so the suite cannot deadlock against its own writes.
    const pool = (store as unknown as { pool: { query: Function } }).pool;
    const result = await pool.query(text, values);
    return result.rows as T[];
  }

  async function cleanUp(): Promise<void> {
    await query(
      `delete from public.media_items
        where id in (
          select media_item_id from public.movie_details where tmdb_id = $1
          union all
          select media_item_id from public.tv_details where tmdb_id = $2
        )`,
      [FIXTURE_MOVIE_ID, FIXTURE_TV_ID],
    );
    // The stub the film needs is not ours to keep: nothing else references it
    // once the film's availability rows have cascaded away.
    await query(`delete from public.watch_providers where provider_id = $1`, [1899]);
  }

  beforeAll(async () => {
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await store.end();
  });

  it('writes one film across every table it touches', async () => {
    const counts = await store.upsertMovies([movieAt(FIRST_RUN)], FIRST_RUN);
    expect(counts.mediaItems).toBe(1);
    expect(counts.details).toBe(1);

    const items = await query<{ id: string; medium: string; title: string; year: number }>(
      `select m.id, m.medium, m.title, m.year, m.release_date, m.cover_image_id,
              m.external_ids, m.metadata, m.refreshed_at
         from public.media_items m
         join public.movie_details d on d.media_item_id = m.id
        where d.tmdb_id = $1`,
      [FIXTURE_MOVIE_ID],
    );
    expect(items).toHaveLength(1);
    movieItemId = items[0]!.id;
    expect(items[0]!.medium).toBe('movie');
    expect(items[0]!.title).toBe('Fight Club');
    expect(items[0]!.year).toBe(1999);

    const details = await query<Record<string, unknown>>(
      `select * from public.movie_details where tmdb_id = $1`,
      [FIXTURE_MOVIE_ID],
    );
    expect(details[0]!.runtime_minutes).toBe(139);
    expect(details[0]!.genres).toEqual(['Drama', 'Thriller']);
    expect(details[0]!.directors).toEqual(['David Fincher']);
    expect(details[0]!.writers).toEqual(['Jim Uhls']);
    expect((details[0]!.top_cast as unknown[]).length).toBe(10);

    const scores = await query<{ score: string; score_count: number }>(
      `select score, score_count from public.external_scores
        where media_item_id = $1 and source = 'tmdb'`,
      [movieItemId],
    );
    expect(Number(scores[0]!.score)).toBe(84.38);
    expect(scores[0]!.score_count).toBe(30127);
  });

  it('holds the release dates the four-column key allows and no more', async () => {
    const rows = await query<{ region: string; release_type: number; released_on: Date }>(
      `select region, release_type, released_on, certification, note
         from public.media_release_dates
        where media_item_id = $1
        order by region, release_type, released_on`,
      [movieItemId],
    );

    // The US theatrical date is listed twice in the fixture, differing only in
    // `note`; the key cannot hold both and the mapping keeps the first.
    const theatrical = rows.filter(
      (row) => row.region === 'US' && row.release_type === 3,
    );
    expect(theatrical).toHaveLength(1);
    expect(new Set(rows.map((row) => row.region))).toEqual(new Set(['US', 'GB']));
    expect(rows.some((row) => row.region === 'FR')).toBe(false);
  });

  it('stores one certification per region and none for a region with no rating', async () => {
    const rows = await query<{ region: string; certification: string }>(
      `select region, certification from public.media_certifications
        where media_item_id = $1 order by region`,
      [movieItemId],
    );
    expect(rows).toEqual([{ region: 'US', certification: 'R' }]);
  });

  it('stubs a provider the directory lacks before the row that references it', async () => {
    const providers = await query<{ provider_id: number; name: string }>(
      `select provider_id, name from public.watch_providers where provider_id = $1`,
      [1899],
    );
    expect(providers).toEqual([{ provider_id: 1899, name: 'Max' }]);

    const offers = await query<{ region: string; provider_id: number; offer_type: string }>(
      `select region, provider_id, offer_type from public.watch_availability
        where media_item_id = $1 order by region, provider_id, offer_type`,
      [movieItemId],
    );
    expect(offers).toEqual([
      { region: 'GB', provider_id: 8, offer_type: 'flatrate' },
      { region: 'US', provider_id: 2, offer_type: 'buy' },
      { region: 'US', provider_id: 2, offer_type: 'rent' },
      { region: 'US', provider_id: 8, offer_type: 'flatrate' },
      { region: 'US', provider_id: 1899, offer_type: 'flatrate' },
    ]);
  });

  it('writes one series, its seasons and season 0', async () => {
    await store.upsertShows([showAt(FIRST_RUN)], FIRST_RUN);

    const items = await query<{ id: string; medium: string; title: string }>(
      `select m.id, m.medium, m.title
         from public.media_items m
         join public.tv_details d on d.media_item_id = m.id
        where d.tmdb_id = $1`,
      [FIXTURE_TV_ID],
    );
    expect(items).toHaveLength(1);
    showItemId = items[0]!.id;
    expect(items[0]!.medium).toBe('tv');

    const details = await query<Record<string, unknown>>(
      `select * from public.tv_details where tmdb_id = $1`,
      [FIXTURE_TV_ID],
    );
    expect(details[0]!.status).toBe('Returning Series');
    expect(details[0]!.show_type).toBe('Scripted');
    expect(details[0]!.in_production).toBe(true);
    expect(details[0]!.season_count).toBe(3);
    expect(details[0]!.next_episode_number).toBe(1);

    const seasons = await query<{ season_number: number }>(
      `select season_number from public.tv_seasons where media_item_id = $1
        order by season_number`,
      [showItemId],
    );
    expect(seasons.map((row) => row.season_number)).toEqual([0, 1, 2, 3]);
  });

  it('is idempotent: a second identical write changes no identity', async () => {
    await store.upsertMovies([movieAt(SECOND_RUN)], SECOND_RUN);

    const items = await query<{ id: string; refreshed_at: Date }>(
      `select m.id, m.refreshed_at from public.media_items m
         join public.movie_details d on d.media_item_id = m.id
        where d.tmdb_id = $1`,
      [FIXTURE_MOVIE_ID],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(movieItemId);
    expect(new Date(items[0]!.refreshed_at).toISOString()).toBe(SECOND_RUN.toISOString());
  });

  it('merges external_ids rather than replacing them', async () => {
    await query(
      `update public.media_items
          set external_ids = external_ids || '{"letterboxd": "fight-club"}'::jsonb
        where id = $1`,
      [movieItemId],
    );

    await store.upsertMovies([movieAt(SECOND_RUN)], SECOND_RUN);

    const rows = await query<{ external_ids: Record<string, unknown> }>(
      `select external_ids from public.media_items where id = $1`,
      [movieItemId],
    );
    expect(rows[0]!.external_ids.letterboxd).toBe('fight-club');
    expect(rows[0]!.external_ids.tmdb).toBe(FIXTURE_MOVIE_ID);
  });

  it('replaces the derived tables whole rather than accumulating rows', async () => {
    const before = await query<{ count: string }>(
      `select count(*)::text as count from public.media_release_dates where media_item_id = $1`,
      [movieItemId],
    );

    await store.upsertMovies([movieAt(SECOND_RUN)], SECOND_RUN);

    const after = await query<{ count: string }>(
      `select count(*)::text as count from public.media_release_dates where media_item_id = $1`,
      [movieItemId],
    );
    expect(after[0]!.count).toBe(before[0]!.count);

    const seasonsBefore = await query<{ count: string }>(
      `select count(*)::text as count from public.tv_seasons where media_item_id = $1`,
      [showItemId],
    );
    await store.upsertShows([showAt(SECOND_RUN)], SECOND_RUN);
    const seasonsAfter = await query<{ count: string }>(
      `select count(*)::text as count from public.tv_seasons where media_item_id = $1`,
      [showItemId],
    );
    expect(seasonsAfter[0]!.count).toBe(seasonsBefore[0]!.count);
  });

  it('reconciles availability: an offer that goes away is closed, not deleted', async () => {
    // A third run in which Netflix has dropped the film in the US.
    const third = new Date('2026-09-18T12:00:00.000Z');
    const dropped = movieAt(third);
    dropped.availability = dropped.availability.filter(
      (row) => !(row.region === 'US' && row.provider_id === 8),
    );

    await store.upsertMovies([dropped], third);

    const rows = await query<{
      provider_id: number;
      region: string;
      offer_type: string;
      first_seen_at: Date;
      last_seen_at: Date;
      removed_at: Date | null;
    }>(
      `select provider_id, region, offer_type, first_seen_at, last_seen_at, removed_at
         from public.watch_availability
        where media_item_id = $1 and region = 'US'
        order by provider_id, offer_type`,
      [movieItemId],
    );

    const netflix = rows.find((row) => row.provider_id === 8)!;
    // The row stays, with removed_at set: "left Netflix on the 18th" is worth
    // more than a missing row.
    expect(netflix.removed_at).not.toBeNull();
    // And it keeps the day it first arrived.
    expect(new Date(netflix.first_seen_at).toISOString()).toBe(FIRST_RUN.toISOString());

    const stillThere = rows.find((row) => row.provider_id === 1899)!;
    expect(stillThere.removed_at).toBeNull();
    expect(new Date(stillThere.last_seen_at).toISOString()).toBe(third.toISOString());

    // GB was not touched by the drop.
    const gb = await query<{ removed_at: Date | null }>(
      `select removed_at from public.watch_availability
        where media_item_id = $1 and region = 'GB'`,
      [movieItemId],
    );
    expect(gb.every((row) => row.removed_at === null)).toBe(true);
  });

  it('re-opens a returning offer and keeps its original first_seen_at', async () => {
    const fourth = new Date('2026-09-19T12:00:00.000Z');
    await store.upsertMovies([movieAt(fourth)], fourth);

    const rows = await query<{ first_seen_at: Date; removed_at: Date | null }>(
      `select first_seen_at, removed_at from public.watch_availability
        where media_item_id = $1 and region = 'US' and provider_id = 8`,
      [movieItemId],
    );
    expect(rows[0]!.removed_at).toBeNull();
    expect(new Date(rows[0]!.first_seen_at).toISOString()).toBe(FIRST_RUN.toISOString());
  });

  it('refreshes the provider directory without disturbing a stub it lacks', async () => {
    const written = await store.upsertWatchProviders([
      {
        provider_id: 8,
        name: 'Netflix',
        logo_image_id: '/n.jpg',
        display_priorities: { US: 0, GB: 1 },
      },
    ]);
    expect(written).toBe(1);

    const rows = await query<{ provider_id: number; display_priorities: unknown }>(
      `select provider_id, display_priorities from public.watch_providers
        where provider_id in (8, 1899) order by provider_id`,
      [],
    );
    expect(rows[0]!.display_priorities).toEqual({ US: 0, GB: 1 });
    // The stub is still there, untouched: the directory pass never deletes.
    expect(rows[1]!.provider_id).toBe(1899);
  });

  it('answers the selection queries with what it just wrote', async () => {
    expect(await store.tmdbIds('movie')).toContain(FIXTURE_MOVIE_ID);
    expect(await store.tmdbIds('tv')).toContain(FIXTURE_TV_ID);

    const fresh = await store.tmdbFreshIds('movie', new Date('2026-09-01T00:00:00.000Z'));
    expect(fresh).toContain(FIXTURE_MOVIE_ID);
  });

  it('stamps a 404 in metadata and drops the row out of the staleness pass', async () => {
    const at = new Date('2026-09-20T12:00:00.000Z');
    expect(await store.markTmdbMissing('movie', FIXTURE_MOVIE_ID, at)).toBe(1);

    const rows = await query<{ metadata: Record<string, unknown> }>(
      `select metadata from public.media_items where id = $1`,
      [movieItemId],
    );
    expect(rows[0]!.metadata.tmdb_missing_at).toBe(at.toISOString());
    // The row itself is untouched, which is the whole point of the stamp.
    expect(rows[0]!.metadata.original_title).toBe('Fight Club');

    const stale = await store.tmdbStaleTargets({
      kind: 'movie',
      staleBefore: new Date('2027-01-01T00:00:00.000Z'),
      missingBefore: at,
      limit: 100,
    });
    expect(stale.some((target) => target.tmdb_id === FIXTURE_MOVIE_ID)).toBe(false);

    // Once the stamp itself is old enough, the title is tried again.
    const later = await store.tmdbStaleTargets({
      kind: 'movie',
      staleBefore: new Date('2027-01-01T00:00:00.000Z'),
      missingBefore: new Date('2027-01-01T00:00:00.000Z'),
      limit: 100,
    });
    expect(later.some((target) => target.tmdb_id === FIXTURE_MOVIE_ID)).toBe(true);
  });
});

/**
 * The batched writes the sync calls, against the per-title path they replaced
 * (VER-163), row for row in a real Postgres.
 *
 * The same titles go through three runs on each path: a first write, a second
 * in which one film has left Netflix in the US, and a third in which it is
 * back. After each path's three runs every table is read back with the uuids
 * swapped for TMDB ids, and the two snapshots have to be identical. That
 * covers both branches of the `media_items` statement, the replacements, the
 * close-out and the re-open.
 *
 * Its own band of ids, so it shares nothing with the suite above.
 */
const EQUIVALENCE_MOVIE_IDS = [99_000_101, 99_000_102, 99_000_103];
const EQUIVALENCE_TV_IDS = [99_000_201, 99_000_202];

live('the batched TMDB writes against the per-title ones', () => {
  const store = new CatalogStore(connectionString!);

  async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const pool = (store as unknown as { pool: { query: Function } }).pool;
    const result = await pool.query(text, values);
    return result.rows as T[];
  }

  async function cleanUp(): Promise<void> {
    await query(
      `delete from public.media_items
        where id in (
          select media_item_id from public.movie_details where tmdb_id = any($1::integer[])
          union all
          select media_item_id from public.tv_details where tmdb_id = any($2::integer[])
        )`,
      [EQUIVALENCE_MOVIE_IDS, EQUIVALENCE_TV_IDS],
    );
  }

  beforeAll(async () => {
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await query(
      `delete from public.watch_providers p
        where p.provider_id = $1
          and not exists (select 1 from public.watch_availability w where w.provider_id = p.provider_id)`,
      [1899],
    );
    await store.end();
  });

  function films(now: Date, withoutUsNetflix = false): MappedMovie[] {
    const names = ['tmdb-movie-normal.json', 'tmdb-movie-unvoted.json', 'tmdb-movie-dropped.json'];
    return names.map((name, index) => {
      const detail = fixture<TmdbMovieDetail>(name);
      detail.id = EQUIVALENCE_MOVIE_IDS[index]!;
      const mapped = mapMovie(detail, now, REGIONS)!;
      if (withoutUsNetflix && index === 0) {
        mapped.availability = mapped.availability.filter(
          (row) => !(row.region === 'US' && row.provider_id === 8),
        );
      }
      return mapped;
    });
  }

  function series(now: Date): MappedTv[] {
    const names = ['tmdb-tv-returning.json', 'tmdb-tv-miniseries.json'];
    return names.map((name, index) => {
      const detail = fixture<TmdbTvDetail>(name);
      detail.id = EQUIVALENCE_TV_IDS[index]!;
      return mapTv(detail, now, REGIONS)!;
    });
  }

  const RUNS = [
    { at: FIRST_RUN, withoutUsNetflix: false },
    { at: SECOND_RUN, withoutUsNetflix: true },
    { at: new Date('2026-09-18T12:00:00.000Z'), withoutUsNetflix: false },
  ];

  /** Every row the titles own, uuids replaced by TMDB ids, as sorted JSON. */
  async function snapshot(): Promise<Record<string, string[]>> {
    const keys = `(
      select media_item_id, tmdb_id, 'movie' as kind from public.movie_details
       where tmdb_id = any($1::integer[])
      union all
      select media_item_id, tmdb_id, 'tv' as kind from public.tv_details
       where tmdb_id = any($2::integer[])
    )`;
    // fetched_at is now() on both paths, so it is the one column that differs
    // by construction; every other timestamp is the run's own instant.
    const tables: Record<string, string> = {
      media_items: `select k.kind, k.tmdb_id, to_jsonb(t) - 'id' as row
                      from public.media_items t join ${keys} k on k.media_item_id = t.id`,
      movie_details: `select k.kind, k.tmdb_id, to_jsonb(t) - 'media_item_id' as row
                        from public.movie_details t join ${keys} k using (media_item_id)`,
      tv_details: `select k.kind, k.tmdb_id, to_jsonb(t) - 'media_item_id' as row
                     from public.tv_details t join ${keys} k using (media_item_id)`,
      external_scores: `select k.kind, k.tmdb_id, to_jsonb(t) - 'media_item_id' - 'fetched_at' as row
                          from public.external_scores t join ${keys} k using (media_item_id)`,
      tv_seasons: `select k.kind, k.tmdb_id, to_jsonb(t) - 'media_item_id' as row
                     from public.tv_seasons t join ${keys} k using (media_item_id)`,
      media_release_dates: `select k.kind, k.tmdb_id, to_jsonb(t) - 'media_item_id' as row
                              from public.media_release_dates t join ${keys} k using (media_item_id)`,
      media_certifications: `select k.kind, k.tmdb_id, to_jsonb(t) - 'media_item_id' as row
                               from public.media_certifications t join ${keys} k using (media_item_id)`,
      watch_availability: `select k.kind, k.tmdb_id, to_jsonb(t) - 'media_item_id' as row
                             from public.watch_availability t join ${keys} k using (media_item_id)`,
    };

    const out: Record<string, string[]> = {};
    for (const [table, sql] of Object.entries(tables)) {
      const rows = await query<{ kind: string; tmdb_id: number; row: unknown }>(sql, [
        EQUIVALENCE_MOVIE_IDS,
        EQUIVALENCE_TV_IDS,
      ]);
      out[table] = rows.map((row) => JSON.stringify(row)).sort();
    }
    return out;
  }

  /** The counts both paths report, minus the stubs, which the first path leaves behind. */
  function comparable(counts: Awaited<ReturnType<CatalogStore['upsertMovies']>>) {
    const { providerStubs: _stubs, ...rest } = counts;
    return rest;
  }

  it('leaves exactly the rows the per-title path left, over three runs', async () => {
    const perTitleCounts: unknown[] = [];
    for (const run of RUNS) {
      perTitleCounts.push(
        comparable(await store.upsertMoviesPerTitle(films(run.at, run.withoutUsNetflix), run.at)),
        comparable(await store.upsertShowsPerTitle(series(run.at), run.at)),
      );
    }
    const perTitle = await snapshot();

    await cleanUp();

    const batchedCounts: unknown[] = [];
    for (const run of RUNS) {
      batchedCounts.push(
        comparable(await store.upsertMovies(films(run.at, run.withoutUsNetflix), run.at)),
        comparable(await store.upsertShows(series(run.at), run.at)),
      );
    }
    const batched = await snapshot();

    expect(perTitle.media_items).toHaveLength(5);
    expect(perTitle.watch_availability!.length).toBeGreaterThan(0);
    expect(perTitle.media_release_dates!.length).toBeGreaterThan(0);
    expect(perTitle.tv_seasons!.length).toBeGreaterThan(0);
    expect(batched).toEqual(perTitle);
    expect(batchedCounts).toEqual(perTitleCounts);
  });
});
