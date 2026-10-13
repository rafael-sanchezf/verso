import type { LetterboxdMatchRow, TierListRow } from '@verso/api';
import type { LetterboxdFilm } from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  applyArgs,
  buildReview,
  diaryDates,
  droppedKey,
  EMPTY_MOVIE_TIERS,
  moveInList,
  placedTiers,
  reviewHeadline,
  rowFacts,
  type ReviewListItem,
} from '../src/screens/letterboxd/model';

function film(key: string, title: string, rating: number | null, extra: Partial<LetterboxdFilm> = {}): LetterboxdFilm {
  return { key, uri: `https://boxd.it/${key}`, title, year: 2020, rating, watchedDates: [], rewatches: 0, tmdbId: null, ...extra };
}

function match(key: string, id: string | null, kind: 'tmdb' | 'title' | 'fuzzy' | null = 'title', title?: string): LetterboxdMatchRow {
  return {
    key,
    media_item_id: id,
    title: id ? (title ?? `Catalog ${id}`) : null,
    year: id ? 2020 : null,
    cover_image_id: id ? `cover_${id}` : null,
    external_ids: id ? {} : null,
    genres: id ? [] : null,
    match: id ? kind : null,
  };
}

function tierRow(id: string, position: number): TierListRow {
  return {
    media_item_id: id,
    position,
    title: `Ranked ${id}`,
    year: 2010,
    cover_image_id: null,
    external_ids: {},
    genres: [],
    platforms: [],
    played_platforms: [],
    placed_by: 'user',
  };
}

const keysOf = (list: readonly ReviewListItem[]) => list.map((entry) => entry.key);

describe('buildReview', () => {
  it('buckets every film and lays the proposal out under four dividers', () => {
    const review = buildReview(
      [
        film('a', 'Alpha', 5),
        film('b', 'Beta', 4),
        film('c', 'Gamma', null, { watchedDates: ['2024-01-01'] }),
        film('d', 'Delta', 3),
        film('e', 'Epsilon', 4.5),
      ],
      [match('a', 'A'), match('b', 'B'), match('c', 'C'), match('d', null), match('e', 'E', 'fuzzy', 'Epsilom')],
      EMPTY_MOVIE_TIERS,
    );

    expect(review.rated.map((entry) => entry.film.key)).toEqual(['a', 'b', 'e']);
    expect(review.watched.map((entry) => entry.film.key)).toEqual(['c']);
    expect(review.unmatched.map((entry) => entry.film.key)).toEqual(['d']);
    expect(review.skipped).toEqual([]);
    expect(review.fuzzy).toBe(1);

    expect(keysOf(review.list)).toEqual(['divider:loved', 'A', 'E', 'divider:liked', 'B', 'divider:fine', 'divider:disliked']);

    const epsilon = review.list.find((entry) => entry.key === 'E');
    expect(epsilon?.kind === 'film' && epsilon.row).toMatchObject({
      kind: 'imported',
      title: 'Epsilom',
      fileTitle: 'Epsilon',
      rating: 4.5,
    });
  });

  it('skips a film the user already ranked and keeps the earned order around the imports', () => {
    const review = buildReview(
      [film('a', 'Alpha', 5), film('x', 'Already', 1)],
      [match('a', 'A'), match('x', 'X')],
      { ...EMPTY_MOVIE_TIERS, loved: [tierRow('X', 0)] },
    );

    expect(review.skipped.map((entry) => entry.film.key)).toEqual(['x']);
    // 5 stars is 10, above the lone existing film at the band midpoint.
    expect(keysOf(review.list)).toEqual(['divider:loved', 'A', 'X', 'divider:liked', 'divider:fine', 'divider:disliked']);
    const existing = review.list.find((entry) => entry.key === 'X');
    expect(existing?.kind === 'film' && existing.row).toMatchObject({ kind: 'existing', title: 'Ranked X', rating: null });
  });

  it('keeps the first of two file rows that resolve to one catalog film', () => {
    const review = buildReview(
      [film('a', 'Alpha', 5), film('a2', 'Alpha again', 3)],
      [match('a', 'A'), match('a2', 'A')],
      EMPTY_MOVIE_TIERS,
    );
    expect(review.rated.map((entry) => entry.film.key)).toEqual(['a']);
    expect(review.skipped.map((entry) => entry.film.key)).toEqual(['a2']);
    expect(keysOf(review.list).filter((key) => key === 'A')).toHaveLength(1);
  });
});

describe('placedTiers and rowFacts', () => {
  const list: ReviewListItem[] = [
    { kind: 'divider', key: 'divider:loved', tier: 'loved' },
    { kind: 'film', key: 'A', row: { mediaItemId: 'A', kind: 'imported', title: 'A', year: null, candidates: [], rating: 5, fileTitle: null } },
    { kind: 'divider', key: 'divider:liked', tier: 'liked' },
    { kind: 'divider', key: 'divider:fine', tier: 'fine' },
    { kind: 'film', key: 'B', row: { mediaItemId: 'B', kind: 'imported', title: 'B', year: null, candidates: [], rating: 2, fileTitle: null } },
    { kind: 'film', key: 'C', row: { mediaItemId: 'C', kind: 'existing', title: 'C', year: null, candidates: [], rating: null, fileTitle: null } },
    { kind: 'divider', key: 'divider:disliked', tier: 'disliked' },
  ];

  it('reads each film\'s tier off the divider above it', () => {
    expect(placedTiers(list)).toEqual({ loved: ['A'], liked: [], fine: ['B', 'C'], disliked: [] });
  });

  it('numbers ranks across tiers and scores within the tier as it stands', () => {
    const facts = rowFacts(list);
    expect(facts.get('A')).toEqual({ tier: 'loved', position: 0, rank: 1, score: 9.3 });
    expect(facts.get('B')).toEqual({ tier: 'fine', position: 0, rank: 2, score: 6.4 });
    expect(facts.get('C')).toEqual({ tier: 'fine', position: 1, rank: 3, score: 4 });
  });

  it('follows a drag across a divider', () => {
    // B dragged above the Fine divider lands in Liked.
    const dragged = [list[0]!, list[1]!, list[2]!, list[4]!, list[3]!, list[5]!, list[6]!];
    expect(placedTiers(dragged)).toEqual({ loved: ['A'], liked: ['B'], fine: ['C'], disliked: [] });
  });
});

