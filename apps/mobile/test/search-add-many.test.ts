import type { OnboardingGameRow } from '@verso/api';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_ADD_MANY,
  addManyPill,
  addedChipLabel as addedChipPhrase,
  afterMarked,
  alreadyRankedLine as alreadyRankedPhrase,
  isAdded,
  rankAddedLabel as rankAddedPhrase,
} from '../src/screens/search/add-many';

import { english } from './english';

/** The words as Search says them in English (the module returns phrases). */
const addedChipLabel = (count: number) => english(addedChipPhrase(count));
const rankAddedLabel = (count: number) => english(rankAddedPhrase(count));
const alreadyRankedLine = (title: string) => english(alreadyRankedPhrase(title));

describe('addManyPill', () => {
  const today = '2026-09-23';

  it('offers the check circle for a game that is out, today included', () => {
    expect(addManyPill('2020-09-17', { today })).toBe('addmany');
    expect(addManyPill(today, { today })).toBe('addmany');
  });

  it('never marks a game that is not out played: the row keeps the add pill (phone feedback entry 10)', () => {
    expect(addManyPill('2026-09-24', { today })).toBe('add');
    expect(addManyPill('2028-12-31', { today })).toBe('add');
  });

  it('treats an undated game, and one whose date has not been read yet, as out', () => {
    expect(addManyPill(null, { today })).toBe('addmany');
    expect(addManyPill(undefined, { today })).toBe('addmany');
  });
});

function game(id: string): OnboardingGameRow {
  return {
    mediaItemId: id,
    title: `Game ${id}`,
    year: null,
    coverImageId: null,
    externalIds: null,
    genres: [],
    platforms: [],
  };
}

describe('the added list', () => {
  it('grows in the order tapped, each game once', () => {
    let state = afterMarked(EMPTY_ADD_MANY, game('a'), false);
    state = afterMarked(state, game('b'), false);
    state = afterMarked(state, game('a'), false);
    expect(state.added.map((row) => row.mediaItemId)).toEqual(['a', 'b']);
    expect(isAdded(state, 'b')).toBe(true);
    expect(isAdded(state, 'c')).toBe(false);
  });

  it('leaves out a game that was ranked already, and says so', () => {
    const state = afterMarked(EMPTY_ADD_MANY, game('a'), true);
    expect(state.added).toEqual([]);
    expect(state.alreadyRanked).toBe('Game a');
    expect(alreadyRankedLine('Game a')).toBe('Game a is already in your ranking.');
  });

  it('clears the notice with the next add', () => {
    const notice = afterMarked(EMPTY_ADD_MANY, game('a'), true);
    expect(afterMarked(notice, game('b'), false).alreadyRanked).toBeNull();
  });

  it('never mutates the state it was given', () => {
    afterMarked(EMPTY_ADD_MANY, game('a'), false);
    expect(EMPTY_ADD_MANY.added).toEqual([]);
  });
});

describe('the labels', () => {
  it('counts what was added', () => {
    expect(addedChipLabel(0)).toBe('0 added');
    expect(addedChipLabel(4)).toBe('4 added');
  });

  it('says how many the session will rank, in the singular for one', () => {
    expect(rankAddedLabel(1)).toBe('Rank 1 game');
    expect(rankAddedLabel(5)).toBe('Rank 5 games');
  });
});
