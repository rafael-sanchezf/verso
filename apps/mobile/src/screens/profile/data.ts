/**
 * TanStack Query hooks behind the joint Profile (movies-build.md, PR 5): the
 * identity, the counts per medium, the ranker percentile and the hours for the
 * page's view, Recent and the Activity month, and each medium's ranked list
 * (the Ranking tab's own read and cache entry, so the two always agree).
 *
 * Query keys come from `src/lib/query-keys.ts`, never spelled inline
 * (README.md, "Data"). Every one is under `['profile']` except the ranked
 * lists, so an entry or ranking write refetches the whole page.
 */

import {
  activityMonth,
  getMyProfile,
  profileHours,
  profileStats,
  rankerPercentile,
  recentActivity,
  type ProfileStats,
} from '@verso/api';
import { useQueries, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import type { LiveMedium } from '@/state/medium';

export { useRanking } from '@/screens/ranking/use-ranking';

export function useProfileIdentity() {
  return useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });
}

/** One medium's `profileStats` (games by default): the onboarding deck's count. */
export function useProfileStats(medium: LiveMedium = 'game') {
  return useQuery({
    queryKey: queryKeys.profileStatsFor(medium),
    queryFn: () => profileStats(supabase, { medium }),
  });
}

/** `profileStats` for each tracked medium, keyed by medium; a medium still loading is absent. */
export function useMediumStats(media: readonly LiveMedium[]): {
  stats: Partial<Record<LiveMedium, ProfileStats>>;
  isError: boolean;
  refetch: () => void;
} {
  const results = useQueries({
    queries: media.map((medium) => ({
      queryKey: queryKeys.profileStatsFor(medium),
      queryFn: () => profileStats(supabase, { medium }),
    })),
  });
  const stats: Partial<Record<LiveMedium, ProfileStats>> = {};
  media.forEach((medium, index) => {
    const data = results[index]?.data;
    if (data) stats[medium] = data;
  });
  return {
    stats,
    isError: results.some((result) => result.isError),
    refetch: () => results.forEach((result) => void result.refetch()),
  };
}

export function useRankerPercentile(medium: LiveMedium | undefined) {
  return useQuery({
    queryKey: queryKeys.profilePercentile(medium ?? 'all'),
    queryFn: () => rankerPercentile(supabase, medium ? { medium } : {}),
  });
}

export function useProfileHours(medium: LiveMedium | undefined) {
  return useQuery({
    queryKey: queryKeys.profileHours(medium ?? 'all'),
    queryFn: () => profileHours(supabase, medium ? { medium } : {}),
  });
}

/** Recent on Profile: two rows (round one, "two or three rows and See all"). */
export const RECENT_ROWS = 2;

export function useRecentActivity(medium: LiveMedium | undefined, limit = RECENT_ROWS) {
  return useQuery({
    queryKey: queryKeys.profileActivity(medium ?? 'all', limit),
    queryFn: () => recentActivity(supabase, medium ? { limit, medium } : { limit }),
  });
}

export function useActivityMonth(year: number, month: number, medium: LiveMedium | undefined) {
  return useQuery({
    queryKey: queryKeys.profileActivityMonth(year, month, medium ?? 'all'),
    queryFn: () => activityMonth(supabase, medium ? { year, month, medium } : { year, month }),
  });
}
