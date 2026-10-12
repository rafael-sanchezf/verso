import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MOVIE_POPULARITY_THRESHOLD,
  TMDB_RECENT_RELEASE_DAYS,
  TV_POPULARITY_THRESHOLD,
  isDiscoverable,
  keepMovie,
  keepTv,
  mapMovie,
  mapProviderDirectory,
  mapTmdbScore,
  mapTv,
} from '../src/tmdb-map';
import type {
  TmdbMovieDetail,
  TmdbProviderDirectory,
  TmdbTvDetail,
} from '../src/tmdb-types';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const US = ['US'];
const US_GB = ['US', 'GB'];

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

const normalMovie = () => fixture<TmdbMovieDetail>('tmdb-movie-normal.json');
const unvotedMovie = () => fixture<TmdbMovieDetail>('tmdb-movie-unvoted.json');
const droppedMovie = () => fixture<TmdbMovieDetail>('tmdb-movie-dropped.json');
const returningTv = () => fixture<TmdbTvDetail>('tmdb-tv-returning.json');
const miniseries = () => fixture<TmdbTvDetail>('tmdb-tv-miniseries.json');

describe('the discovery rule', () => {
  it('takes a film at the threshold and refuses one below it', () => {
    const at = { id: 1, popularity: MOVIE_POPULARITY_THRESHOLD, adult: false, video: false };
    const below = { ...at, popularity: MOVIE_POPULARITY_THRESHOLD - 0.0001 };

    expect(isDiscoverable(at, 'movie')).toBe(true);
    expect(isDiscoverable(below, 'movie')).toBe(false);
  });

  it('uses the higher series threshold for series', () => {
    const line = { id: 1, popularity: MOVIE_POPULARITY_THRESHOLD };
    expect(isDiscoverable(line, 'movie')).toBe(true);
    expect(isDiscoverable(line, 'tv')).toBe(false);
    expect(isDiscoverable({ id: 1, popularity: TV_POPULARITY_THRESHOLD }, 'tv')).toBe(true);
  });

  it('refuses an adult title and a movie record that is really a trailer', () => {
    expect(isDiscoverable({ id: 1, popularity: 99, adult: true }, 'movie')).toBe(false);
    expect(isDiscoverable({ id: 1, popularity: 99, video: true }, 'movie')).toBe(false);
    // `video` means nothing on a series, so it is not consulted there.
    expect(isDiscoverable({ id: 1, popularity: 99, video: true }, 'tv')).toBe(true);
  });

  it('treats a missing adult field as not adult, which is every TV export line', () => {
    expect(isDiscoverable({ id: 1, popularity: TV_POPULARITY_THRESHOLD }, 'tv')).toBe(true);
  });

  it('treats a missing popularity as zero rather than as unknown', () => {
    expect(isDiscoverable({ id: 1 }, 'movie')).toBe(false);
  });
});

