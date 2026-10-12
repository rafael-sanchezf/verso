/**
 * Home's three reads, its pull to refresh, and the two writes the long-press
 * menu can make.
 *
 * All of it in one module so the screen's components take data as props and
 * stay drawings. The keys are the shell's (`src/lib/query-keys.ts`) and the
 * invalidation is the shell's (`src/lib/invalidate.ts`), because every one of
 * these lists is also somebody else's screen.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { backlog, markFinished, moveToBacklog, playing, upcoming, type EntryRow } from '@verso/api';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { alert } from '@/lib/dialog';
import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Home shows three of each list; the cache holds all of them.
 *
 * README.md's key table says `['backlog']` is `backlog` in views.ts and that
 * `upNext` is "the same list limited to three", so the query fetches the whole
 * list and the screen takes three off the top. Calling `upNext(client, 3)`
 * under the shared key would put a three-row list in the cache that the Next
 * tab then renders as the user's entire backlog — one screen quietly truncating
 * another. `select` runs on the way out and leaves the cached list alone.
 *
 * Module scope so the reference is stable; a `select` defined in render
 * recomputes on every pass.
 */
const firstThree = (rows: EntryRow[]): EntryRow[] => rows.slice(0, 3);

export interface HomeData {
  playing: UseQueryResult<EntryRow[]>;
  upNext: UseQueryResult<EntryRow[]>;
  comingUp: UseQueryResult<EntryRow[]>;
  /** True while a pull to refresh is in flight, for the `RefreshControl`. */
  refreshing: boolean;
  refresh: () => void;
}

export function useHomeData(): HomeData {
  const queryClient = useQueryClient();

  const playingQuery = useQuery({
    queryKey: queryKeys.playing(),
    queryFn: () => playing(supabase),
  });

  const upNextQuery = useQuery({
    queryKey: queryKeys.backlog(),
    queryFn: () => backlog(supabase),
    select: firstThree,
  });

  const comingUpQuery = useQuery({
    queryKey: queryKeys.upcoming(),
    queryFn: () => upcoming(supabase),
    select: firstThree,
  });

  // The control's own `refreshing` rather than any query's `isFetching`: the
  // three refetch at their own speeds, and a spinner that disappears when the
  // fastest of them lands reads as a refresh that did not happen.
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.playing() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.backlog() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.upcoming() }),
    ]).finally(() => setRefreshing(false));
  }, [queryClient]);

  return {
    playing: playingQuery,
    upNext: upNextQuery,
    comingUp: comingUpQuery,
    refreshing,
    refresh,
  };
}

/** What the long press on a Playing card can do (home.md, Behavior). */
export interface PlayingActions {
  markAsFinished: (id: string) => void;
  logHours: (id: string) => void;
  moveToBacklog: (id: string) => void;
}

/**
 * The failure an alert is for.
 *
 * A read that fails becomes the block's error line with a Retry (README.md,
 * Loading and errors). A write that fails has nowhere to put a line — the card
 * it was about is still sitting there looking untouched — so it gets the iOS
 * convention for "that did not happen": an alert, one sentence, one button
 * (rule 7). Nothing in the frames covers this.
 */
function failed(what: string): void {
  alert(what, 'Check your connection and try again.');
}

export function usePlayingActions(): PlayingActions {
  const queryClient = useQueryClient();
  const router = useRouter();

  const finish = useMutation({
    mutationFn: (id: string) => markFinished(supabase, id),
    onSuccess: (_result, id) => {
      invalidateEntry(queryClient, id);
      // The tier sheet belongs to the log flow over the game page, and `log=1`
      // is how the game page knows to open it as soon as it has loaded
      // (README.md, Params). Home does not open it itself.
      router.push({ pathname: '/game/[id]', params: { id, from: 'Home', log: '1' } });
    },
    onError: () => failed("Couldn't mark it finished"),
  });

  const backlogMove = useMutation({
    mutationFn: (id: string) => moveToBacklog(supabase, id),
    // The card leaves Playing on its own: `invalidateEntry` refetches
    // `['playing']` and the row is no longer in it.
    onSuccess: (_entry, id) => invalidateEntry(queryClient, id),
    onError: () => failed("Couldn't move it to your backlog"),
  });

  const logHours = useCallback(
    (id: string) => router.push({ pathname: '/game/[id]/hours', params: { id } }),
    [router],
  );

  return {
    markAsFinished: finish.mutate,
    logHours,
    moveToBacklog: backlogMove.mutate,
  };
}
