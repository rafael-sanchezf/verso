/**
 * The Media screen's tiles and what Continue does with them
 * (specs/onboarding.md, "Media"; decision 25).
 *
 * Games and Movies are live and toggle. TV and Books are held: a tap records
 * interest once (`media_interest`) and turns the tile's bell line to "We'll
 * tell you", where it stays; a second tap does nothing, and no event is ever
 * removed. Continue is live once a live tile is picked; there is no skip.
 *
 * No React and no `react-native` import (`test/onboarding-media-picks.test.ts`).
 */

import type { Medium } from '@verso/core';

import type { TranslationKey } from './sentence';

/** The media a user can pick now. */
export type LiveMedium = Extract<Medium, 'game' | 'movie'>;

/** The held media, by the name `media_interest` records (events.ts). */
export type HeldMedium = 'tv' | 'books';

export interface MediaTile {
  key: LiveMedium | HeldMedium;
  /** The tile's word, as a dictionary key; the screen says it. */
  name: TranslationKey;
  icon: 'gamepad-2' | 'film' | 'tv' | 'book-open';
  live: boolean;
}

/** The 2 by 2 grid, in reading order. */
export const MEDIA_TILES: readonly MediaTile[] = [
  { key: 'game', name: 'onboarding.media.tiles.game', icon: 'gamepad-2', live: true },
  { key: 'movie', name: 'onboarding.media.tiles.movie', icon: 'film', live: true },
  { key: 'tv', name: 'onboarding.media.tiles.tv', icon: 'tv', live: false },
  { key: 'books', name: 'onboarding.media.tiles.books', icon: 'book-open', live: false },
];

/** The held tile's line before and after the tap, as dictionary keys. */
export const NOTIFY_LINE: TranslationKey = 'onboarding.media.notify';
export const NOTIFIED_LINE: TranslationKey = 'onboarding.media.notified';

/** A tap on a live tile. */
export function toggleMedium(picked: ReadonlySet<LiveMedium>, medium: LiveMedium): Set<LiveMedium> {
  const next = new Set(picked);
  if (next.has(medium)) next.delete(medium);
  else next.add(medium);
  return next;
}

/**
 * A tap on a held tile: whether to log `media_interest` now, and the set of
 * held media already asked for. Only the first tap logs.
 */
export function tapHeld(
  notified: ReadonlySet<HeldMedium>,
  medium: HeldMedium,
): { notified: Set<HeldMedium>; log: boolean } {
  if (notified.has(medium)) return { notified: new Set(notified), log: false };
  const next = new Set(notified);
  next.add(medium);
  return { notified: next, log: true };
}

/** Continue is live once a live tile is picked. */
export function canContinue(picked: ReadonlySet<LiveMedium>): boolean {
  return picked.size > 0;
}

/** The media to store, in the grid's order. */
export function mediaToStore(picked: ReadonlySet<LiveMedium>): LiveMedium[] {
  return MEDIA_TILES.flatMap((tile) =>
    tile.live && picked.has(tile.key as LiveMedium) ? [tile.key as LiveMedium] : [],
  );
}

/**
 * Where Continue goes: the platforms step when games is picked; the tabs for a
 * movies-only user, until the movies onboarding lands (onboarding.md).
 */
export function afterMedia(picked: ReadonlySet<LiveMedium>): 'platforms' | 'tabs' {
  return picked.has('game') ? 'platforms' : 'tabs';
}
