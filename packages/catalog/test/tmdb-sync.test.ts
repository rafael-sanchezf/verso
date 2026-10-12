import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CatalogStore } from '../src/db';
import type { TmdbClient } from '../src/tmdb';
import { TMDB_DEFAULT_STALE_DAYS, runTmdbSync } from '../src/tmdb-sync';
import type {
  MappedMovie,
  MappedTv,
  TmdbExportLine,
  TmdbMedium,
  TmdbMovieDetail,
  TmdbProviderDirectory,
  TmdbStaleTarget,
  TmdbTvDetail,
  TmdbUpsertCounts,
  WatchProviderRow,
} from '../src/tmdb-types';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

interface FakeClientOptions {
  /** Ids the changes feed yields, per medium. */
  changes?: Partial<Record<TmdbMedium, number[]>>;
  /** Lines the daily export yields, per medium. */
  exports?: Partial<Record<TmdbMedium, TmdbExportLine[]>>;
  /** Ids that answer 404 rather than a detail. */
  missing?: number[];
}

/**
 * A `TmdbClient` stand-in that records what was asked for.
 *
 * Every title answers with the same fixture under a rewritten id, because what
 * these tests are about is which ids each pass selects and in what order, not
 * the mapping, which `tmdb-map.test.ts` covers over real shapes.
 */
function fakeClient(options: FakeClientOptions = {}) {
  const asked: Array<{ kind: TmdbMedium; id: number }> = [];
  const calls: string[] = [];
  const movie = fixture<TmdbMovieDetail>('tmdb-movie-normal.json');
  const tv = fixture<TmdbTvDetail>('tmdb-tv-returning.json');
  const missing = new Set(options.missing ?? []);

  const client = {
    requestCount: 0,
    retryCount: 0,
    fileRequestCount: 0,
    paceHalvings: 0,
    requestsPerSecond: 20,
    maxInFlight: 8,

    async providers(kind: TmdbMedium) {
      calls.push(`providers:${kind}`);
      client.requestCount += 1;
      const name = kind === 'movie' ? 'tmdb-providers-movie.json' : 'tmdb-providers-tv.json';
      return fixture<TmdbProviderDirectory>(name).results ?? [];
    },

    async *changes(kind: TmdbMedium) {
      calls.push(`changes:${kind}`);
      client.requestCount += 1;
      for (const id of options.changes?.[kind] ?? []) yield id;
    },

    async *exportIds(kind: TmdbMedium) {
      calls.push(`export:${kind}`);
      client.fileRequestCount += 1;
      for (const line of options.exports?.[kind] ?? []) yield line;
    },

    async movie(id: number) {
      asked.push({ kind: 'movie', id });
      calls.push(`movie:${id}`);
      client.requestCount += 1;
      return missing.has(id) ? null : { ...movie, id };
    },

    async tv(id: number) {
      asked.push({ kind: 'tv', id });
      calls.push(`tv:${id}`);
      client.requestCount += 1;
      return missing.has(id) ? null : { ...tv, id };
    },
  };

  return { client: client as unknown as TmdbClient, asked, calls, raw: client };
}

interface FakeStoreOptions {
  held?: Partial<Record<TmdbMedium, number[]>>;
  fresh?: Partial<Record<TmdbMedium, number[]>>;
  stale?: Partial<Record<TmdbMedium, TmdbStaleTarget[]>>;
}

function emptyCounts(): TmdbUpsertCounts {
  return {
    mediaItems: 0,
    details: 0,
    scores: 0,
    seasons: 0,
    releaseDates: 0,
    certifications: 0,
    providerStubs: 0,
    availabilityWritten: 0,
    availabilityClosed: 0,
  };
}

