import type { OnboardingGameRow } from '@verso/api';
import { describe, expect, it } from 'vitest';

import {
  addSeed,
  canAddSeed,
  canRankSeeds,
  emptySlots,
  removeSeed,
} from '../src/screens/onboarding/seeds';
import { translate } from '../src/lib/i18n/dictionary';

/** The empty slots' labels as the screen draws them, in English. */
const slots = (seeds: OnboardingGameRow[]) => emptySlots(seeds).map((key) => translate('en', key));

function game(id: string): OnboardingGameRow {
  return {
    mediaItemId: id,
    title: id,
    year: null,
    coverImageId: null,
    externalIds: null,
    genres: [],
    platforms: [],
  };
}

describe('the seeds', () => {
  it('fill in the order added, each game once', () => {
    let seeds = addSeed([], game('a'));
    seeds = addSeed(seeds, game('b'));
    seeds = addSeed(seeds, game('a'));
    expect(seeds.map((s) => s.mediaItemId)).toEqual(['a', 'b']);
  });

  it('stop at three', () => {
    const three = [game('a'), game('b'), game('c')];
    expect(addSeed(three, game('d')).map((s) => s.mediaItemId)).toEqual(['a', 'b', 'c']);
    expect(canAddSeed(three, 'd')).toBe(false);
    expect(canAddSeed([game('a')], 'a')).toBe(false);
    expect(canAddSeed([game('a')], 'b')).toBe(true);
  });

  it('come back out with a tap on their check', () => {
    expect(removeSeed([game('a'), game('b')], 'a').map((s) => s.mediaItemId)).toEqual(['b']);
  });

  it('let "Rank these" through from two', () => {
    expect(canRankSeeds([])).toBe(false);
    expect(canRankSeeds([game('a')])).toBe(false);
    expect(canRankSeeds([game('a'), game('b')])).toBe(true);
    expect(canRankSeeds([game('a'), game('b'), game('c')])).toBe(true);
  });

  it('label the empty slots after the filled ones', () => {
    expect(slots([])).toEqual(['Add a first', 'Add a second', 'Add a third']);
    expect(slots([game('a'), game('b')])).toEqual(['Add a third']);
    expect(slots([game('a'), game('b'), game('c')])).toEqual([]);
  });
});
