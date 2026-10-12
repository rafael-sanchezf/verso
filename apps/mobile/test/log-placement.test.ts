/**
 * The confirm step's arithmetic: the global rank, and the slice of neighbours
 * the new game is shown between.
 */

import { scoreForPosition } from '@verso/core';
import { describe, expect, it } from 'vitest';

import { gamesAbove, globalRank, neighborRows } from '../src/screens/log/placement';

/** Nine ids, the new game already inserted at index 3. */
const IDS = ['a', 'b', 'c', 'new', 'd', 'e', 'f', 'g', 'h'];

describe('globalRank', () => {
  it('counts the better tiers first, then the position, from 1', () => {
    expect(globalRank(0, 0)).toBe(1);
    expect(globalRank(12, 0)).toBe(13);
    expect(globalRank(12, 3)).toBe(16);
  });
});

describe('gamesAbove', () => {
  const sizes = { loved: 4, liked: 7, fine: 2, disliked: 1 };

  it('is nothing above the best tier', () => {
    expect(gamesAbove('loved', sizes)).toBe(0);
  });

  it('adds up every tier better than this one', () => {
    expect(gamesAbove('liked', sizes)).toBe(4);
    expect(gamesAbove('fine', sizes)).toBe(11);
    expect(gamesAbove('disliked', sizes)).toBe(13);
  });

  it('knows nothing until every better tier has loaded', () => {
    expect(gamesAbove('fine', { loved: 4 })).toBeNull();
    expect(gamesAbove('fine', { loved: 4, liked: null })).toBeNull();
    // A tier that is genuinely empty is a number, not a gap.
    expect(gamesAbove('fine', { loved: 0, liked: 0 })).toBe(0);
  });

  it('does not wait on tiers below the one being ranked', () => {
    expect(gamesAbove('liked', { loved: 4 })).toBe(4);
  });
});

describe('neighborRows', () => {
  it('shows two rows either side of the new game', () => {
    const rows = neighborRows({ tier: 'loved', ids: IDS, newIndex: 3, above: 0 });

    expect(rows.map((row) => row.id)).toEqual(['b', 'c', 'new', 'd', 'e']);
    expect(rows.filter((row) => row.isNew).map((row) => row.id)).toEqual(['new']);
  });

  it('shows fewer at the top of the tier', () => {
    const ids = ['new', 'a', 'b', 'c', 'd'];
    const rows = neighborRows({ tier: 'loved', ids, newIndex: 0, above: 0 });

    expect(rows.map((row) => row.id)).toEqual(['new', 'a', 'b']);
    expect(rows[0]?.globalRank).toBe(1);
  });

  it('shows fewer at the bottom of the tier', () => {
    const ids = ['a', 'b', 'c', 'd', 'new'];
    const rows = neighborRows({ tier: 'loved', ids, newIndex: 4, above: 0 });

    expect(rows.map((row) => row.id)).toEqual(['c', 'd', 'new']);
  });

  it('numbers the rows globally, so a lower tier carries on from the ones above', () => {
    const rows = neighborRows({ tier: 'liked', ids: IDS, newIndex: 3, above: 10 });

    expect(rows.map((row) => row.globalRank)).toEqual([12, 13, 14, 15, 16]);
  });

  it('scores every row over the tier the write will produce', () => {
    const rows = neighborRows({ tier: 'loved', ids: IDS, newIndex: 3, above: 0 });

    for (const row of rows) {
      expect(row.score).toBe(scoreForPosition('loved', row.position, IDS.length));
    }
    // Best first, so the scores run downhill.
    expect(rows.map((row) => row.score)).toEqual([...rows.map((row) => row.score)].sort((a, b) => b - a));
  });

  it('is a single row when the tier was empty', () => {
    const rows = neighborRows({ tier: 'fine', ids: ['new'], newIndex: 0, above: 6 });

    expect(rows).toEqual([
      { id: 'new', position: 0, globalRank: 7, score: scoreForPosition('fine', 0, 1), isNew: true },
    ]);
  });
});
