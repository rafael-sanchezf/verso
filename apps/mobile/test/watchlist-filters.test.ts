/**
 * The Watchlist's filter reducer and the client half of the filtering
 * (screens/watchlist/filters.ts).
 */

import type { MovieWatchlistRow } from '@verso/api';
import { describe, expect, it } from 'vitest';

import {
  activeCount,
  decadeOf,
  directorSuggestions,
  filmCount,
  filtersReducer,
  genreOptions,
  lengthLabel,
  LENGTH_STOPS,
  matchesAll,
  matchesClient,
  NO_FILTERS,
  say,
  setChips,
  showLabel,
  sortRows,
  stopLabel,
  type Phrase,
  type WatchlistFilters,
} from '../src/screens/watchlist/filters';
import { translate } from '../src/lib/i18n/dictionary';
import type { Language } from '../src/lib/i18n/model';

/** A phrase as the screen says it. */
function words(phrase: Phrase, language: Language = 'en'): string {
  return say((key, vars) => translate(language, key, vars), phrase);
}

function film(overrides: Partial<MovieWatchlistRow> & { mediaItemId: string }): MovieWatchlistRow {
  return {
    title: overrides.mediaItemId,
    year: 2021,
    coverImageId: null,
    externalIds: null,
    releaseDate: null,
    runtimeMinutes: 120,
    genres: ['Drama'],
    directors: [],
    tmdbScore: 70,
    tmdbVoteCount: 100,
    addedAt: '2026-10-01T00:00:00Z',
    streamsOn: [],
    onMyServices: [],
    rentOrBuy: [],
    ...overrides,
  };
}

const dune = film({
  mediaItemId: 'dune',
  year: 2021,
  runtimeMinutes: 155,
  genres: ['Science Fiction', 'Adventure'],
  directors: ['Denis Villeneuve'],
  tmdbScore: 80,
  addedAt: '2026-10-03T00:00:00Z',
  onMyServices: [8],
});
const getOut = film({
  mediaItemId: 'get-out',
  year: 2017,
  runtimeMinutes: 104,
  genres: ['Horror', 'Mystery', 'Thriller'],
  directors: ['Jordan Peele'],
  tmdbScore: 76,
  addedAt: '2026-10-05T00:00:00Z',
});
const arrival = film({
  mediaItemId: 'arrival',
  year: 2016,
  runtimeMinutes: 116,
  genres: ['Science Fiction', 'Drama'],
  directors: ['Denis Villeneuve'],
  tmdbScore: null,
  addedAt: '2026-10-04T00:00:00Z',
  onMyServices: [531],
});
const godfather = film({
  mediaItemId: 'godfather',
  year: 1972,
  runtimeMinutes: null,
  genres: ['Drama', 'Crime'],
  directors: ['Francis Ford Coppola'],
  tmdbScore: 87,
  addedAt: '2026-10-02T00:00:00Z',
});
const rows = [getOut, arrival, dune, godfather];

describe('filtersReducer', () => {
  it('sets the length, toggles genres and decades, sets and clears the director', () => {
    let state: WatchlistFilters = NO_FILTERS;
    state = filtersReducer(state, { type: 'length', maxMinutes: 120 });
    state = filtersReducer(state, { type: 'genre', genre: 'Science Fiction' });
    state = filtersReducer(state, { type: 'genre', genre: 'Drama' });
    state = filtersReducer(state, { type: 'genre', genre: 'Drama' });
    state = filtersReducer(state, { type: 'decade', decade: '2010s' });
    state = filtersReducer(state, { type: 'director', director: '  Denis Villeneuve ' });
    expect(state).toEqual({
      maxMinutes: 120,
      genres: ['Science Fiction'],
      director: 'Denis Villeneuve',
      decades: ['2010s'],
      sort: 'added',
    });
    expect(activeCount(state)).toBe(4);
    expect(filtersReducer(state, { type: 'director', director: '   ' }).director).toBeNull();
  });

  it('removes one chip at a time', () => {
    const state: WatchlistFilters = {
      maxMinutes: 90,
      genres: ['Horror', 'Comedy'],
      director: 'Jordan Peele',
      decades: ['2010s', 'older'],
      sort: 'year',
    };
    expect(filtersReducer(state, { type: 'remove', chip: { kind: 'length' } }).maxMinutes).toBeNull();
    expect(filtersReducer(state, { type: 'remove', chip: { kind: 'genre', genre: 'Horror' } }).genres).toEqual(['Comedy']);
    expect(filtersReducer(state, { type: 'remove', chip: { kind: 'director' } }).director).toBeNull();
    expect(filtersReducer(state, { type: 'remove', chip: { kind: 'decade', decade: 'older' } }).decades).toEqual(['2010s']);
  });

  it('resets the filters and keeps the sort', () => {
    const state: WatchlistFilters = { ...NO_FILTERS, maxMinutes: 60, genres: ['Drama'], sort: 'rating' };
    expect(filtersReducer(state, { type: 'reset' })).toEqual({ ...NO_FILTERS, sort: 'rating' });
  });

  it('never counts the sort as a filter', () => {
    expect(activeCount({ ...NO_FILTERS, sort: 'runtime' })).toBe(0);
  });
});

