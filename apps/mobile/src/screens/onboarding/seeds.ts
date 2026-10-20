/**
 * "Games you love" and "Films you love": the list the search fills
 * (specs/onboarding.md, "Three games you love"; movies-build.md, PR 6, item 3).
 *
 * Rafa's letters of 2026-10-14 (VER-228, for games too): the screen never
 * names a count, because a stated three reads as a cap and the point is to
 * rank as many as the person will. So the list takes any number, each title
 * once, in the order added; three is the floor the button waits for: "Rank",
 * gray and disabled until three are in, the brand green from the third. The
 * one empty slot under the picks says "Add a game" (or film) with none yet and
 * "Add another" after.
 *
 * No React and no `react-native` import (`test/onboarding-seeds.test.ts`).
 */

import type { OnboardingGameRow } from '@verso/api';

import type { LiveMedium } from '../../state/medium-model';
import type { TranslationKey } from './sentence';

/** How many the button waits for. Never printed. */
export const SEEDS_TO_RANK = 3;

/** Add a seed: ignored when the title is already there. No cap. */
export function addSeed(seeds: readonly OnboardingGameRow[], row: OnboardingGameRow): OnboardingGameRow[] {
  if (seeds.some((seed) => seed.mediaItemId === row.mediaItemId)) return [...seeds];
  return [...seeds, row];
}

/** Take one back out (a tap on its check). */
export function removeSeed(seeds: readonly OnboardingGameRow[], mediaItemId: string): OnboardingGameRow[] {
  return seeds.filter((seed) => seed.mediaItemId !== mediaItemId);
}

export function canRankSeeds(seeds: readonly OnboardingGameRow[]): boolean {
  return seeds.length >= SEEDS_TO_RANK;
}

/** Whether a result's plus can still add: it is not in the list yet. */
export function canAddSeed(seeds: readonly OnboardingGameRow[], mediaItemId: string): boolean {
  return !seeds.some((seed) => seed.mediaItemId === mediaItemId);
}

/** The button: "Rank", gray and disabled under three, the brand green from the third. */
export function seedsButton(seeds: readonly OnboardingGameRow[]): {
  label: TranslationKey;
  variant: 'primary' | 'secondary';
  disabled: boolean;
} {
  const ready = canRankSeeds(seeds);
  return { label: 'onboarding.seeds.rank', variant: ready ? 'primary' : 'secondary', disabled: !ready };
}

/** The empty slot's words: "Add a game" with none yet, "Add another" after. */
export function emptySlot(seeds: readonly OnboardingGameRow[], medium: LiveMedium): TranslationKey {
  if (medium === 'movie') return seeds.length === 0 ? 'onboarding.seeds.movie.first' : 'onboarding.seeds.movie.another';
  return seeds.length === 0 ? 'onboarding.seeds.game.first' : 'onboarding.seeds.game.another';
}

/** The words that differ by medium, as dictionary keys. */
export interface SeedsWords {
  title: TranslationKey;
  searchPlaceholder: TranslationKey;
  noMatch: TranslationKey;
  yourPicks: TranslationKey;
  footnote: TranslationKey;
}

export const SEEDS_WORDS: Readonly<Record<LiveMedium, SeedsWords>> = {
  game: {
    title: 'onboarding.seeds.game.title',
    searchPlaceholder: 'onboarding.seeds.game.searchPlaceholder',
    noMatch: 'onboarding.seeds.game.noMatch',
    yourPicks: 'onboarding.seeds.game.yourPicks',
    footnote: 'onboarding.seeds.game.footnote',
  },
  movie: {
    title: 'onboarding.seeds.movie.title',
    searchPlaceholder: 'onboarding.seeds.movie.searchPlaceholder',
    noMatch: 'onboarding.seeds.movie.noMatch',
    yourPicks: 'onboarding.seeds.movie.yourPicks',
    footnote: 'onboarding.seeds.movie.footnote',
  },
};

/** The route's `?medium=` as a medium: films only when it says so. */
export function mediumParam(value: string | string[] | undefined): LiveMedium {
  return value === 'movie' ? 'movie' : 'game';
}