/** A `CatalogStore` stand-in that records every write. */
function fakeStore(options: FakeStoreOptions = {}) {
  const writes = {
    providers: [] as WatchProviderRow[][],
    movies: [] as MappedMovie[][],
    shows: [] as MappedTv[][],
    missing: [] as Array<{ kind: TmdbMedium; id: number }>,
  };
  const staleAsks: Array<{ kind: TmdbMedium; limit: number; staleBefore: Date }> = [];

  const store = {
    async tmdbIds(kind: TmdbMedium) {
      return new Set(options.held?.[kind] ?? []);
    },
    async tmdbFreshIds(kind: TmdbMedium) {
      return new Set(options.fresh?.[kind] ?? []);
    },
    async tmdbStaleTargets(opts: { kind: TmdbMedium; limit: number; staleBefore: Date }) {
      staleAsks.push(opts);
      return (options.stale?.[opts.kind] ?? []).slice(0, opts.limit);
    },
    async upsertWatchProviders(rows: WatchProviderRow[]) {
      writes.providers.push(rows);
      return rows.length;
    },
    async upsertMovies(rows: MappedMovie[]) {
      writes.movies.push(rows);
      return { ...emptyCounts(), mediaItems: rows.length, details: rows.length };
    },
    async upsertShows(rows: MappedTv[]) {
      writes.shows.push(rows);
      return { ...emptyCounts(), mediaItems: rows.length, details: rows.length };
    },
    async markTmdbMissing(kind: TmdbMedium, id: number) {
      writes.missing.push({ kind, id });
      return 1;
    },
    async mediumRowCount() {
      return 42;
    },
    async databaseSizeBytes() {
      return 1024 * 1024;
    },
  };

  return { store: store as unknown as CatalogStore, writes, staleAsks };
}

const line = (id: number, popularity: number): TmdbExportLine => ({
  id,
  popularity,
  adult: false,
  video: false,
});

const silent = () => {
  const lines: string[] = [];
  return { log: (message: string) => lines.push(message), lines };
};

describe('runTmdbSync pass order', () => {
  it('runs providers, then changes, then entrants, then staleness, per medium', async () => {
    const { client, calls } = fakeClient({
      changes: { movie: [10], tv: [20] },
      exports: { movie: [line(11, 50)], tv: [line(21, 50)] },
    });
    const { store } = fakeStore({
      held: { movie: [10], tv: [20] },
      stale: {
        movie: [{ media_item_id: 'a', tmdb_id: 12 }],
        tv: [{ media_item_id: 'b', tmdb_id: 22 }],
      },
    });
    const log = silent();

    const result = await runTmdbSync({ client, store }, { now: NOW, log: log.log });

    expect(calls).toEqual([
      'providers:movie',
      'providers:tv',
      'changes:movie',
      'movie:10',
      'export:movie',
      'movie:11',
      'movie:12',
      'changes:tv',
      'tv:20',
      'export:tv',
      'tv:21',
      'tv:22',
    ]);
    expect(result.passes.map((pass) => pass.pass)).toEqual([
      'providers',
      'changes',
      'entrants',
      'staleness',
      'changes',
      'entrants',
      'staleness',
    ]);
  });

  it('refreshes the providers before any availability row is written', async () => {
    const { client } = fakeClient({ exports: { movie: [line(1, 50)] } });
    const { store, writes } = fakeStore();
    const log = silent();

    await runTmdbSync({ client, store }, { now: NOW, media: ['movie'], log: log.log });

    expect(writes.providers).toHaveLength(1);
    // One directory per medium actually being run, so `--medium movie` fetches
    // the film directory only and Freevee (613, TV only) is not in it.
    expect(writes.providers[0]!.map((row) => row.provider_id).sort((a, b) => a - b)).toEqual([
      2, 3, 8, 9,
    ]);
    expect(writes.movies.length).toBeGreaterThan(0);
  });

  it('skips the changes and staleness passes on a full run', async () => {
    const { client, calls } = fakeClient({
      changes: { movie: [10] },
      exports: { movie: [line(11, 50)] },
    });
    const { store } = fakeStore({
      held: { movie: [10] },
      stale: { movie: [{ media_item_id: 'a', tmdb_id: 12 }] },
    });
    const log = silent();

    const result = await runTmdbSync(
      { client, store },
      { now: NOW, media: ['movie'], full: true, log: log.log },
    );

    expect(calls).toEqual(['providers:movie', 'export:movie', 'movie:11']);
    expect(result.passes.map((pass) => pass.pass)).toEqual(['providers', 'entrants']);
    expect(result.full).toBe(true);
  });
});