describe('the chips and the words', () => {
  it('lists the set filters in the sheet order, genres by their labels', () => {
    const chips = setChips({
      maxMinutes: 120,
      genres: ['Science Fiction'],
      director: 'Denis Villeneuve',
      decades: ['older'],
      sort: 'added',
    });
    expect(chips.map((chip) => words(chip.label))).toEqual(['Under 2 h', 'Sci-fi', 'Denis Villeneuve', 'Older']);
    // The names are data and stay as they are; the words around them translate.
    expect(chips.map((chip) => words(chip.label, 'es'))).toEqual([
      'Menos de 2 h',
      'Sci-fi',
      'Denis Villeneuve',
      'Anteriores',
    ]);
  });

  it('labels the six stops and the choice', () => {
    expect(LENGTH_STOPS.map((stop) => words(stopLabel(stop)))).toEqual(['1 h', '1 h 30', '2 h', '2 h 30', '3 h', 'Any']);
    expect(words(lengthLabel(90))).toBe('Under 1 h 30');
    expect(words(lengthLabel(null))).toBe('Any length');
  });

  it('counts films', () => {
    expect(words(showLabel(4))).toBe('Show 4 films');
    expect(words(showLabel(1))).toBe('Show 1 film');
    expect(words(filmCount(12))).toBe('12 films');
    expect(words(filmCount(1))).toBe('1 film');
    expect(words(showLabel(4), 'es')).toBe('Mostrar 4 películas');
    expect(words(filmCount(1), 'es')).toBe('1 película');
  });
});

describe('decadeOf', () => {
  it('puts a year under its chip, before 1990 under Older', () => {
    expect(decadeOf(2024)).toBe('2020s');
    expect(decadeOf(2010)).toBe('2010s');
    expect(decadeOf(1999)).toBe('1990s');
    expect(decadeOf(1972)).toBe('older');
    expect(decadeOf(null)).toBeNull();
  });
});

describe('matching', () => {
  it('runs the director (any case) and the decades on the client', () => {
    const filters = { ...NO_FILTERS, director: 'denis villeneuve', decades: ['2010s' as const] };
    expect(rows.filter((row) => matchesClient(row, filters)).map((row) => row.mediaItemId)).toEqual(['arrival']);
  });

  it('counts with every filter the way the RPC applies its half', () => {
    const filters = { ...NO_FILTERS, maxMinutes: 120, genres: ['Science Fiction', 'Horror'] };
    expect(rows.filter((row) => matchesAll(row, filters, false)).map((row) => row.mediaItemId)).toEqual([
      'get-out',
      'arrival',
    ]);
    // On your services: only the films one of the caller's services streams.
    expect(rows.filter((row) => matchesAll(row, filters, true)).map((row) => row.mediaItemId)).toEqual(['arrival']);
  });

  it('leaves a film with no runtime out of a length filter', () => {
    expect(matchesAll(godfather, { ...NO_FILTERS, maxMinutes: 180 }, false)).toBe(false);
    expect(matchesAll(godfather, NO_FILTERS, false)).toBe(true);
  });
});

describe('sortRows', () => {
  const ids = (list: readonly MovieWatchlistRow[]) => list.map((row) => row.mediaItemId);

  it('sorts by added, runtime, year and rating, nulls last', () => {
    expect(ids(sortRows(rows, 'added'))).toEqual(['get-out', 'arrival', 'dune', 'godfather']);
    expect(ids(sortRows(rows, 'runtime'))).toEqual(['get-out', 'arrival', 'dune', 'godfather']);
    expect(ids(sortRows(rows, 'year'))).toEqual(['dune', 'get-out', 'arrival', 'godfather']);
    expect(ids(sortRows(rows, 'rating'))).toEqual(['godfather', 'dune', 'get-out', 'arrival']);
  });

  it('does not change the list it was given', () => {
    const copy = [...rows];
    sortRows(rows, 'year');
    expect(rows).toEqual(copy);
  });
});

describe('the sheet options', () => {
  it('offers the watchlist own genres, most common first, named ones only', () => {
    const withTvMovie = [...rows, film({ mediaItemId: 'tv', genres: ['TV Movie'] })];
    expect(genreOptions(withTvMovie)).toEqual(['Drama', 'Science Fiction', 'Adventure', 'Crime', 'Horror', 'Mystery', 'Thriller']);
  });

  it('suggests the watchlist own directors by what is typed', () => {
    expect(directorSuggestions(rows, '')).toEqual(['Denis Villeneuve', 'Francis Ford Coppola', 'Jordan Peele']);
    expect(directorSuggestions(rows, 'pee')).toEqual(['Jordan Peele']);
    expect(directorSuggestions(rows, 'ville')).toEqual(['Denis Villeneuve']);
  });
});