describe('applyArgs', () => {
  const review = buildReview(
    [film('a', 'Alpha', 5, { watchedDates: ['2024-02-02'], rewatches: 1 }), film('c', 'Gamma', null), film('d', 'Delta', 3), film('x', 'Already', 1)],
    [match('a', 'A'), match('c', 'C'), match('d', null), match('x', 'X')],
    { ...EMPTY_MOVIE_TIERS, liked: [tierRow('X', 0)] },
  );

  it('by default marks the rated films watched and sends no order: nothing is ranked (rule 35)', () => {
    const args = applyArgs(review, review.list, ['ratings.csv']);

    expect(args.tiers).toBeNull();
    expect(args.moved).toEqual([]);
    expect(args.films.map((entry) => [entry.title, entry.outcome])).toEqual([
      ['Alpha', 'watched'],
      ['Gamma', 'watched'],
      ['Delta', 'unmatched'],
      ['Already', 'skipped'],
    ]);
  });

  it('with Rank from my stars, names every film with its outcome, the order as dragged, and the dragged film', () => {
    // The user drags Alpha down into Liked, below X.
    const dragged: ReviewListItem[] = review.list.filter((entry) => entry.key !== 'A');
    const fineDivider = dragged.findIndex((entry) => entry.key === 'divider:fine');
    dragged.splice(fineDivider, 0, review.list.find((entry) => entry.key === 'A')!);

    // A key that is not an imported film is dropped from moved.
    const args = applyArgs(review, dragged, ['ratings.csv'], { rank: true, moved: new Set(['A', 'X']) });

    expect(args.fileNames).toEqual(['ratings.csv']);
    expect(args.tiers).toEqual({ loved: [], liked: ['X', 'A'], fine: [], disliked: [] });
    expect(args.moved).toEqual(['A']);
    expect(args.films).toEqual([
      { letterboxdUri: 'https://boxd.it/a', title: 'Alpha', year: 2020, rating: 5, watchedDates: ['2024-02-02'], rewatches: 1, mediaItemId: 'A', outcome: 'ranked' },
      { letterboxdUri: 'https://boxd.it/c', title: 'Gamma', year: 2020, rating: null, watchedDates: [], rewatches: 0, mediaItemId: 'C', outcome: 'watched' },
      { letterboxdUri: 'https://boxd.it/d', title: 'Delta', year: 2020, rating: 3, watchedDates: [], rewatches: 0, mediaItemId: null, outcome: 'unmatched' },
      { letterboxdUri: 'https://boxd.it/x', title: 'Already', year: 2020, rating: 1, watchedDates: [], rewatches: 0, mediaItemId: 'X', outcome: 'skipped' },
    ]);
  });
});

describe('droppedKey and moveInList', () => {
  const list: ReviewListItem[] = [
    { kind: 'divider', key: 'divider:loved', tier: 'loved' },
    { kind: 'film', key: 'A', row: { mediaItemId: 'A', kind: 'imported', title: 'A', year: null, candidates: [], rating: 5, fileTitle: null } },
    { kind: 'divider', key: 'divider:liked', tier: 'liked' },
    { kind: 'film', key: 'B', row: { mediaItemId: 'B', kind: 'imported', title: 'B', year: null, candidates: [], rating: 4, fileTitle: null } },
  ];

  it('names the film a drop moved, never a divider', () => {
    expect(droppedKey(list, 1)).toBe('A');
    expect(droppedKey(list, 2)).toBeNull();
    expect(droppedKey(list, 9)).toBeNull();
  });

  it('steps a film across a tier line, and never above the first divider', () => {
    expect(placedTiers(moveInList(list, 'B', -1))).toEqual({ loved: ['A', 'B'], liked: [], fine: [], disliked: [] });
    expect(placedTiers(moveInList(list, 'A', 1))).toEqual({ loved: [], liked: ['A', 'B'], fine: [], disliked: [] });
    expect(moveInList(list, 'A', -1)).toEqual(list);
    expect(moveInList(list, 'B', 1)).toEqual(list);
  });
});

describe('reviewHeadline and diaryDates', () => {
  const review = buildReview(
    [film('a', 'Alpha', 5, { watchedDates: ['2024-01-01', '2024-02-01'] }), film('c', 'Gamma', null, { watchedDates: ['2023-05-05'] }), film('d', 'Delta', 3)],
    [match('a', 'A'), match('c', 'C'), match('d', null)],
    EMPTY_MOVIE_TIERS,
  );

  it('counts what will happen for the choice, leaving out empty buckets', () => {
    expect(reviewHeadline(review)).toBe('2 films to mark watched · 1 not found');
    expect(reviewHeadline(review, true)).toBe('1 film to rank · 1 watched, unrated · 1 not found');

    const only = buildReview([film('a', 'Alpha', 5), film('b', 'Beta', 4)], [match('a', 'A'), match('b', 'B')], EMPTY_MOVIE_TIERS);
    expect(reviewHeadline(only, true)).toBe('2 films to rank');
  });

  it('counts the diary dates of the films that will be written, not of the unmatched', () => {
    expect(diaryDates(review)).toBe(3);
  });
});
