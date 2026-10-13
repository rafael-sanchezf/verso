/**
 * `ten_ranked`, once, when a write takes the ranked count to ten
 * (specs/onboarding.md, "Events": "the review's Done, or the single log
 * flow").
 *
 * Called after the ranking writes have landed, with how many games they
 * placed for the first time. It reads the ranked count through the Profile
 * tab's `['profile', 'stats']` query, which `invalidateRanking` has just set
 * refetching, so this joins that read rather than adding one; the count before
 * the writes is the count after less what they added. A game re-ranked from
 * the log flow adds nothing. Fire and forget: a failed read or write is a lost
 * data point, never a reason to hold the user (events.ts).
 */

import { profileStats } from '@verso/api';
import type { QueryClient } from '@tanstack/react-query';
import type { Medium } from '@verso/core';

import { logAppEvent } from '@/lib/log-event';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { crossesTenRanked } from './gate';

/**
 * `medium` is the ranked list the write went into: ten films count as ten in
 * the movie list, so a film never re-reads the games count (or the reverse).
 * The games read keeps the Profile tab's key; another medium's has its own
 * under the same `['profile']` prefix, so the Profile's games stats are never
 * overwritten with a film count.
 */
export function logTenRankedIfReached(queryClient: QueryClient, added: number, medium: Medium = 'game'): void {
  if (added <= 0) return;
  const queryKey = queryKeys.profileStatsFor(medium);
  void queryClient
    .fetchQuery({ queryKey, queryFn: () => profileStats(supabase, { medium }), staleTime: 0 })
    .then((stats) => {
      if (crossesTenRanked(stats.ranked - added, stats.ranked)) return logAppEvent('ten_ranked');
      return undefined;
    })
    .catch(() => undefined);
}
