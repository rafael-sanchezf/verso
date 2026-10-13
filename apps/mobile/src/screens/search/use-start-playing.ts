/**
 * The one write of the Playing intent: this game, Playing, now, then Home.
 *
 * `setStatus(client, id, 'playing')` is the whole of it. Like every writer in
 * `entries.ts` it upserts, so a game you do not track yet is created as
 * Playing in the same call, and one you do track moves to Playing from
 * whatever it was: out of the backlog (the trigger renumbers what is left), or
 * back from Played or Dropped. A ranked game keeps its place in the ranking:
 * status and ranking are separate facts. `started_at` is the database's: the
 * trigger stamps it the first time a game becomes Playing and keeps it after
 * that, so a replay shows the first start date.
 *
 * Home is where the result should be seen, so the navigation waits for
 * Home's Playing list to come back with the game in it. Going first would show
 * Home's empty card for the length of a refetch and then swap it for the game,
 * which reads as the tap not having worked.
 *
 * A game that is not out is never marked Playing (phone feedback entry 10).
 * The row already shows the add pill for one once Search knows its date
 * (`playingIntentControl`); this asks the catalog again before writing, so a
 * tap that beats that read cannot slip through. Such a tap opens the add sheet
 * instead, which offers the game's one honest row, "Want to play".
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setStatus } from '@verso/api';
import { useRouter } from 'expo-router';

import { alert } from '@/lib/dialog';
import { t } from '@/lib/i18n';
import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { releaseDateOf, whenReleased } from '@/lib/when-released';

export function useStartPlaying() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (id: string) =>
      whenReleased(
        () => releaseDateOf(supabase, id),
        () => setStatus(supabase, id, 'playing'),
      ),
    onSuccess: async (outcome, id) => {
      if (!outcome.released) {
        router.push({ pathname: '/add/[id]', params: { id } });
        return;
      }

      // Everything that can show this game: Home's three lists, the game page,
      // the profile counts, Search's own checks.
      invalidateEntry(queryClient, id);
      // `invalidateEntry` has just started the refetch of `['playing']`; with
      // `cancelRefetch: false` this joins that fetch rather than starting a
      // second one, and resolves when Home has the new list.
      await queryClient.refetchQueries({ queryKey: queryKeys.playing() }, { cancelRefetch: false });
      router.navigate('/');
    },
    // Nothing moved, so nothing to undo: the row is still there to tap again.
    // The iOS convention for a write that did not happen, as Home's long-press
    // menu does it (rule 7).
    onError: () => alert(t('browse.search.couldNotMarkPlaying'), t('browse.tryAgain')),
  });
}
