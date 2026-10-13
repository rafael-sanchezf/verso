/**
 * The Watchlist's filters and sort (Rafa's letters on the site round,
 * 2026-10-12; frames `Watchlist` 261:119 and `Watchlist · Filters` 273:53):
 * the state, the reducer the sheet and the removable chips write through, and
 * the client half of the filtering.
 *
 * Length, genre and "on your services" go to `movie_watchlist` as its
 * arguments; director, decade and the sort run here over the rows it returns,
 * which carry the directors, the year and TMDB's score. The sheet's "Show N
 * films" counts with `matchesAll` over the unfiltered list, the same rule the
 * RPC applies, so the number moves as the sheet is changed without a round
 * trip per tap.
 *
 * A watchlist is a pool, not a queue (rule 34): the sort is a starting point
 * the person picks, newest added first by default, and nothing is ranked.
 *
 * No React; relative imports only (`test/watchlist-filters.test.ts`).
 */

import type { MovieWatchlistRow } from '@verso/api';

import { filmGenreLabel, filmRuntime } from '../../lib/film';

export type WatchlistSort = 'added' | 'runtime' | 'year' | 'rating';
export type Decade = '2020s' | '2010s' | '2000s' | '1990s' | 'older';

export const SORTS: readonly { value: WatchlistSort; label: string }[] = [
  { value: 'added', label: 'Added' },
  { value: 'runtime', label: 'Runtime' },
  { value: 'year', label: 'Year' },
  { value: 'rating', label: 'Rating' },
];

export const DECADES: readonly { value: Decade; label: string }[] = [
  { value: '2020s', label: '2020s' },
  { value: '2010s', label: '2010s' },
  { value: '2000s', label: '2000s' },
  { value: '1990s', label: '1990s' },
  { value: 'older', label: 'Older' },
];

/**
 * The length slider's six stops, in minutes, half an hour apart, the last one
 * "Any" (round three: "more indication of time").
 */
export const LENGTH_STOPS: readonly (number | null)[] = [60, 90, 120, 150, 180, null];

export interface WatchlistFilters {
  /** "Under 2 h" is 120; null is any length. */
  maxMinutes: number | null;
  /** TMDB's genre names, as `movie_details.genres` spells them. */
  genres: readonly string[];
  /** One director, as `movie_details.directors` spells the name. */
  director: string | null;
  decades: readonly Decade[];
  sort: WatchlistSort;
}

export const NO_FILTERS: WatchlistFilters = {
  maxMinutes: null,
  genres: [],
  director: null,
  decades: [],
  sort: 'added',
};

export type FilterAction =
  | { type: 'length'; maxMinutes: number | null }
  | { type: 'genre'; genre: string }
  | { type: 'director'; director: string | null }
  | { type: 'decade'; decade: Decade }
  | { type: 'sort'; sort: WatchlistSort }
  | { type: 'remove'; chip: FilterChipKey }
  | { type: 'reset' }
  | { type: 'replace'; filters: WatchlistFilters };

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function filtersReducer(state: WatchlistFilters, action: FilterAction): WatchlistFilters {
  switch (action.type) {
    case 'length':
      return { ...state, maxMinutes: action.maxMinutes };
    case 'genre':
      return { ...state, genres: toggle(state.genres, action.genre) };
    case 'director': {
      const name = action.director?.trim() ?? '';
      return { ...state, director: name === '' ? null : name };
    }
    case 'decade':
      return { ...state, decades: toggle(state.decades, action.decade) };
    case 'sort':
      return { ...state, sort: action.sort };
    case 'remove':
      return removeChip(state, action.chip);
    case 'reset':
      // Reset clears the filters; the sort is a view, kept as chosen.
      return { ...NO_FILTERS, sort: state.sort };
    case 'replace':
      return action.filters;
  }
}

/** How many filters are set, for the Filters chip's badge. The sort is not a filter. */
export function activeCount(filters: WatchlistFilters): number {
  return (
    (filters.maxMinutes === null ? 0 : 1) +
    filters.genres.length +
    (filters.director === null ? 0 : 1) +
    filters.decades.length
  );
}

/** "Under 2 h", "Under 1 h 30"; "Any length" for none. */
export function lengthLabel(maxMinutes: number | null): string {
  return maxMinutes === null ? 'Any length' : `Under ${filmRuntime(maxMinutes) ?? `${maxMinutes} min`}`;
}

/** A stop's tick under the slider: "1 h", "1 h 30", "Any". */
export function stopLabel(stop: number | null): string {
  return stop === null ? 'Any' : (filmRuntime(stop) ?? `${stop} min`);
}

export type FilterChipKey =
  | { kind: 'length' }
  | { kind: 'genre'; genre: string }
  | { kind: 'director' }
  | { kind: 'decade'; decade: Decade };

export interface SetFilterChip {
  key: FilterChipKey;
  label: string;
}

