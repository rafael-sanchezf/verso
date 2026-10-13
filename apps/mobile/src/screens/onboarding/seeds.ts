/**
 * "Three games you love": the list the search fills (specs/onboarding.md,
 * "Three games you love"). At most three, each game once, in the order added;
 * "Rank these" is live from two.
 *
 * No React and no `react-native` import (`test/onboarding-seeds.test.ts`).
 */

import type { OnboardingGameRow } from '@verso/api';

import type { TranslationKey } from './sentence';

export const SEED_COUNT = 3;
export const SEEDS_TO_RANK = 2;

/** What each empty slot says, by position, as dictionary keys. The frame draws the third. */
export const EMPTY_SLOT_LABELS: readonly TranslationKey[] = [
  'onboarding.seeds.slots.first',
  'onboarding.seeds.slots.second',
  'onboarding.seeds.slots.third',
];

/** Add a seed: ignored when the game is already there or the three are full. */
export function addSeed(seeds: readonly OnboardingGameRow[], row: OnboardingGameRow): OnboardingGameRow[] {
  if (seeds.length >= SEED_COUNT) return [...seeds];
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

/** Whether a result's plus can still add: the slots are not full and it is not in them. */
export function canAddSeed(seeds: readonly OnboardingGameRow[], mediaItemId: string): boolean {
  return seeds.length < SEED_COUNT && !seeds.some((seed) => seed.mediaItemId === mediaItemId);
}

/** The labels (dictionary keys) of the empty slots under the filled ones. */
export function emptySlots(seeds: readonly OnboardingGameRow[]): TranslationKey[] {
  return EMPTY_SLOT_LABELS.slice(Math.min(seeds.length, SEED_COUNT));
}
