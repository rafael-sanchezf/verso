/**
 * The log flow: one sheet from "I finished this" to a placed game.
 *
 * Step 1 asks for a tier at the small detent, step 2 asks the comparisons at
 * full height, step 3 confirms the placement. The engine in `@verso/core`
 * decides every transition between them (see `machine.ts`); this file is the
 * wiring — the two reads, the sheet's height, and the single write at the end.
 *
 * That write is `finishInsertion`, which lands the placement and the whole
 * comparison log in one transaction. `insertRankingEntry` is never called from
 * here, and comparisons are never written separately (specs/log-flow.md,
 * Notes).
 *
 * Closing at any step leaves the game played and unranked, with nothing
 * half-written: the game page then offers "Rank it".
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { finishInsertion } from '@verso/api';
import {
  insertionToFinishArgs,
  scoreForPosition,
  type ComparisonOutcome,
  type FinishInsertionArgs,
  type Tier,
} from '@verso/core';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { invalidateRanking } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { movieFacts } from '@/screens/movie/fallback';
import { logTenRankedIfReached } from '@/screens/onboarding/ten-ranked';
import { ErrorLine } from '@/ui';
import { useTheme } from '@/ui/theme';

import { CompareStep } from './compare-step';
import { ConfirmStep } from './confirm-step';
import { gameFromPage, gameFromTierRow, rankable, scoreText, TIER_IN_SENTENCE } from './game';
import { chooseTier, nudge, respond, TIER_STEP, type LogState } from './machine';
import { MovieLogStep } from './movie-log-step';
import { gamesAbove, globalRank } from './placement';
import { useGame, useTiers } from './queries';
import { TierStep } from './tier-step';

/**
 * The options that grow the sheet, as one stable object.
 *
 * `Stack.Screen` calls `setOptions` whenever the object identity changes, and
 * `setOptions` re-renders the screen — a literal written inline in the JSX is a
 * new object every render and the two chase each other forever.
 */
const FULL_HEIGHT_SHEET = { sheetAllowedDetents: [1] };

/**
 * `rank` skips a film's log sheet and opens at the tier step: the movie
 * page's "Rank it ›" for a film already in the diary. A game always opens at
 * the tier step, since its page marked it finished before pushing here.
 */
