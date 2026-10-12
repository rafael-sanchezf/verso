/**
 * The arithmetic behind Profile's Recent rows and the top-ten share/export:
 * how many items sit in each tier, and the global rank and score that follow
 * from a tier and a position within it.
 *
 * Pure and free of React Native and network imports, so it is unit tested
 * directly. `@verso/core` is safe to import here: it is the ranking engine,
 * plain TypeScript with no React Native dependency of its own (see
 * packages/core/package.json).
 *
 * `TierRows` is the shape `['ranking']` holds in the query cache — four lists
 * keyed by tier, each in the tier's own best-first order — which this file
 * shares with the Ranking tab's `screens/ranking/model.ts` and
 * `use-ranking.ts` rather than a flat array of tagged rows. The two screens
 * read the same cache entry (README.md, "Data": "the four `tierList` calls
 * assembled best tier first"), so one shape is what keeps whichever of them
 * loads first from writing a cache the other cannot use.
 */

import { scoreForPosition, TIERS, type Tier } from '@verso/core';

/** The four `tierList` results, keyed by tier, each already in the tier's own best-first order. */
export type TierRows<T> = Readonly<Record<Tier, readonly T[]>>;

/** Nothing ranked yet. The shape a failed or not-yet-loaded read falls back to. */
export const EMPTY_TIERS: TierRows<never> = { loved: [], liked: [], fine: [], disliked: [] };

/** How many ranked items are in each tier. */
export function tierSizes<T>(tiers: TierRows<T>): Record<Tier, number> {
  return {
    loved: tiers.loved.length,
    liked: tiers.liked.length,
    fine: tiers.fine.length,
    disliked: tiers.disliked.length,
  };
}

/**
 * Global rank = items in better tiers + position within the tier + 1
 * (docs/design/specs/README.md, "Global rank"). `position` is 0-based, as
 * both `tier_list` and `recentRankings`' `placement` return it.
 *
 * `sizes` should come from the same `['ranking']` query the Ranking tab
 * reads (profile.md, "Data"), not from a per-row count of just the one tier a
 * game sits in, so a Recent row's rank agrees with where the game actually
 * sits in the Ranking list.
 */
export function globalRank(
  sizes: Readonly<Record<Tier, number>>,
  placement: { tier: Tier; position: number },
): number {
  let better = 0;
  for (const tier of TIERS) {
    if (tier === placement.tier) break;
    better += sizes[tier];
  }
  return better + placement.position + 1;
}

/** The minimum a row needs to be ranked and scored. */
export interface RankableRow {
  title: string;
  year: number | null;
}

/** One item of the assembled list: its global rank and its derived 0-10 score. */
export interface RankedItem {
  rank: number;
  title: string;
  year: number | null;
  tier: Tier;
  score: number;
}

/**
 * Every tier flattened into one best-tier-first list, with the global rank
 * and the derived score filled in.
 *
 * The position a row scores at is its index within its tier's array, not a
 * `position` column on the row: the Ranking tab's own `assembleRanking` uses
 * the same rule, for the same reason (its doc comment explains why — an
 * optimistic reorder can leave the column briefly stale while the array is
 * already right).
 */
export function toRankedList<T extends RankableRow>(tiers: TierRows<T>): RankedItem[] {
  const sizes = tierSizes(tiers);
  const items: RankedItem[] = [];
  let rank = 0;

  for (const tier of TIERS) {
    for (const [position, row] of tiers[tier].entries()) {
      rank += 1;
      items.push({
        rank,
        title: row.title,
        year: row.year,
        tier,
        score: scoreForPosition(tier, position, sizes[tier]),
      });
    }
  }

  return items;
}
