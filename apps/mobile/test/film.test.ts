/**
 * A film's facts in the movie screens' words (lib/film.ts), the Watchlist
 * grid's zoom (screens/watchlist/zoom.ts) and the movie page's Where to
 * watch chips (screens/movie/where-to-watch.ts).
 */

import type { InsertionState } from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  filmComparisonWords,
  filmFactsLine,
  filmGenreLabel,
  filmGenreLabels,
  filmMeta,
  filmRuntime,
  filmSearchLine,
  tmdbScoreText,
} from '../src/lib/film';
import { whereToWatch } from '../src/screens/movie/where-to-watch';
import { cardWidth, columnsAfterPinch, columnsStorageKey, parseColumns } from '../src/screens/watchlist/zoom';

describe('film genres', () => {
  it("names TMDB's genres the site's way and drops TV Movie", () => {
    expect(filmGenreLabel('Science Fiction')).toBe('Sci-fi');
    expect(filmGenreLabel('Adventure')).toBe('Adventure');
    expect(filmGenreLabel('TV Movie')).toBeNull();
    expect(filmGenreLabels(['TV Movie', 'Science Fiction', 'Drama', 'Science Fiction'])).toEqual(['Sci-fi', 'Drama']);
  });
});

describe('the lines', () => {
  it('writes runtimes as the frames do', () => {
    expect(filmRuntime(155)).toBe('2 h 35');
    expect(filmRuntime(120)).toBe('2 h');
    expect(filmRuntime(45)).toBe('45 min');
    expect(filmRuntime(null)).toBeNull();
    expect(filmRuntime(0)).toBeNull();
  });

  it('reads "year · genre", falling back to either half', () => {
    expect(filmMeta(2021, ['Science Fiction', 'Adventure'])).toBe('2021 · Sci-fi');
    expect(filmMeta(2021, [])).toBe('2021');
    expect(filmMeta(null, ['Drama'])).toBe('Drama');
    expect(filmMeta(null, ['TV Movie'])).toBeNull();
  });

  it('puts the matched person in place of the genre on a search row', () => {
    expect(filmSearchLine(2021, ['Science Fiction'], 'Denis Villeneuve')).toBe('2021 · Denis Villeneuve');
    expect(filmSearchLine(2021, ['Science Fiction'], null)).toBe('2021 · Sci-fi');
    expect(filmSearchLine(2021, ['Science Fiction'], '  ')).toBe('2021 · Sci-fi');
  });

  it('reads the page header line and the TMDB score', () => {
    expect(filmFactsLine(2021, 155, 'PG-13')).toBe('2021 · 2 h 35 · PG-13');
    expect(filmFactsLine(2021, null, null)).toBe('2021');
    expect(tmdbScoreText(80)).toBe('8.0');
    expect(tmdbScoreText(null)).toBeNull();
  });
});

describe('filmComparisonWords', () => {
  const state = (pivotReason: InsertionState['pivotReason']) => ({ pivotReason }) as InsertionState;

  it('asks the genre form with a movie noun when the pivot is a genre peer', () => {
    expect(filmComparisonWords(state({ kind: 'genre', genre: 'Science Fiction' }))).toEqual({
      prompt: 'Which sci-fi movie did you enjoy more?',
      cue: 'Sci-fi',
    });
    expect(filmComparisonWords(state({ kind: 'genre', genre: 'Drama' })).prompt).toBe('Which drama did you enjoy more?');
  });

  it('falls back to the base question', () => {
    expect(filmComparisonWords(state({ kind: 'midpoint' }))).toEqual({ prompt: 'Which did you enjoy more?', cue: null });
    expect(filmComparisonWords(state({ kind: 'genre', genre: 'TV Movie' })).cue).toBeNull();
    expect(filmComparisonWords(state(null)).cue).toBeNull();
  });
});

describe('the Watchlist zoom', () => {
  it('steps one count per pinch, past 1.25 in and 0.8 out', () => {
    expect(columnsAfterPinch(3, 1.4)).toBe(2);
    expect(columnsAfterPinch(2, 3)).toBe(2);
    expect(columnsAfterPinch(3, 0.6)).toBe(5);
    expect(columnsAfterPinch(5, 0.2)).toBe(5);
    expect(columnsAfterPinch(3, 1.1)).toBe(3);
    expect(columnsAfterPinch(5, 1.3)).toBe(3);
  });

  it('sizes a card inside 16 pt margins at 402 wide', () => {
    expect(cardWidth(402, 2)).toBe(177);
    expect(cardWidth(402, 3)).toBe(116);
    expect(cardWidth(402, 5)).toBe(67);
  });

  it('keeps the count per user and reads a bad value as three', () => {
    expect(columnsStorageKey('u1')).toBe('verso.watchlist.columns.u1');
    expect(parseColumns('5')).toBe(5);
    expect(parseColumns('4')).toBe(3);
    expect(parseColumns(null)).toBe(3);
  });
});

describe('whereToWatch', () => {
  const offers = [
    { providerId: 2, name: 'Apple TV', offerType: 'rent', priority: 4 },
    { providerId: 2, name: 'Apple TV', offerType: 'buy', priority: 4 },
    { providerId: 15, name: 'Hulu', offerType: 'flatrate', priority: 3 },
    { providerId: 8, name: 'Netflix', offerType: 'flatrate', priority: 1 },
    { providerId: 10, name: 'Prime Video', offerType: 'buy', priority: 6 },
  ];

  it('puts my services first with the check, then streams, rents and buys by priority', () => {
    expect(whereToWatch(offers, [15], false)).toEqual([
      { key: '15', label: 'Hulu', mine: true },
      { key: '8', label: 'Netflix', mine: false },
      { key: '2', label: 'Rent · Apple TV', mine: false },
      { key: '10', label: 'Buy · Prime Video', mine: false },
    ]);
  });

  it('shows In theaters only while nothing streams', () => {
    expect(whereToWatch([], [], true)).toEqual([{ key: 'theaters', label: 'In theaters', mine: false }]);
    expect(whereToWatch(offers, [], true).some((chip) => chip.key === 'theaters')).toBe(false);
  });
});