export function LogFlowScreen({ id, rank = false }: { id: string; rank?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [chosen, setChosen] = useState<Tier | null>(null);
  const [log, setLog] = useState<LogState>(TIER_STEP);

  const game = useGame(id);
  // The medium comes from the item (movies-build.md, PR 2, item 5): a film
  // opens on its log sheet, a game on the tier sheet.
  const medium = game.data?.medium ?? 'game';
  const isFilm = medium === 'movie';
  const film = useQuery({
    queryKey: queryKeys.movieFacts(id),
    queryFn: () => movieFacts(supabase, id),
    enabled: isFilm,
  });
  const [logged, setLogged] = useState(rank);
  const tiers = useTiers(chosen, medium);

  // A film's genres are TMDB's, on `movie_details`; `gamePage` has none for it.
  const newGame = useMemo(() => {
    if (!game.data) return null;
    const base = gameFromPage(game.data);
    return isFilm ? { ...base, genres: film.data?.genres ?? [] } : base;
  }, [game.data, isFilm, film.data]);
  const gamesById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof gameFromTierRow>>();
    for (const row of tiers.rows ?? []) map.set(row.media_item_id, gameFromTierRow(row));
    return map;
  }, [tiers.rows]);

  /**
   * Start the search as soon as both reads are in.
   *
   * The tier's own order is what the new game is compared against, minus the
   * game itself: re-ranking removes the old entry first, so it should not be
   * there, and comparing a game with itself is the one thing the engine has no
   * answer for.
   */
  useEffect(() => {
    if (chosen === null || log.step !== 'tier') return;
    const rows = tiers.rows;
    if (!newGame || !rows) return;

    const list = rows
      .filter((row) => row.media_item_id !== id)
      .map((row) => ({ id: row.media_item_id, genres: row.genres }));

    setLog(chooseTier(chosen, rankable(newGame), list));
  }, [chosen, log.step, newGame, tiers.rows, id]);

  /**
   * Dismiss the sheet. Home is the fallback for the case where this route is
   * the whole stack — a deep link straight to `verso://log/<id>` — because
   * there is nothing behind the sheet to go back to.
   */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const save = useMutation({
    mutationFn: (args: FinishInsertionArgs) => finishInsertion(supabase, args),
    onSuccess: () => {
      invalidateRanking(queryClient, id);
      // The funnel's `ten_ranked` (onboarding.md, "Events"): a first ranking
      // adds one to the count; a re-rank adds none.
      logTenRankedIfReached(queryClient, game.data?.ranking ? 0 : 1, medium);
      close();
    },
  });

  const onAnswer = useCallback((outcome: ComparisonOutcome) => {
    setLog((current) => respond(current, outcome));
  }, []);

  const onNudge = useCallback((delta: number) => {
    setLog((current) => nudge(current, delta));
  }, []);

  const onDone = useCallback(() => {
    if (log.step !== 'confirm') return;
    save.mutate(
      insertionToFinishArgs({ ...log.insertion, insertAt: log.insertAt }, { medium }),
    );
  }, [log, save, medium]);

  const above = chosen === null ? null : gamesAbove(chosen, tiers.sizes);
  const expanded = log.step !== 'tier';

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      {/*
        The sheet opens at the small detent the root layout registers and grows
        to full height for the comparisons. Replacing the detent list with a
        single full-height detent is what moves it: the native detents are
        identified by their index, so index 0 stays selected and simply means
        something taller. There is no imperative "go to detent" API in
        react-native-screens 4.26.
      */}
      {expanded ? <Stack.Screen options={FULL_HEIGHT_SHEET} /> : null}

      {game.isPending ? null : isFilm && !logged ? (
        film.data ? (
          <MovieLogStep
            film={film.data}
            onSaved={(rankNext) => {
              if (rankNext) setLogged(true);
              else close();
            }}
          />
        ) : film.isError ? (
          <ErrorLine message="Couldn't load this film." onRetry={() => void film.refetch()} />
        ) : null
      ) : log.step === 'tier' ? (
        <View
          style={{
            paddingTop: theme.space[3],
            paddingHorizontal: theme.space[4],
            paddingBottom: insets.bottom + theme.space[2],
          }}>
          {game.isError || (game.isSuccess && game.data === null) ? (
            <ErrorLine
              message="Couldn't load this game."
              onRetry={() => {
                void game.refetch();
              }}
            />
          ) : tiers.error && chosen !== null ? (
            <ErrorLine
              message={`Couldn't load your ${TIER_IN_SENTENCE[chosen]} list.`}
              onRetry={tiers.refetch}
            />
          ) : (
            // A tier is chosen but the step has not moved on, so one of the two
            // reads is still in flight: that row is the one waiting.
            <TierStep title={newGame?.title ?? null} pending={chosen} onChoose={setChosen} />
          )}
        </View>
      ) : null}

      {log.step === 'compare' && newGame
        ? (() => {
            const { insertion } = log;
            const pivotIndex = insertion.pivotIndex;
            const pivotItem = pivotIndex === null ? undefined : insertion.list[pivotIndex];
            const pivot = pivotItem ? gamesById.get(pivotItem.id) : undefined;

            if (pivotIndex === null || !pivot) {
              return (
                <View style={styles.centered}>
                  <ErrorLine message="Couldn't load that comparison." onRetry={tiers.refetch} />
                </View>
              );
            }

            const score = scoreForPosition(insertion.tier, pivotIndex, insertion.list.length);
            const subtitle =
              above === null
                ? scoreText(score)
                : `ranked #${globalRank(above, pivotIndex)} · ${scoreText(score)}`;

            return (
              <CompareStep
                medium={medium}
                insertion={insertion}
                newGame={newGame}
                pivot={pivot}
                pivotSubtitle={subtitle}
                onAnswer={onAnswer}
                onClose={close}
              />
            );
          })()
        : null}

      {log.step === 'confirm' && newGame ? (
        // Not flattened: this is the sheet's own content view, and
        // react-native-screens counts the subviews it is given when the sheet
        // holds a scroll view. See the note at the top of `ConfirmStep`.
        <View
          collapsable={false}
          style={{
            flex: 1,
            paddingHorizontal: theme.space[4],
            paddingTop: Math.max(insets.top, theme.space[4]),
            paddingBottom: Math.max(insets.bottom, theme.space[4]),
          }}>
          <ConfirmStep
            state={log}
            newGame={newGame}
            gamesById={gamesById}
            above={above}
            onNudge={onNudge}
            onDone={onDone}
            saving={save.isPending}
            error={save.isError ? "Couldn't save that placement." : null}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
