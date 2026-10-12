/**
 * The Next tab's two reads and two writes, as TanStack Query hooks.
 *
 * `backlog(client)` and `upcoming(client)` under the shared keys
 * (`src/lib/query-keys.ts`); `moveBacklogEntry` and `setStatus('playing')`
 * each followed by the shared invalidation helper, per
 * docs/design/specs/next.md, "Data" and "Backlog segment".
 */

import { backlog, moveBacklogEntry, setStatus, upcoming, type EntryRow } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { releaseDateOf, whenReleased } from '@/lib/when-released';

export function useBacklogQuery() {
  return useQuery<EntryRow[]>({
    queryKey: queryKeys.backlog(),
    queryFn: () => backlog(supabase),
  });
}

export function useUpcomingQuery() {
  return useQuery<EntryRow[]>({
    queryKey: queryKeys.upcoming(),
    queryFn: () => upcoming(supabase),
  });
}

interface MoveBacklogEntryVars {
  entryId: string;
  position: number;
  /** For `invalidateEntry` only; not sent to the RPC. */
  mediaItemId: string;
}

/**
 * The drag handle's write. The caller sets the reordered list into the
 * `['backlog']` cache itself before calling `mutate` — `react-native-sortables`
 * already hands back the exact final order on drop, so there is nothing this
 * hook would compute that the screen does not already have — and this hook
 * makes the network call, recovers from a failure, and invalidates on settle.
 */
export function useMoveBacklogEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, position }: MoveBacklogEntryVars) =>
      moveBacklogEntry(supabase, { entryId, position }),
    onError: () => {
      // The optimistic reorder already landed in the cache. A failed move is
      // rare enough (the entry left the backlog from another device mid-drag)
      // that refetching the true order is simpler than carrying a pre-drag
      // snapshot through the mutation just for this case.
      void queryClient.invalidateQueries({ queryKey: queryKeys.backlog() });
    },
    onSettled: (_data, _error, variables) => {
      invalidateEntry(queryClient, variables.mediaItemId);
    },
  });
}

/**
 * The Start button: `setStatus('playing')`, then the shared invalidation.
 *
 * The button cannot show for a game that is not out: `backlog()` keeps only
 * games dated today or earlier, or undated, and the Upcoming rows have no
 * Start. The write checks anyway, against the catalog (`lib/when-released.ts`,
 * phone feedback entry 10), so a list cached across a date change in the
 * catalog cannot mark an unreleased game Playing. Nothing is written then, and
 * the refetch moves the row to Upcoming, where it belongs.
 */
export function useStartPlaying() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaItemId: string) =>
      whenReleased(
        () => releaseDateOf(supabase, mediaItemId),
        () => setStatus(supabase, mediaItemId, 'playing'),
      ),
    onSuccess: (_outcome, mediaItemId) => {
      invalidateEntry(queryClient, mediaItemId);
    },
  });
}
