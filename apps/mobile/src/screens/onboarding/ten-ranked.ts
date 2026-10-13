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

import { logAppEvent } from '@/lib/log-event';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { crossesTenRanked } from './gate';

export function logTenRankedIfReached(queryClient: QueryClient, added: number): void {
  if (added <= 0) return;
  void queryClient
    .fetchQuery({ queryKey: queryKeys.profileStats(), queryFn: () => profileStats(supabase), staleTime: 0 })
    .then((stats) => {
      if (crossesTenRanked(stats.ranked - added, stats.ranked)) return logAppEvent('ten_ranked');
      return undefined;
    })
    .catch(() => undefined);
}
