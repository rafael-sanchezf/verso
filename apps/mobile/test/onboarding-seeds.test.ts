import type { OnboardingGameRow } from '@verso/api';
import { describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import {
  addSeed,
  canAddSeed,
  canRankSeeds,
  emptySlot,
  mediumParam,
  removeSeed,
  SEEDS_WORDS,
  seedsButton,
} from '../src/screens/onboarding/seeds';

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

const many = (count: number) => Array.from({ length: count }, (_, index) => game(String(index)));

describe('the seeds', () => {
  it('fill in the order added, each title once', () => {
    let seeds = addSeed([], game('a'));
    seeds = addSeed(seeds, game('b'));
    seeds = addSeed(seeds, game('a'));
    expect(seeds.map((s) => s.mediaItemId)).toEqual(['a', 'b']);
  });

  it('grow past three (Rafa, 2026-10-14: rank as many as the person will)', () => {
    const three = many(3);
    expect(addSeed(three, game('d')).map((s) => s.mediaItemId)).toEqual(['0', '1', '2', 'd']);
    expect(canAddSeed(three, 'd')).toBe(true);
    expect(canAddSeed([game('a')], 'a')).toBe(false);
    expect(addSeed(many(12), game('x'))).toHaveLength(13);
  });

  it('come back out with a tap on their check', () => {
    expect(removeSeed([game('a'), game('b')], 'a').map((s) => s.mediaItemId)).toEqual(['b']);
  });

  it('let "Rank" through from three, never from two', () => {
    expect(canRankSeeds([])).toBe(false);
    expect(canRankSeeds(many(2))).toBe(false);
    expect(canRankSeeds(many(3))).toBe(true);
    expect(canRankSeeds(many(7))).toBe(true);
  });
});

describe('the button', () => {
  it('reads "Rank", gray and disabled until three, the brand green from the third', () => {
    for (const count of [0, 1, 2]) {
      expect(seedsButton(many(count))).toEqual({ label: 'onboarding.seeds.rank', variant: 'secondary', disabled: true });
    }
    for (const count of [3, 4, 9]) {
      expect(seedsButton(many(count))).toEqual({ label: 'onboarding.seeds.rank', variant: 'primary', disabled: false });
    }
    expect(translate('en', seedsButton(many(3)).label)).toBe('Rank');
    expect(translate('es', seedsButton(many(3)).label)).toBe('Clasificar');
  });
});

describe('the copy', () => {
  it('names no count anywhere, in either medium or language', () => {
    const counts = /\b(three|3|third|tres|tercer[oa]?)\b/i;
    for (const medium of ['game', 'movie'] as const) {
      const keys = [
        ...Object.values(SEEDS_WORDS[medium]),
        emptySlot([], medium),
        emptySlot(many(2), medium),
        seedsButton(many(3)).label,
      ];
      for (const key of keys) {
        expect(translate('en', key)).not.toMatch(counts);
        expect(translate('es', key)).not.toMatch(counts);
      }
    }
  });

  it('titles the screen by what the person loves', () => {
    expect(translate('en', SEEDS_WORDS.game.title)).toBe('Games you love');
    expect(translate('en', SEEDS_WORDS.movie.title)).toBe('Films you love');
  });

  it('says add one with none yet and add another after, the slot never numbered', () => {
    expect(translate('en', emptySlot([], 'movie'))).toBe('Add a film');
    expect(translate('en', emptySlot(many(2), 'movie'))).toBe('Add another');
    expect(translate('en', emptySlot(many(5), 'movie'))).toBe('Add another');
    expect(translate('en', emptySlot([], 'game'))).toBe('Add a game');
    expect(translate('es', emptySlot(many(1), 'movie'))).toBe('Agrega otra');
    expect(translate('es', emptySlot(many(1), 'game'))).toBe('Agrega otro');
  });
});

describe('the medium param', () => {
  it('is films only when the route says movie', () => {
    expect(mediumParam('movie')).toBe('movie');
    expect(mediumParam(undefined)).toBe('game');
    expect(mediumParam('game')).toBe('game');
    expect(mediumParam(['movie'])).toBe('game');
  });
});
