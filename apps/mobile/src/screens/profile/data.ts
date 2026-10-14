/**
 * TanStack Query hooks behind the joint Profile (movies-build.md, PR 5): the
 * identity, the counts per medium, the ranker percentile and the hours for the
 * page's view, Recent and the Activity month, and each medium's ranked list
 * (the Ranking tab's own read and cache entry, so the two always agree).
 *
 * Query keys come from `src/lib/query-keys.ts`, never spelled inline
 * (README.md, "Data"). Every one is under `['profile']` except the ranked
 * lists, so an entry or ranking write refetches the whole page
 * (`invalidateProfile` in src/lib/invalidate.ts).
 *
 * `refetchOnMount: 'always'` on the page's reads is the safety net (VER-201):
 * a write that some day forgets its invalidation still leaves Profile,
 * Activity and Edit profile right the next time one of them mounts, rather
 * than for as long as the cache's thirty seconds of freshness last. The
 * onboarding deck's count (`useProfileStats`) keeps the default.
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
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { refetchStaleProfile } from '@/lib/invalidate';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import type { LiveMedium } from '@/state/medium';

export { useRanking } from '@/screens/ranking/use-ranking';

/** The page's reads refetch every time a screen showing them mounts. */
const ON_MOUNT = { refetchOnMount: 'always' } as const;

/**
 * Refetch the stale Profile reads when the screen regains focus (VER-201): the
 * Profile tab stays mounted, so `ON_MOUNT` never fires on a switch back to it.
 * The first focus is the mount, whose fetch `ON_MOUNT` already makes, so it is
 * skipped rather than fetched twice. Called by Profile, Activity and Edit
 * profile.
 */
export function useRefetchProfileOnFocus(): void {
  const queryClient = useQueryClient();
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      void refetchStaleProfile(queryClient);
    }, [queryClient]),
  );
}

export function useProfileIdentity() {
  return useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase), ...ON_MOUNT });
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
      ...ON_MOUNT,
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
    ...ON_MOUNT,
  });
}

export function useProfileHours(medium: LiveMedium | undefined) {
  return useQuery({
    queryKey: queryKeys.profileHours(medium ?? 'all'),
    queryFn: () => profileHours(supabase, medium ? { medium } : {}),
    ...ON_MOUNT,
  });
}

/** Recent on Profile: two rows (round one, "two or three rows and See all"). */
export const RECENT_ROWS = 2;

export function useRecentActivity(medium: LiveMedium | undefined, limit = RECENT_ROWS) {
  return useQuery({
    queryKey: queryKeys.profileActivity(medium ?? 'all', limit),
    queryFn: () => recentActivity(supabase, medium ? { limit, medium } : { limit }),
    ...ON_MOUNT,
  });
}

export function useActivityMonth(year: number, month: number, medium: LiveMedium | undefined) {
  return useQuery({
    queryKey: queryKeys.profileActivityMonth(year, month, medium ?? 'all'),
    queryFn: () => activityMonth(supabase, medium ? { year, month, medium } : { year, month }),
    ...ON_MOUNT,
  });
}
