/**
 * The Ranking tab's two conversations with the database: read the four tiers,
 * move one game.
 *
 * Both live here rather than in the screen so the components stay about what is
 * drawn. The read is one query key (`['ranking']`, from `src/lib/query-keys.ts`)
 * holding all four lists, because the screen never wants three of them: the
 * global rank cannot be worked out without the tiers above, so a partial cache
 * would draw wrong numbers rather than fewer rows.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moveRankingEntry, tierList, type TierListRow } from '@verso/api';
import { TIERS, type Medium, type Tier } from '@verso/core';

import { alert } from '@/lib/dialog';
import { t } from '@/lib/i18n';
import { invalidateRanking } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import type { DropTarget, TierRows } from './model';

/**
 * Every ranked game, as four ordered tiers.
 *
 * The four calls go out together: they are independent reads and doing them in
 * series would make the tab four round trips slow for no reason.
 */
export function useRanking(medium: Medium = 'game') {
  return useQuery<TierRows>({
    queryKey: queryKeys.ranking(medium),
    queryFn: async () => {
      const lists = await Promise.all(TIERS.map((tier) => tierList(supabase, medium, tier)));

      const tiers: Record<Tier, TierListRow[]> = { loved: [], liked: [], fine: [], disliked: [] };
      TIERS.forEach((tier, index) => {
        tiers[tier] = lists[index] ?? [];
      });
      return tiers;
    },
  });
}

/** What a drop needs to say: where the game goes, and what the list looks like once it is there. */
export interface MoveVariables {
  target: DropTarget;
  /** The whole ranking as the drop left it, written into the cache before the request goes out. */
  optimistic: TierRows;
}

/**
 * Drag to reorder: `move_ranking_entry`, optimistically.
 *
 * The optimistic write is not a nicety here. The list has already animated the
 * row into its new place by the time this runs, so without it the row would
 * snap back to where it was for the length of a round trip and then jump
 * forward again when the refetch landed.
 *
 * A failure puts the list back exactly as it was and says so, because a silent
 * revert looks like the drag simply did not take and invites the user to do it
 * again against the same broken connection.
 */
export function useMoveRankingEntry(medium: Medium = 'game') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ target }: MoveVariables) =>
      moveRankingEntry(supabase, {
        mediaItemId: target.mediaItemId,
        tier: target.tier,
        position: target.position,
      }),

    onMutate: async ({ optimistic }: MoveVariables) => {
      // An in-flight refetch would otherwise land after this write and undo it.
      await queryClient.cancelQueries({ queryKey: queryKeys.ranking(medium) });
      const previous = queryClient.getQueryData<TierRows>(queryKeys.ranking(medium));
      queryClient.setQueryData(queryKeys.ranking(medium), optimistic);
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.ranking(medium), context.previous);
      alert(t('lists.ranking.moveDidNotSave'), t('lists.checkConnection'));
    },

    // Success or failure, the database is the truth: refetch rather than trust
    // the optimistic copy, which is one game right and everything else guessed.
    onSettled: (_data, _error, { target }) => {
      invalidateRanking(queryClient, target.mediaItemId);
    },
  });
}
