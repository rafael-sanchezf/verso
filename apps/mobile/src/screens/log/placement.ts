/**
 * Where a game sits once it lands: the global rank, the score, and the handful
 * of neighbours the confirm step shows it between.
 *
 * Rank numbers are global across tiers, as the Ranking list numbers them
 * (specs/README.md, "Global rank"): the best game in Loved is 1 and the count
 * runs on through Liked, Fine and Didn't like. So a position inside one tier
 * only becomes a rank once you know how many games sit in the tiers above it,
 * which is the `above` argument everywhere in this file.
 *
 * Pure, and deliberately ignorant of titles and covers: it works on ids and
 * positions so it can be tested without a catalog (see
 * `apps/mobile/test/log-placement.test.ts`), and the screen joins the rows back
 * to the games it already loaded.
 */

import { scoreForPosition, TIERS, type Tier } from '@verso/core';

/** How many rows the confirm step shows either side of the new game. */
export const NEIGHBOR_RADIUS = 2;

export interface NeighborRow {
  /** `media_items.id`, which is what a `RankableItem.id` is in this flow. */
  readonly id: string;
  /** Position inside the tier, 0 being best. */
  readonly position: number;
  /** The number the Ranking list would print beside it. */
  readonly globalRank: number;
  /** From `scoreForPosition` over the provisional tier, so it is what the user will see after Done. */
  readonly score: number;
  /** The game being placed: the highlighted row. */
  readonly isNew: boolean;
}

/**
 * The rank the Ranking list prints: everything in better tiers, then the
 * position within this one, counting from 1.
 */
export function globalRank(above: number, position: number): number {
  return above + position + 1;
}

/**
 * The five rows around the new game: two above, two below, fewer at the ends.
 *
 * `ids` is the tier's order with the new game already in it
 * (`provisionalList`), so the scores are the ones the whole tier will have
 * after the write — a game pushed down by the insertion shows its new score
 * here, not its old one.
 */
export function neighborRows(args: {
  tier: Tier;
  ids: readonly string[];
  /** Index of the new game inside `ids`. */
  newIndex: number;
  /** Total games in the tiers above this one. */
  above: number;
  radius?: number;
}): NeighborRow[] {
  const { tier, ids, newIndex, above, radius = NEIGHBOR_RADIUS } = args;
  const first = Math.max(0, newIndex - radius);
  const last = Math.min(ids.length - 1, newIndex + radius);

  const rows: NeighborRow[] = [];
  for (let position = first; position <= last; position++) {
    const id = ids[position];
    if (id === undefined) continue;
    rows.push({
      id,
      position,
      globalRank: globalRank(above, position),
      score: scoreForPosition(tier, position, ids.length),
      isNew: position === newIndex,
    });
  }
  return rows;
}

/**
 * Games sitting in the tiers better than this one, from each tier's length.
 *
 * Takes the sizes it has rather than requiring all four: the flow loads the
 * other tiers alongside the comparisons, and a rank that is still loading is
 * better shown as "the score alone" (specs/log-flow.md, step 2) than as a
 * number that is wrong until the last read lands. `null` means "not known
 * yet"; a tier that is genuinely empty is 0.
 */
export function gamesAbove(tier: Tier, sizes: Partial<Record<Tier, number | null>>): number | null {
  let total = 0;
  // `TIERS` is best first, which is the order the ranks run in.
  for (const better of TIERS) {
    if (better === tier) return total;
    const size = sizes[better];
    if (size === null || size === undefined) return null;
    total += size;
  }
  return total;
}
