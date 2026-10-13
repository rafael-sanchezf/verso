/**
 * The reads behind the flow: the game being ranked, and the tiers it is ranked
 * against.
 *
 * Both go through the keys in `src/lib/query-keys.ts` so the rest of the app
 * sees the same cache — the game page behind this sheet is already holding
 * `['game', id]`, and `invalidateRanking` clears every `['tier', …]` after the
 * write.
 *
 * The four tiers are read one key each rather than assembled under
 * `['ranking']`. That started as a way of not colliding with the Ranking tab,
 * which was being built in parallel and got to choose that key's shape; it was
 * re-checked in Phase 3, once the shape was settled and documented, and it
 * stands on its own reason: this flow needs the chosen tier plus the sizes of
 * the ones above it, which is one read for Loved and four for Didn't like,
 * where `['ranking']` is always four. `['tier', tier]` is documented as "one
 * tier on its own, for the log flow's comparisons" (query-keys.ts), it is the
 * same `tier_list` read either way, and `invalidateRanking` clears both keys,
 * so the two caches cannot drift apart.
 */

import { useQueries, useQuery } from '@tanstack/react-query';
import { gamePage, tierList, type GamePage, type TierListRow } from '@verso/api';
import { TIERS, type Medium, type Tier } from '@verso/core';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/** The game being ranked. Shares `['game', id]` with the page behind the sheet. */
export function useGame(id: string) {
  return useQuery<GamePage | null>({
    queryKey: queryKeys.game(id),
    queryFn: () => gamePage(supabase, id),
    enabled: id.length > 0,
  });
}

export interface TierReads {
  /** The chosen tier's order, best first; undefined until it has loaded. */
  rows: TierListRow[] | undefined;
  /** The chosen tier's read failed. */
  error: Error | null;
  /** Sizes of every tier that has loaded, for the global rank. */
  sizes: Partial<Record<Tier, number | null>>;
  refetch: () => void;
}

/**
 * The chosen tier, and every tier better than it.
 *
 * The better tiers are only there to turn a position into a global rank, so
 * they are never waited on and never block a step: an unfinished or failed read
 * leaves that tier's size `null`, and `gamesAbove` answers null, which the
 * screen draws as the score without a rank (specs/log-flow.md, step 2).
 */
export function useTiers(chosen: Tier | null, medium: Medium = 'game'): TierReads {
  const needed = (tier: Tier) =>
    chosen !== null && TIERS.indexOf(tier) <= TIERS.indexOf(chosen);

  const results = useQueries({
    queries: TIERS.map((tier) => ({
      queryKey: queryKeys.tier(tier, medium),
      queryFn: () => tierList(supabase, medium, tier),
      enabled: needed(tier),
    })),
  });

  const sizes: Partial<Record<Tier, number | null>> = {};
  TIERS.forEach((tier, index) => {
    const result = results[index];
    sizes[tier] = result?.data ? result.data.length : null;
  });

  const chosenResult = chosen === null ? undefined : results[TIERS.indexOf(chosen)];

  return {
    rows: chosenResult?.data,
    error: (chosenResult?.error as Error | null) ?? null,
    sizes,
    refetch: () => {
      void chosenResult?.refetch();
    },
  };
}