describe('runTmdbSync selection', () => {
  it('fetches only the changed ids the catalog already holds', async () => {
    const { client, asked } = fakeClient({ changes: { movie: [10, 11, 12] } });
    const { store } = fakeStore({ held: { movie: [11] } });
    const log = silent();

    await runTmdbSync({ client, store }, { now: NOW, media: ['movie'], log: log.log });

    expect(asked.map((entry) => entry.id)).toEqual([11]);
  });

  it('fetches entrants over the threshold that the catalog does not hold', async () => {
    const { client, asked } = fakeClient({
      exports: {
        movie: [line(1, 50), line(2, 0.5), line(3, 50), { id: 4, popularity: 99, adult: true }],
      },
    });
    const { store } = fakeStore({ held: { movie: [3] } });
    const log = silent();

    await runTmdbSync({ client, store }, { now: NOW, media: ['movie'], log: log.log });

    // 2 is under the threshold, 3 is already held, 4 is adult.
    expect(asked.map((entry) => entry.id)).toEqual([1]);
  });

  it('on a full run takes the whole discovery set minus what it already refreshed', async () => {
    const { client, asked } = fakeClient({
      exports: { movie: [line(1, 50), line(2, 50), line(3, 50)] },
    });
    const { store } = fakeStore({ held: { movie: [1, 2, 3] }, fresh: { movie: [2] } });
    const log = silent();

    await runTmdbSync(
      { client, store },
      { now: NOW, media: ['movie'], full: true, log: log.log },
    );

    // Held is irrelevant on a full run; only what this run already refreshed
    // is skipped, which is what makes a dead full pull resumable.
    expect(asked.map((entry) => entry.id)).toEqual([1, 3]);
  });

  it('asks for stale rows older than --stale-days', async () => {
    const { client } = fakeClient();
    const { store, staleAsks } = fakeStore({ stale: { movie: [] } });
    const log = silent();

    await runTmdbSync({ client, store }, { now: NOW, media: ['movie'], log: log.log });

    const expected = new Date(NOW.getTime() - TMDB_DEFAULT_STALE_DAYS * 24 * 60 * 60 * 1000);
    expect(staleAsks[0]!.staleBefore.toISOString()).toBe(expected.toISOString());
  });

  it('treats the catalog as empty when there is no store', async () => {
    const { client, asked } = fakeClient({
      changes: { movie: [10] },
      exports: { movie: [line(10, 50), line(11, 50)] },
    });
    const log = silent();

    const result = await runTmdbSync({ client, store: null }, { now: NOW, media: ['movie'], log: log.log });

    // Nothing is held, so the changes pass finds nothing and both export ids
    // count as entrants.
    expect(asked.map((entry) => entry.id)).toEqual([10, 11]);
    expect(result.rowCounts.movie).toBeNull();
    expect(log.lines.join('\n')).toContain('no DATABASE_URL');
  });
});