/** The set filters as removable chips under the sub row, in the sheet's order. */
export function setChips(filters: WatchlistFilters): SetFilterChip[] {
  const chips: SetFilterChip[] = [];
  if (filters.maxMinutes !== null) chips.push({ key: { kind: 'length' }, label: lengthLabel(filters.maxMinutes) });
  for (const genre of filters.genres) {
    chips.push({ key: { kind: 'genre', genre }, label: filmGenreLabel(genre) ?? genre });
  }
  if (filters.director !== null) chips.push({ key: { kind: 'director' }, label: filters.director });
  for (const decade of filters.decades) {
    chips.push({ key: { kind: 'decade', decade }, label: DECADES.find((d) => d.value === decade)?.label ?? decade });
  }
  return chips;
}

function removeChip(state: WatchlistFilters, chip: FilterChipKey): WatchlistFilters {
  switch (chip.kind) {
    case 'length':
      return { ...state, maxMinutes: null };
    case 'genre':
      return { ...state, genres: state.genres.filter((genre) => genre !== chip.genre) };
    case 'director':
      return { ...state, director: null };
    case 'decade':
      return { ...state, decades: state.decades.filter((decade) => decade !== chip.decade) };
  }
}

/** The decade chip a year falls under; before 1990 is "Older". */
export function decadeOf(year: number | null): Decade | null {
  if (year === null || !Number.isFinite(year)) return null;
  if (year >= 2020) return '2020s';
  if (year >= 2010) return '2010s';
  if (year >= 2000) return '2000s';
  if (year >= 1990) return '1990s';
  return 'older';
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type Row = Pick<
  MovieWatchlistRow,
  'mediaItemId' | 'year' | 'runtimeMinutes' | 'genres' | 'directors' | 'tmdbScore' | 'addedAt' | 'onMyServices'
>;

/** The client half: director and decade. What the RPC does not take. */
export function matchesClient(row: Row, filters: WatchlistFilters): boolean {
  if (filters.director !== null && !row.directors.some((name) => sameName(name, filters.director!))) return false;
  if (filters.decades.length > 0) {
    const decade = decadeOf(row.year);
    if (decade === null || !filters.decades.includes(decade)) return false;
  }
  return true;
}

/**
 * Every filter, the RPC's half included, for counting over the unfiltered
 * list: on your services (any of the caller's services streams it), at or
 * under the length (a film with no runtime is out, as the RPC does), sharing
 * a genre, then the client half.
 */
export function matchesAll(row: Row, filters: WatchlistFilters, onMyServices: boolean): boolean {
  if (onMyServices && row.onMyServices.length === 0) return false;
  if (filters.maxMinutes !== null && (row.runtimeMinutes === null || row.runtimeMinutes > filters.maxMinutes)) {
    return false;
  }
  if (filters.genres.length > 0 && !row.genres.some((genre) => filters.genres.includes(genre))) return false;
  return matchesClient(row, filters);
}

/** Nulls last in every sort, whichever way it runs. */
function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

/**
 * Sort a copy: Added newest first (the RPC's own order, kept stable), Runtime
 * shortest first, Year newest first, Rating highest first. Ties keep the order
 * they came in, which is newest added first.
 */
export function sortRows<T extends Row>(rows: readonly T[], sort: WatchlistSort): T[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    let order = 0;
    if (sort === 'added') order = Date.parse(b.row.addedAt) - Date.parse(a.row.addedAt);
    if (sort === 'runtime') order = compareNullable(a.row.runtimeMinutes, b.row.runtimeMinutes, 1);
    if (sort === 'year') order = compareNullable(a.row.year, b.row.year, -1);
    if (sort === 'rating') order = compareNullable(a.row.tmdbScore, b.row.tmdbScore, -1);
    return order !== 0 && Number.isFinite(order) ? order : a.index - b.index;
  });
  return indexed.map(({ row }) => row);
}

/** The genre chips: the watchlist's own genres the app names, most common first, then by label. */
export function genreOptions(rows: readonly Pick<Row, 'genres'>[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const genre of row.genres) {
      if (filmGenreLabel(genre) === null) continue;
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (filmGenreLabel(a[0]) ?? a[0]).localeCompare(filmGenreLabel(b[0]) ?? b[0]))
    .map(([genre]) => genre);
}

/**
 * The director field's suggestions: the watchlist's own directors whose name
 * contains the typed text (any word), most films first, at most five.
 */
export function directorSuggestions(rows: readonly Pick<Row, 'directors'>[], typed: string, limit = 5): string[] {
  const needle = typed.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const name of row.directors) {
      const clean = name.trim();
      if (clean === '') continue;
      counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([name]) => needle === '' || name.toLowerCase().includes(needle))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

/** "Show 4 films", "Show 1 film". */
export function showLabel(count: number): string {
  return count === 1 ? 'Show 1 film' : `Show ${count} films`;
}

/** The sub row's count: "12 films", "1 film". */
export function filmCount(count: number): string {
  return count === 1 ? '1 film' : `${count} films`;
}
