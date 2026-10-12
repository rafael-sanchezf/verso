/**
 * The tier pass: before any comparison, one screen per game that arrived
 * without a tier (the played-not-ranked drain and Search's add-many), the log
 * flow's four tier rows under the game's cover, "{i} of {n}" in the header; a
 * tap assigns the tier and moves on (specs/batch-session.md, "Untiered items").
 *
 * Comparisons only ever happen inside a tier, so a game cannot be placed until
 * this pass has given it one. Games that arrived with a tier skip it.
 *
 * Pure and free of React, so the order and the bookkeeping are tested in node
 * (`apps/mobile/test/session-tier-pass.test.ts`).
 */

import type { Tier } from '@verso/core';

export interface TierPass {
  /** The games that need a tier, in the order they arrived. */
  readonly ids: readonly string[];
  /** The tier given to each, so far. */
  readonly tiers: Readonly<Record<string, Tier>>;
  /** Which of `ids` is on screen; `ids.length` once the pass is over. */
  readonly index: number;
}

/** The pass over every item with no tier, in arrival order. Empty when all have one. */
export function startTierPass(items: readonly { mediaItemId: string; tier: Tier | null }[]): TierPass {
  return { ids: items.filter((item) => item.tier === null).map((item) => item.mediaItemId), tiers: {}, index: 0 };
}

/** The game on screen, or null when the pass is over. */
export function passCurrent(pass: TierPass): string | null {
  return pass.ids[pass.index] ?? null;
}

export function passDone(pass: TierPass): boolean {
  return pass.index >= pass.ids.length;
}

/** A tap on a tier row: that game gets the tier, and the next one is on screen. */
export function assignPassTier(pass: TierPass, tier: Tier): TierPass {
  const id = passCurrent(pass);
  if (id === null) return pass;
  return { ...pass, tiers: { ...pass.tiers, [id]: tier }, index: pass.index + 1 };
}

/**
 * The `x` during the pass: stop asking. The games already given a tier go on to
 * be placed; the rest keep no tier, are left out of this session, and stay in
 * the drain for next time (nothing about them was written).
 */
export function stopPass(pass: TierPass): TierPass {
  return { ...pass, index: pass.ids.length };
}

/** "3 of 8": the game on screen, counting from 1, over the games the pass asks about. */
export function passLabel(pass: TierPass): string {
  return `${Math.min(pass.index + 1, pass.ids.length)} of ${pass.ids.length}`;
}

/** How far through the pass the bar is, 0 to 1. */
export function passFill(pass: TierPass): number {
  return pass.ids.length === 0 ? 1 : Math.min(pass.index / pass.ids.length, 1);
}

/**
 * Every item with its tier: the one it arrived with, or the one the pass gave
 * it. Items the pass never reached (the user stopped) are left out.
 */
export function withPassTiers<T extends { mediaItemId: string; tier: Tier | null }>(
  items: readonly T[],
  pass: TierPass,
): (T & { tier: Tier })[] {
  const out: (T & { tier: Tier })[] = [];
  for (const item of items) {
    const tier = item.tier ?? pass.tiers[item.mediaItemId] ?? null;
    if (tier !== null) out.push({ ...item, tier });
  }
  return out;
}
