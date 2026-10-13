/**
 * Movies Home's rows by reason (screens/home/movie-rows.ts): the title's
 * italic span, the pills on each card, and where "See all" goes.
 */

import { describe, expect, it } from 'vitest';

import { cardFacts, cardSize, findRow, rowTitleParts, rowTitleText, seeAllTarget } from '../src/screens/home/movie-rows';

const NAMES = new Map<number, string>([
  [8, 'Netflix'],
  [15, 'Hulu'],
  [1899, 'HBO Max'],
]);

const film = {
  onMyServices: [8],
  genres: ['Science Fiction', 'Adventure'],
  year: 2021,
  runtimeMinutes: 155,
};

describe('rowTitleParts', () => {
  it('sets the loved film in italics and the rest plain', () => {
    expect(
      rowTitleParts({ kind: 'because', title: 'Because you loved Past Lives', variablePart: 'Past Lives' }),
    ).toEqual([
      { text: 'Because you loved ', italic: false },
      { text: 'Past Lives', italic: true },
    ]);
  });

  it('finds the film when its title repeats a word of the plain part', () => {
    expect(
      rowTitleParts({ kind: 'because', title: 'Because you loved Because', variablePart: 'Because' }),
    ).toEqual([
      { text: 'Because you loved ', italic: false },
      { text: 'Because', italic: true },
    ]);
  });

  it('sets the genre word alone, plain, in the app\'s word for it', () => {
    expect(rowTitleParts({ kind: 'genre', title: 'Horror', variablePart: 'Horror' })).toEqual([
      { text: 'Horror', italic: false },
    ]);
    expect(rowTitleParts({ kind: 'genre', title: 'Science Fiction', variablePart: 'Science Fiction' })).toEqual([
      { text: 'Sci-fi', italic: false },
    ]);
  });

  it('keeps a title with nothing variable plain', () => {
    expect(rowTitleParts({ kind: 'watchlist', title: 'You wanted to watch these', variablePart: null })).toEqual([
      { text: 'You wanted to watch these', italic: false },
    ]);
    expect(rowTitleParts({ kind: 'popular', title: 'Popular', variablePart: null })).toEqual([
      { text: 'Popular', italic: false },
    ]);
  });

  it('reads the whole title as one string', () => {
    expect(rowTitleText({ kind: 'because', title: 'Because you loved Past Lives', variablePart: 'Past Lives' })).toBe(
      'Because you loved Past Lives',
    );
  });
});

describe('cardFacts', () => {
  it('puts service, genre, year and duration on the first row', () => {
    expect(cardSize(0)).toBe('large');
    expect(cardFacts(film, 'large', NAMES)).toEqual(['Netflix', 'Sci-fi', '2021', '2 h 35']);
  });

  it('puts the service alone on the rows under it', () => {
    expect(cardSize(1)).toBe('small');
    expect(cardFacts(film, 'small', NAMES)).toEqual(['Netflix']);
  });

  it('draws no service pill for a film on none of the caller\'s services', () => {
    const nowhere = { ...film, onMyServices: [] };
    expect(cardFacts(nowhere, 'large', NAMES)).toEqual(['Sci-fi', '2021', '2 h 35']);
    expect(cardFacts(nowhere, 'small', NAMES)).toEqual([]);
  });

  it('takes the first of the caller\'s services the directory names', () => {
    expect(cardFacts({ ...film, onMyServices: [999, 15, 8] }, 'small', NAMES)).toEqual(['Hulu']);
  });

  it('leaves out a fact the film does not have', () => {
    expect(cardFacts({ onMyServices: [], genres: ['TV Movie'], year: null, runtimeMinutes: null }, 'large', NAMES)).toEqual(
      [],
    );
  });
});

describe('seeAllTarget', () => {
  it('opens the Watchlist from the watchlist row', () => {
    expect(seeAllTarget({ kind: 'watchlist', title: 'You wanted to watch these', variablePart: null }, 0)).toEqual({
      to: 'watchlist',
    });
  });

  it("opens every other row's own page, named by kind and value", () => {
    expect(seeAllTarget({ kind: 'genre', title: 'Science Fiction', variablePart: 'Science Fiction' }, 1)).toEqual({
      to: 'row',
      ref: { index: 1, kind: 'genre', value: 'Science Fiction' },
    });
    expect(
      seeAllTarget({ kind: 'because', title: 'Because you loved Past Lives', variablePart: 'Past Lives' }, 4),
    ).toEqual({ to: 'row', ref: { index: 4, kind: 'because', value: 'Past Lives' } });
    expect(seeAllTarget({ kind: 'popular', title: 'Popular', variablePart: null }, 0)).toEqual({
      to: 'row',
      ref: { index: 0, kind: 'popular', value: 'Popular' },
    });
  });
});

describe('findRow', () => {
  const rows = [
    { kind: 'watchlist' as const, title: 'You wanted to watch these', variablePart: null },
    { kind: 'genre' as const, title: 'Horror', variablePart: 'Horror' },
    { kind: 'because' as const, title: 'Because you loved Past Lives', variablePart: 'Past Lives' },
  ];

  it('takes the row at its index when it is still the same row', () => {
    expect(findRow(rows, { index: 1, kind: 'genre', value: 'Horror' })).toBe(rows[1]);
  });

  it('finds it by kind and value when a refetch moved it', () => {
    expect(findRow(rows, { index: 0, kind: 'because', value: 'Past Lives' })).toBe(rows[2]);
  });

  it('is null when the row is gone', () => {
    expect(findRow(rows, { index: 1, kind: 'genre', value: 'Thriller' })).toBeNull();
  });
});