describe('the keep rule', () => {
  it('keeps a normal film', () => {
    expect(keepMovie(normalMovie(), NOW)).toBe(true);
  });

  it('keeps an unvoted film released inside the window', () => {
    expect(keepMovie(unvotedMovie(), NOW)).toBe(true);
  });

  it('drops a film with no poster and no votes and no recent release', () => {
    expect(keepMovie(droppedMovie(), NOW)).toBe(false);
  });

  it('drops an adult film even when everything else holds', () => {
    expect(keepMovie({ ...normalMovie(), adult: true }, NOW)).toBe(false);
  });

  it('drops a film with no poster however popular', () => {
    expect(keepMovie({ ...normalMovie(), poster_path: null }, NOW)).toBe(false);
    expect(keepMovie({ ...normalMovie(), poster_path: '' }, NOW)).toBe(false);
  });

  it('drops a film with no title', () => {
    expect(keepMovie({ ...normalMovie(), title: '   ' }, NOW)).toBe(false);
  });

  it('holds the recent-release boundary at exactly 730 days', () => {
    const base = { ...unvotedMovie(), vote_count: 0 };
    const day = 24 * 60 * 60 * 1000;

    const onTheLine = new Date(NOW.getTime() - TMDB_RECENT_RELEASE_DAYS * day)
      .toISOString()
      .slice(0, 10);
    const oneDayOver = new Date(NOW.getTime() - (TMDB_RECENT_RELEASE_DAYS + 1) * day)
      .toISOString()
      .slice(0, 10);

    expect(keepMovie({ ...base, release_date: onTheLine }, NOW)).toBe(true);
    expect(keepMovie({ ...base, release_date: oneDayOver }, NOW)).toBe(false);
  });

  it('keeps an unreleased film with a date in the future', () => {
    const base = { ...unvotedMovie(), vote_count: 0, release_date: '2027-12-01' };
    expect(keepMovie(base, NOW)).toBe(true);
  });

  it('keeps a film with a single vote and no date at all', () => {
    const base = { ...unvotedMovie(), vote_count: 1, release_date: '' };
    expect(keepMovie(base, NOW)).toBe(true);
  });

  it('applies the same rule to a series over name and first_air_date', () => {
    expect(keepTv(returningTv(), NOW)).toBe(true);
    expect(keepTv({ ...returningTv(), poster_path: null }, NOW)).toBe(false);
    expect(keepTv({ ...returningTv(), name: '' }, NOW)).toBe(false);
    expect(
      keepTv({ ...returningTv(), vote_count: 0, first_air_date: '1998-01-01' }, NOW),
    ).toBe(false);
  });
});

