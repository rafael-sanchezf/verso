/**
 * A film's facts in the words the movie screens print.
 *
 * Films carry TMDB's genre names ("Science Fiction", "Adventure"), not IGDB's,
 * and `genreDisplayName` in @verso/core is IGDB's table: it would print a film
 * tagged Adventure as "adventure game" and drop Science Fiction altogether. So
 * the films get their own table here, with the label a line starts with
 * ("Sci-fi", as the site's Ranking phone reads) and the noun the comparison
 * prompt says ("Which sci-fi movie did you enjoy more?", the site's compare
 * phone).
 *
 * No React and no `react-native` import, and relative imports only, so the
 * node test suite loads it (`test/film.test.ts`).
 */

import type { InsertionState } from '@verso/core';
import { DEFAULT_BASE_PROMPT } from '@verso/core';

interface FilmGenre {
  /** Where the word starts a line or sits on a chip: "Sci-fi". */
  readonly label: string;
  /** Inside the comparison prompt: "Which {noun} did you enjoy more?" */
  readonly noun: string;
}

/**
 * TMDB's movie genres, all nineteen as of 2026-10. "TV Movie" is left out on
 * purpose: it says where a film first aired, not what kind of film it is, the
 * way IGDB's "Indie" says who made a game.
 */
const FILM_GENRES: Readonly<Record<string, FilmGenre>> = {
  Action: { label: 'Action', noun: 'action movie' },
  Adventure: { label: 'Adventure', noun: 'adventure movie' },
  Animation: { label: 'Animation', noun: 'animated movie' },
  Comedy: { label: 'Comedy', noun: 'comedy' },
  Crime: { label: 'Crime', noun: 'crime movie' },
  Documentary: { label: 'Documentary', noun: 'documentary' },
  Drama: { label: 'Drama', noun: 'drama' },
  Family: { label: 'Family', noun: 'family movie' },
  Fantasy: { label: 'Fantasy', noun: 'fantasy movie' },
  History: { label: 'History', noun: 'historical movie' },
  Horror: { label: 'Horror', noun: 'horror movie' },
  Music: { label: 'Music', noun: 'music movie' },
  Mystery: { label: 'Mystery', noun: 'mystery' },
  Romance: { label: 'Romance', noun: 'romance' },
  'Science Fiction': { label: 'Sci-fi', noun: 'sci-fi movie' },
  Thriller: { label: 'Thriller', noun: 'thriller' },
  War: { label: 'War', noun: 'war movie' },
  Western: { label: 'Western', noun: 'western' },
};

function lookup(genre: string): FilmGenre | null {
  return FILM_GENRES[genre.trim()] ?? null;
}

/** "Sci-fi" for TMDB's "Science Fiction"; null for a genre the app does not name (TV Movie). */
export function filmGenreLabel(genre: string): string | null {
  return lookup(genre)?.label ?? null;
}

/** The labels of a film's genres, unknown ones dropped, duplicates collapsed. */
export function filmGenreLabels(genres: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const genre of genres ?? []) {
    const label = filmGenreLabel(genre);
    if (label !== null && !out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * A runtime the way the frames write it: `2 h 35`, `2 h`, `45 min`. Null for
 * no runtime (rule 9: nothing is better than an invented one).
 */
export function filmRuntime(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

function joinPresent(parts: readonly (string | null | undefined)[]): string | null {
  const present = parts.filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return present.length === 0 ? null : present.join(' · ');
}

/**
 * The line under a film's title in a list: `2021 · Sci-fi` (the year tells
 * remakes apart, the genre says what it is; movies-brief.md, third pass,
 * point 2). The year alone without a genre, the genre alone without a year.
 */
export function filmMeta(year: number | null | undefined, genres: readonly string[] | null | undefined): string | null {
  return joinPresent([year === null || year === undefined ? null : String(year), filmGenreLabels(genres)[0]]);
}

/**
 * A search row's line: the person the query matched when there is one
 * (`2021 · Denis Villeneuve`), the genre otherwise. `personMatch` arrives with
 * `search_games`'s person tier (movies-build.md, PR 1); until then it is
 * undefined and every row reads year and genre.
 */
export function filmSearchLine(
  year: number | null | undefined,
  genres: readonly string[] | null | undefined,
  personMatch?: string | null,
): string | null {
  const person = personMatch?.trim();
  if (person) return joinPresent([year === null || year === undefined ? null : String(year), person]);
  return filmMeta(year, genres);
}

/** The movie page's second header line: `2021 · 2 h 35 · PG-13`. */
export function filmFactsLine(
  year: number | null | undefined,
  runtimeMinutes: number | null | undefined,
  certification: string | null | undefined,
): string | null {
  return joinPresent([
    year === null || year === undefined ? null : String(year),
    filmRuntime(runtimeMinutes),
    certification,
  ]);
}

/**
 * The comparison step's words for films: the cue beside the cards ("Sci-fi")
 * and the prompt above them ("Which sci-fi movie did you enjoy more?"), read
 * off the engine's pivot reason the way `comparisonPrompt` and `genreCue` do
 * for games, so the two can never disagree.
 */
export function filmComparisonWords(state: InsertionState): { prompt: string; cue: string | null } {
  const reason = state.pivotReason;
  const genre = reason !== null && reason.kind === 'genre' ? lookup(reason.genre) : null;
  if (genre === null) return { prompt: DEFAULT_BASE_PROMPT, cue: null };
  return { prompt: `Which ${genre.noun} did you enjoy more?`, cue: genre.label };
}

/** TMDB's 0-100 stored score as the page prints it: `8.0`. */
export function tmdbScoreText(stored: number | null | undefined): string | null {
  if (stored === null || stored === undefined || !Number.isFinite(stored)) return null;
  return (stored / 10).toFixed(1);
}
