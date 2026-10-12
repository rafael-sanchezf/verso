/**
 * The page's reads and writes, as hooks.
 *
 * One query for the page, one for the Steam figure, and one mutation shape for
 * every write in `entries.ts`. The mutation helper exists because all nine
 * writes end the same way — call it, then `invalidateEntry`, which knows every
 * screen that could be showing this game — and a screen that forgets that last
 * step is a screen that quietly lies until it is remounted.
 *
 * The four sheets use these too, which is why they are here and not inside the
 * page component.
 */

import { gamePage, latestPlayerCount, setPlayedPlatforms, type GamePage } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { steamAppId } from './steam';

/** Everything the page draws, under `['game', id]`. Null means no such media item. */
export function useGamePage(id: string) {
  return useQuery({
    queryKey: queryKeys.game(id),
    queryFn: () => gamePage(supabase, id),
  });
}

/**
 * Steam's concurrent players, under `['player-count', id]`.
 *
 * Only asked for when the catalog has a Steam id: a game that is not on Steam
 * is never polled, so the query would be a round trip that can only ever answer
 * null. Up to half an hour old by design, so it refetches no harder than the
 * poll that writes it.
 */
export function usePlayerCount(id: string, page: GamePage | null | undefined) {
  const onSteam = page ? steamAppId(page.externalIds) !== null : false;

  return useQuery({
    queryKey: queryKeys.playerCount(id),
    queryFn: () => latestPlayerCount(supabase, id),
    enabled: onSteam,
    staleTime: 5 * 60_000,
  });
}

/**
 * Any write from `entries.ts`, followed by the invalidation it owes.
 *
 * `onSettled` rather than `onSuccess`: a write that fails can still have landed
 * (a response lost on a flaky network), and refetching after a failure costs a
 * round trip while not refetching costs a wrong screen.
 */
export function useEntryWrite<TArgs>(id: string, write: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: write,
    onSettled: () => invalidateEntry(queryClient, id),
  });
}

/**
 * A sheet's Save: run the writes it collected, then dismiss.
 *
 * The writes run in sequence rather than in parallel. Every one of them is an
 * upsert on the same `user_entries` row, and two upserts racing each other on
 * one row is how a sheet that saved three fields ends up having saved two.
 *
 * The sheet stays open when a write fails, so nothing is silently lost: the
 * user still has what they typed and can try again.
 */
export function useSheetSave(id: string) {
  const router = useRouter();
  const write = useEntryWrite<() => Promise<unknown>>(id, (run) => run());

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/game/[id]', params: { id } });
  };

  return {
    pending: write.isPending,
    dismiss,
    save: (tasks: readonly (() => Promise<unknown>)[]) => {
      if (tasks.length === 0) {
        dismiss();
        return;
      }

      write.mutate(
        async () => {
          for (const task of tasks) await task();
        },
        {
          onSuccess: dismiss,
          onError: () => Alert.alert('Could not save', 'Check your connection and try again.'),
        },
      );
    },
  };
}

/**
 * Where the game was played, with the chips updating before the network does.
 *
 * The platform chips are the one control on this page that is tapped several
 * times in a row — "I played it on these three" — and a chip that waits for a
 * round trip before it shows a check invites the second tap to land on a stale
 * row. So the cached page is patched first and rolled back if the write fails.
 */
export function usePlayedPlatforms(id: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.game(id);

  return useMutation({
    mutationFn: (platforms: string[]) => setPlayedPlatforms(supabase, id, platforms),
    onMutate: async (platforms: string[]) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GamePage | null>(key);

      if (previous) {
        const played = new Set(platforms);
        const next: GamePage = {
          ...previous,
          entry: previous.entry ? { ...previous.entry, playedPlatforms: platforms } : previous.entry,
          game: previous.game
            ? {
                ...previous.game,
                platforms: previous.game.platforms.map((platform) => ({
                  ...platform,
                  played: played.has(platform.name),
                })),
              }
            : previous.game,
        };
        queryClient.setQueryData(key, next);
      }

      return { previous };
    },
    onError: (_error, _platforms, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => invalidateEntry(queryClient, id),
  });
}