describe('mapMovie', () => {
  it('maps the media_items row, reading the year from the date in UTC', () => {
    const mapped = mapMovie(normalMovie(), NOW, US)!;

    expect(mapped.mediaItem).toEqual({
      medium: 'movie',
      title: 'Fight Club',
      year: 1999,
      release_date: '1999-10-15',
      cover_image_id: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      external_ids: { tmdb: 550, imdb: 'tt0137523', wikidata: 'Q190050' },
      metadata: {
        popularity: 61.416,
        vote_average: 8.438,
        vote_count: 30127,
        backdrop_path: '/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
        original_title: 'Fight Club',
        original_language: 'en',
        adult: false,
        tmdb_status: 'Released',
      },
      refreshed_at: '2026-09-16T12:00:00.000Z',
    });
  });

  it('keeps the poster path verbatim, leading slash included', () => {
    const mapped = mapMovie(normalMovie(), NOW, US)!;
    expect(mapped.mediaItem.cover_image_id!.startsWith('/')).toBe(true);
    expect(mapped.details.backdrop_image_id!.startsWith('/')).toBe(true);
  });

  it('turns empty strings into nulls rather than storing them', () => {
    const mapped = mapMovie(unvotedMovie(), NOW, US)!;

    expect(mapped.mediaItem.external_ids).toEqual({ tmdb: 987654 });
    expect(mapped.details.tagline).toBeNull();
    expect(mapped.details.overview).toBeNull();
    expect(mapped.details.runtime_minutes).toBeNull();
    expect(mapped.details.studio).toBeNull();
    expect(mapped.details.collection_tmdb_id).toBeNull();
  });

  it('maps the details row, deduplicating writers and capping the cast at ten', () => {
    const mapped = mapMovie(normalMovie(), NOW, US)!;

    expect(mapped.details.tmdb_id).toBe(550);
    expect(mapped.details.runtime_minutes).toBe(139);
    expect(mapped.details.genres).toEqual(['Drama', 'Thriller']);
    expect(mapped.details.directors).toEqual(['David Fincher']);
    // Jim Uhls holds both a Screenplay and a Story credit; 'Novel' is not a
    // writing job the rule names.
    expect(mapped.details.writers).toEqual(['Jim Uhls']);
    expect(mapped.details.studio).toBe('Fox 2000 Pictures');
    expect(mapped.details.collection_tmdb_id).toBe(1234);
    expect(mapped.details.collection_name).toBe('Fight Club Collection');
    expect(mapped.details.top_cast).toHaveLength(10);
    expect(mapped.details.top_cast[0]).toEqual({
      tmdb_person_id: 819,
      name: 'Edward Norton',
      character: 'The Narrator',
      profile_path: '/5XBzD5WuTyVQZeS4VI25z2moMeY.jpg',
    });
  });

  it('writes the tmdb score only when somebody has voted', () => {
    expect(mapMovie(normalMovie(), NOW, US)!.score).toEqual({
      source: 'tmdb',
      score: 84.38,
      score_count: 30127,
    });
    expect(mapMovie(unvotedMovie(), NOW, US)!.score).toBeNull();
    expect(mapTmdbScore(7.9, 1)).toEqual({ source: 'tmdb', score: 79, score_count: 1 });
    expect(mapTmdbScore(0, 0)).toBeNull();
  });

  it('stores release dates only for the regions asked about', () => {
    const us = mapMovie(normalMovie(), NOW, US)!;
    expect(new Set(us.releaseDates.map((row) => row.region))).toEqual(new Set(['US']));

    const both = mapMovie(normalMovie(), NOW, US_GB)!;
    expect(new Set(both.releaseDates.map((row) => row.region))).toEqual(new Set(['US', 'GB']));
    // FR is in the response and was not asked about.
    expect(both.releaseDates.some((row) => row.region === 'FR')).toBe(false);
  });

  it('keeps one row per region, type and date, first in response order', () => {
    // The US has two type-3 entries on 1999-10-15 differing only in `note`
    // (a standard run and an IMAX one). media_release_dates' primary key is
    // those four columns, so the second would abort the title's transaction.
    const mapped = mapMovie(normalMovie(), NOW, US)!;

    const theatrical = mapped.releaseDates.filter(
      (row) => row.release_type === 3 && row.released_on === '1999-10-15',
    );
    expect(theatrical).toHaveLength(1);
    expect(theatrical[0]!.note).toBeNull();

    const keys = mapped.releaseDates.map(
      (row) => `${row.region} ${row.release_type} ${row.released_on}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('takes the date part of a release instant and drops an unusable one', () => {
    const mapped = mapMovie(normalMovie(), NOW, US)!;
    const premiere = mapped.releaseDates.find((row) => row.release_type === 1)!;

    expect(premiere.released_on).toBe('1999-09-10');
    expect(premiere.note).toBe('Venice Film Festival');
    expect(premiere.certification).toBeNull();
  });

  it('prefers the theatrical certification and skips a region that has none', () => {
    const mapped = mapMovie(normalMovie(), NOW, US_GB)!;

    // The US lists a blank on the premiere, R on both theatrical entries and
    // TV-MA on the TV release. Theatrical wins.
    expect(mapped.certifications).toEqual([{ region: 'US', certification: 'R' }]);
    // GB's only entry has an empty certification, so it gets no row at all.
    expect(mapped.certifications.some((row) => row.region === 'GB')).toBe(false);
  });

  it('falls back to the first non-empty certification when there is no theatrical one', () => {
    const detail = normalMovie();
    detail.release_dates!.results![0]!.release_dates = [
      { certification: '', release_date: '1999-09-10T00:00:00.000Z', type: 1 },
      { certification: 'NC-17', release_date: '2000-06-06T00:00:00.000Z', type: 5 },
    ];

    const mapped = mapMovie(detail, NOW, US)!;
    expect(mapped.certifications).toEqual([{ region: 'US', certification: 'NC-17' }]);
  });

  it('maps availability per region and stubs every provider it names', () => {
    const mapped = mapMovie(normalMovie(), NOW, US_GB)!;

    expect(mapped.availability).toEqual([
      { region: 'US', provider_id: 8, offer_type: 'flatrate' },
      { region: 'US', provider_id: 1899, offer_type: 'flatrate' },
      { region: 'US', provider_id: 2, offer_type: 'rent' },
      { region: 'US', provider_id: 2, offer_type: 'buy' },
      { region: 'GB', provider_id: 8, offer_type: 'flatrate' },
    ]);
    // DE is in the response and was not asked about.
    expect(mapped.availability.some((row) => row.region === 'DE')).toBe(false);

    // Max (1899) is on the title and not in the directory fixture, which is
    // exactly the case the stub exists for.
    const max = mapped.providerStubs.find((row) => row.provider_id === 1899)!;
    expect(max).toEqual({
      provider_id: 1899,
      name: 'Max',
      logo_image_id: '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg',
      // Never the title's own display_priority: that is one region's number
      // and the column holds the whole map.
      display_priorities: {},
    });
    expect(mapped.providerStubs.filter((row) => row.provider_id === 2)).toHaveLength(1);
  });

  it('maps a title with no availability at all to no rows and no stubs', () => {
    const mapped = mapMovie(unvotedMovie(), NOW, US_GB)!;

    expect(mapped.availability).toEqual([]);
    expect(mapped.providerStubs).toEqual([]);
    // The regions still travel with the mapping, because the reconciliation
    // has to close out a title that has left every service.
    expect(mapped.regions).toEqual(['US', 'GB']);
  });

  it('returns null for a film with no title', () => {
    expect(mapMovie({ ...normalMovie(), title: '' }, NOW, US)).toBeNull();
  });
});

describe('mapTv', () => {
  it('maps the media_items row, with original_name under original_title', () => {
    const mapped = mapTv(returningTv(), NOW, US)!;

    expect(mapped.mediaItem.medium).toBe('tv');
    expect(mapped.mediaItem.title).toBe('Breaking Point');
    expect(mapped.mediaItem.year).toBe(2024);
    expect(mapped.mediaItem.release_date).toBe('2024-02-18');
    expect(mapped.mediaItem.external_ids).toEqual({
      tmdb: 1396,
      imdb: 'tt0903747',
      wikidata: 'Q1079',
      tvdb: 81189,
    });
    expect(mapped.mediaItem.metadata.original_title).toBe('Breaking Point');
    expect(mapped.mediaItem.metadata.tmdb_status).toBe('Returning Series');
    expect(mapped.mediaItem.metadata.tmdb_type).toBe('Scripted');
  });

  it('maps the details row of a returning series with a next episode', () => {
    const mapped = mapTv(returningTv(), NOW, US)!;

    expect(mapped.details.status).toBe('Returning Series');
    expect(mapped.details.show_type).toBe('Scripted');
    expect(mapped.details.in_production).toBe(true);
    expect(mapped.details.networks).toEqual(['AMC']);
    expect(mapped.details.creators).toEqual(['Vince Gilligan', 'Peter Gould']);
    expect(mapped.details.origin_country).toEqual(['US']);
    expect(mapped.details.season_count).toBe(3);
    expect(mapped.details.episode_count).toBe(24);
    expect(mapped.details.episode_runtime_minutes).toBe(47);
    expect(mapped.details.next_episode_air_date).toBe('2026-10-05');
    expect(mapped.details.next_episode_season).toBe(4);
    expect(mapped.details.next_episode_number).toBe(1);
    expect(mapped.details.next_episode_name).toBe('First Light');
    expect(mapped.details.last_episode_air_date).toBe('2026-09-07');
  });

  it('nulls every next_episode column together on an ended miniseries', () => {
    const mapped = mapTv(miniseries(), NOW, US)!;

    expect(mapped.details.status).toBe('Ended');
    expect(mapped.details.show_type).toBe('Miniseries');
    expect(mapped.details.in_production).toBe(false);
    expect(mapped.details.next_episode_air_date).toBeNull();
    expect(mapped.details.next_episode_season).toBeNull();
    expect(mapped.details.next_episode_number).toBeNull();
    expect(mapped.details.next_episode_name).toBeNull();
    // An empty episode_run_time array is the common case, not an error.
    expect(mapped.details.episode_runtime_minutes).toBeNull();
    expect(mapped.details.origin_country).toEqual(['US', 'GB']);
  });

  it('takes the cast in aggregate order, with the character from the first role', () => {
    const mapped = mapTv(returningTv(), NOW, US)!;

    expect(mapped.details.top_cast[0]).toEqual({
      tmdb_person_id: 17419,
      name: 'Bryan Cranston',
      character: 'Walter White',
      profile_path: '/n1MHnCq3ULwRhQ6KGiRjNUVv4Fr.jpg',
      episode_count: 24,
    });
    // Aaron Paul holds two roles; the first is the one with the episodes.
    expect(mapped.details.top_cast[1]!.character).toBe('Jesse Pinkman');
    expect(mapped.details.top_cast[1]!.episode_count).toBe(21);
  });

  it('stores season 0 alongside the numbered seasons, in order', () => {
    const mapped = mapTv(returningTv(), NOW, US)!;

    expect(mapped.seasons.map((row) => row.season_number)).toEqual([0, 1, 2, 3]);
    expect(mapped.seasons[0]).toEqual({
      season_number: 0,
      tmdb_season_id: 3572,
      name: 'Specials',
      episode_count: 3,
      air_date: '2024-02-11',
      poster_image_id: '/kMTcwNRfFKCZ0O2OaBZS0nZ2AIe.jpg',
      overview: null,
    });
    expect(mapped.seasons[2]!.poster_image_id).toBeNull();
  });

  it('skips a region whose content rating is the empty string', () => {
    const mapped = mapTv(returningTv(), NOW, US_GB)!;
    expect(mapped.certifications).toEqual([{ region: 'US', certification: 'TV-MA' }]);
  });

  it('maps availability for the regions asked about', () => {
    const mapped = mapTv(returningTv(), NOW, US_GB)!;

    expect(mapped.availability).toEqual([
      { region: 'US', provider_id: 8, offer_type: 'flatrate' },
      { region: 'US', provider_id: 613, offer_type: 'ads' },
      { region: 'GB', provider_id: 9, offer_type: 'flatrate' },
    ]);
    expect(mapped.providerStubs.map((row) => row.provider_id).sort((a, b) => a - b)).toEqual([
      8, 9, 613,
    ]);
  });

  it('returns null for a series with no name', () => {
    expect(mapTv({ ...returningTv(), name: '' }, NOW, US)).toBeNull();
  });
});

describe('mapProviderDirectory', () => {
  it('maps the two directories into one row per provider', () => {
    const movies = fixture<TmdbProviderDirectory>('tmdb-providers-movie.json').results!;
    const shows = fixture<TmdbProviderDirectory>('tmdb-providers-tv.json').results!;

    const merged = mapProviderDirectory([...movies, ...shows]);
    const byId = new Map(merged.map((row) => [row.provider_id, row]));

    expect([...byId.keys()].sort((a, b) => a - b)).toEqual([2, 3, 8, 9, 613]);
    // Last one wins per id, so the TV directory's figures survive for the two
    // providers both responses carry.
    expect(byId.get(8)!.display_priorities).toEqual({ US: 1, GB: 1 });
    expect(byId.get(613)).toEqual({
      provider_id: 613,
      name: 'Freevee',
      logo_image_id: '/zrDlBfmYivfPo6xvSyaidKMhFnU.jpg',
      display_priorities: { US: 12 },
    });
  });

  it('drops an entry with no id or no name rather than storing a blank', () => {
    expect(mapProviderDirectory([{ provider_name: 'Nameless' }])).toEqual([]);
    expect(mapProviderDirectory([{ provider_id: 5, provider_name: '  ' }])).toEqual([]);
  });
});
