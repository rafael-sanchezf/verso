import { scoreForPosition } from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_TIERS,
  globalRank,
  tierSizes,
  toRankedList,
  type RankableRow,
  type TierRows,
} from '../src/screens/profile/ranking-math';

describe('tierSizes', () => {
  it('counts how many rows are in each tier', () => {
    const tiers: TierRows<{ title: string }> = {
      loved: [{ title: 'a' }, { title: 'b' }],
      liked: [],
      fine: [{ title: 'c' }],
      disliked: [],
    };
    expect(tierSizes(tiers)).toEqual({ loved: 2, liked: 0, fine: 1, disliked: 0 });
  });

  it('is all zeros for the empty tiers', () => {
    expect(tierSizes(EMPTY_TIERS)).toEqual({ loved: 0, liked: 0, fine: 0, disliked: 0 });
  });
});

describe('globalRank', () => {
  it('is 1 for the best item in the best tier', () => {
    const sizes = { loved: 3, liked: 5, fine: 2, disliked: 1 };
    expect(globalRank(sizes, { tier: 'loved', position: 0 })).toBe(1);
  });

  it('counts every better tier before adding the position within its own', () => {
    const sizes = { loved: 3, liked: 5, fine: 2, disliked: 1 };
    // 3 loved games sit above the first liked game.
    expect(globalRank(sizes, { tier: 'liked', position: 0 })).toBe(4);
    // 3 loved + 5 liked sit above the third fine game (position 2).
    expect(globalRank(sizes, { tier: 'fine', position: 2 })).toBe(11);
  });

  it('reaches the last item in the worst tier', () => {
    const sizes = { loved: 3, liked: 5, fine: 2, disliked: 1 };
    expect(globalRank(sizes, { tier: 'disliked', position: 0 })).toBe(11);
  });

  it('ignores tiers that come after the placement', () => {
    // A huge disliked tier must never inflate a loved game's rank.
    const sizes = { loved: 2, liked: 0, fine: 0, disliked: 500 };
    expect(globalRank(sizes, { tier: 'loved', position: 1 })).toBe(2);
  });
});

describe('toRankedList', () => {
  const tiers: TierRows<RankableRow> = {
    loved: [
      { title: 'Hades', year: 2020 },
      { title: 'Silksong', year: 2026 },
    ],
    liked: [{ title: 'Celeste', year: 2018 }],
    fine: [],
    disliked: [],
  };

  it('ranks best tier first, then by position within each tier', () => {
    const ranked = toRankedList(tiers);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(ranked.map((item) => item.title)).toEqual(['Hades', 'Silksong', 'Celeste']);
    expect(ranked.map((item) => item.tier)).toEqual(['loved', 'loved', 'liked']);
  });

  it('scores each item the same way scoreForPosition would, given the real tier sizes', () => {
    const ranked = toRankedList(tiers);
    expect(ranked[0]!.score).toBe(scoreForPosition('loved', 0, 2));
    expect(ranked[1]!.score).toBe(scoreForPosition('loved', 1, 2));
    expect(ranked[2]!.score).toBe(scoreForPosition('liked', 0, 1));
  });

  it('is empty for the empty tiers', () => {
    expect(toRankedList(EMPTY_TIERS)).toEqual([]);
  });

  it('skips an empty tier without leaving a gap in the rank', () => {
    const withGap: TierRows<RankableRow> = {
      loved: [{ title: 'Hades', year: 2020 }],
      liked: [],
      fine: [{ title: 'Undertale', year: 2015 }],
      disliked: [],
    };
    const ranked = toRankedList(withGap);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2]);
  });
});
