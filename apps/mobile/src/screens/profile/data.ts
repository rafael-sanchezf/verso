/**
 * TanStack Query hooks behind the Profile tab: identity, stats, recent
 * activity, and the ranked list Recent's global rank and the top-ten share
 * borrow from.
 *
 * Query keys come from `src/lib/query-keys.ts`, never spelled inline
 * (README.md, "Data").
 */

import { getMyProfile, profileStats, recentRankings, tierList, type TierListRow } from '@verso/api';
import { TIERS, type Tier } from '@verso/core';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import type { TierRows } from './ranking-math';

/**
 * The four `tierList` calls, keyed by tier — the shape `['ranking']` holds
 * (see `ranking-math.ts`'s top comment: the Ranking tab's own screen reads
 * and writes this same cache entry as `TierRows`, so the two have to agree).
 */
async function fetchRanking(): Promise<TierRows<TierListRow>> {
  const lists = await Promise.all(TIERS.map((tier) => tierList(supabase, 'game', tier)));

  const tiers: Record<Tier, TierListRow[]> = { loved: [], liked: [], fine: [], disliked: [] };
  TIERS.forEach((tier, index) => {
    tiers[tier] = lists[index] ?? [];
  });
  return tiers;
}

export function useProfileIdentity() {
  return useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });
}

export function useProfileStats() {
  return useQuery({ queryKey: queryKeys.profileStats(), queryFn: () => profileStats(supabase) });
}

export function useProfileRecent() {
  return useQuery({ queryKey: queryKeys.profileRecent(), queryFn: () => recentRankings(supabase, 10) });
}

export function useProfileRanking() {
  return useQuery<TierRows<TierListRow>>({ queryKey: queryKeys.ranking(), queryFn: fetchRanking });
}