describe('runTmdbSync budget and limits', () => {
  it('stops at --max-ids across every pass', async () => {
    const { client, asked } = fakeClient({
      changes: { movie: [1, 2] },
      exports: { movie: [line(3, 50), line(4, 50)] },
    });
    const { store } = fakeStore({
      held: { movie: [1, 2] },
      stale: { movie: [{ media_item_id: 'a', tmdb_id: 5 }] },
    });
    const log = silent();

    const result = await runTmdbSync(
      { client, store },
      { now: NOW, media: ['movie'], maxIds: 3, log: log.log },
    );

    expect(asked.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(result.stoppedEarly).toBe(true);
  });

  it('shares one request budget across the passes', async () => {
    const { client, asked } = fakeClient({
      changes: { movie: [1, 2, 3] },
      exports: { movie: [line(4, 50)] },
    });
    const { store } = fakeStore({ held: { movie: [1, 2, 3] } });
    const log = silent();

    // One provider request and one changes request are spent before a single
    // title is fetched, so a budget of five leaves room for exactly three
    // titles and the entrant never gets one.
    const result = await runTmdbSync(
      { client, store },
      { now: NOW, media: ['movie'], budget: 5, log: log.log },
    );

    expect(asked.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(result.stoppedEarly).toBe(true);
    expect(result.budget).toBe(5);
  });

  it('stamps a 404 as missing rather than deleting the row', async () => {
    const { client } = fakeClient({ changes: { movie: [1, 2] }, missing: [2] });
    const { store, writes } = fakeStore({ held: { movie: [1, 2] } });
    const log = silent();

    const result = await runTmdbSync({ client, store }, { now: NOW, media: ['movie'], log: log.log });

    expect(writes.missing).toEqual([{ kind: 'movie', id: 2 }]);
    expect(result.passes.find((pass) => pass.pass === 'changes')!.missing).toBe(1);
  });
});

describe('runTmdbSync dry run', () => {
  it('fetches and maps but writes nothing', async () => {
    const { client, asked } = fakeClient({
      changes: { movie: [1] },
      exports: { movie: [line(2, 50)] },
      missing: [1],
    });
    const { store, writes } = fakeStore({ held: { movie: [1] } });
    const log = silent();

    const result = await runTmdbSync(
      { client, store },
      { now: NOW, media: ['movie'], dryRun: true, log: log.log },
    );

    expect(asked.map((entry) => entry.id)).toEqual([1, 2]);
    expect(writes.providers).toEqual([]);
    expect(writes.movies).toEqual([]);
    expect(writes.missing).toEqual([]);
    expect(result.providersWritten).toBe(0);
    expect(result.counts.mediaItems).toBe(0);
    expect(result.rowCounts.movie).toBeNull();
    expect(result.databaseSizeBytes).toBeNull();
    expect(log.lines.join('\n')).toContain('dry run');
  });

  it('still reads the catalog on a dry run that has a store', async () => {
    const { client, asked } = fakeClient({ exports: { movie: [line(1, 50), line(2, 50)] } });
    const { store } = fakeStore({ held: { movie: [2] } });
    const log = silent();

    await runTmdbSync(
      { client, store },
      { now: NOW, media: ['movie'], dryRun: true, log: log.log },
    );

    expect(asked.map((entry) => entry.id)).toEqual([1]);
  });
});

describe('runTmdbSync regions', () => {
  it('passes the requested regions through to the mapping', async () => {
    const { client } = fakeClient({ exports: { movie: [line(1, 50)] } });
    const { store, writes } = fakeStore();
    const log = silent();

    await runTmdbSync(
      { client, store },
      { now: NOW, media: ['movie'], regions: ['US', 'GB'], log: log.log },
    );

    const written = writes.movies[0]![0]!;
    expect(written.regions).toEqual(['US', 'GB']);
    expect(new Set(written.availability.map((row) => row.region))).toEqual(new Set(['US', 'GB']));
  });

  it('defaults to US', async () => {
    const { client } = fakeClient({ exports: { movie: [line(1, 50)] } });
    const { store, writes } = fakeStore();
    const log = silent();

    const result = await runTmdbSync({ client, store }, { now: NOW, media: ['movie'], log: log.log });

    expect(result.regions).toEqual(['US']);
    expect(writes.movies[0]![0]!.regions).toEqual(['US']);
  });
});
