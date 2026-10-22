/**
 * The deck row's slider as numbers: four hard stops, worst on the left, and
 * nothing in between (specs/onboarding.md, "The deck page", `TierSlider`).
 *
 * The value is a tier or null, never a fraction. Positions are measured in
 * stop units, 0 at "Didn't like" and 3 at "Loved", so a finger halfway between
 * two stops is 1.5 and the release rounds it. The geometry is the track's
 * width less an inset of the thumb's radius at each end, so the thumb's centre
 * can sit on the first and last stops without leaving the track.
 *
 * The functions a gesture calls on the UI thread carry the `'worklet'`
 * directive; in Node (the Vitest run) the directive is an inert string.
 *
 * No React and no `react-native` import (`test/onboarding-tier-scale.test.ts`).
 */

import type { Tier } from '@verso/core';

import type { TranslationKey } from './sentence';

/** The slider's value: a tier, or null while the row is untouched ("not played"). */
export type TierValue = Tier | null;

/** Left to right: the order of the stops on the track, worst first. */
export const TIER_STOPS: readonly Tier[] = ['disliked', 'fine', 'liked', 'loved'];

/** The last stop's index, and the top of the position scale. */
export const LAST_STOP = TIER_STOPS.length - 1;

/** The word after the track and over each stop on the axis, as dictionary keys. */
export const TIER_WORDS: Readonly<Record<Tier, TranslationKey>> = {
  disliked: 'onboarding.slider.tiers.disliked',
  fine: 'onboarding.slider.tiers.fine',
  liked: 'onboarding.slider.tiers.liked',
  loved: 'onboarding.slider.tiers.loved',
};

/** What the word says while the row is untouched, as a dictionary key. */
export const UNTOUCHED_WORD: TranslationKey = 'onboarding.slider.slide';

/**
 * The glyph the thumb carries at each stop. One map, because the fidelity round
 * may replace them (onboarding.md).
 */
export const TIER_THUMB_ICONS = {
  disliked: 'thumbs-down',
  fine: 'meh',
  liked: 'thumbs-up',
  loved: 'heart',
} as const satisfies Record<Tier, string>;

/** The thumb's diameter; half of it is the track's inset at each end. */
export const THUMB_SIZE = 24;
export const TRACK_INSET = THUMB_SIZE / 2;

/**
 * Each axis word's box, centered over its stop. An inner word has neighbours
 * on both sides, so its box stays about one stop's spacing wide. An end word
 * has open space on its outer side, so its box is wider: the Spanish "No me
 * gustó" is 66 wide at 11 regular Inter and truncated in 64 (VER-244). Widening
 * a box around the same centre leaves a word that already fit where it was, so
 * the English axis does not move. At 88 the end words still clear their
 * neighbours by 10 or more at 402 wide and by about 3 at 375.
 */
export const AXIS_WORD = 64;
export const AXIS_END_WORD = 88;

/** The width of the axis word's box over a stop. */
export function axisWordWidth(index: number): number {
  return index === 0 || index === LAST_STOP ? AXIS_END_WORD : AXIS_WORD;
}

/** Where a value sits on the track, or null for an untouched row. */
export function stopIndex(value: TierValue): number | null {
  return value === null ? null : TIER_STOPS.indexOf(value);
}

/** The tier at a stop. Out-of-range indexes clamp to the nearest end. */
export function tierAtStop(index: number): Tier {
  const clamped = Math.min(LAST_STOP, Math.max(0, Math.round(index)));
  return TIER_STOPS[clamped]!;
}

/** The word after the track for a value, as a dictionary key. */
export function sliderWord(value: TierValue): TranslationKey {
  return value === null ? UNTOUCHED_WORD : TIER_WORDS[value];
}

/** The span the thumb's centre travels: the width less the inset at both ends. */
export function usableWidth(width: number): number {
  'worklet';
  return Math.max(0, width - 2 * TRACK_INSET);
}

/**
 * A finger's x on the track, in stop units, clamped to the track. A track not
 * measured yet (width at or under the two insets) reads as the first stop.
 */
export function positionAtX(x: number, width: number): number {
  'worklet';
  const span = usableWidth(width);
  if (span <= 0) return 0;
  const position = ((x - TRACK_INSET) / span) * LAST_STOP;
  return Math.min(LAST_STOP, Math.max(0, position));
}

/** The nearest stop to a position: what a release or a tap snaps to. */
export function nearestStop(position: number): number {
  'worklet';
  if (!Number.isFinite(position)) return 0;
  return Math.min(LAST_STOP, Math.max(0, Math.round(position)));
}

/** The x of a position's centre on a track of this width: the inverse of `positionAtX`. */
export function xAtPosition(position: number, width: number): number {
  'worklet';
  return TRACK_INSET + (position / LAST_STOP) * usableWidth(width);
}

/**
 * One accessibility step. Increment from an untouched row lands on the first
 * stop, the same place a touch at the left end would; decrement there does
 * nothing, because a touch cannot unmark a row either. Both ends clamp.
 */
export function stepValue(value: TierValue, direction: 'increment' | 'decrement'): TierValue {
  const index = stopIndex(value);
  if (index === null) return direction === 'increment' ? TIER_STOPS[0]! : null;
  return tierAtStop(direction === 'increment' ? index + 1 : index - 1);
}
