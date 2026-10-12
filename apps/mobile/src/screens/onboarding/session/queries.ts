/**
 * The reads behind the session: the four tiers' stored order and the engine's
 * guess for the games being placed, in parallel (specs/batch-session.md,
 * "Input"). The cards' titles and covers come with the request, so no catalog
 * read happens here.
 *
 * The tiers go through `['tier', tier]`, the keys the log flow reads, so the
 * two share a cache and `invalidateRanking` clears both. Both reads refetch on
 * mount and the session waits for the fresh answer: the order a session
 * starts from is the order its positions are written against, and a list a
 * write from the previous screen has not reached yet would put every game one
 * place off.
 *
 * The onboarding keys are the app's (`src/lib/query-keys.ts`), which spreads
 * `onboardingQueryKeys` from `@verso/api` (PR #73) so the two cannot drift.
 */

import { useQueries, useQuery } from '@tanstack/react-query';
import {
  batchPredictions,
  playedNotRanked,
  tierList,
  type BatchPrediction,
  type PlayedNotRankedRow,
} from '@verso/api';
import { TIERS } from '@verso/core';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import type { TierRows } from './batch-start';

/** `batch_predictions` takes at most this many ids; a longer batch guesses the first ones. */
const MAX_PREDICTION_IDS = 500;

export interface SessionReads {
  /** All four tiers, fresh; null until every one has landed. */
  tiers: TierRows | null;
  /**
   * The guesses, or null for none: not asked (the seeds), or the read failed.
   * A failed guess is not a failed session; the games it would have placed
   * use plain binary insertion instead (the guess is a convenience; the
   * review is the safety net).
   */
  predictions: readonly BatchPrediction[] | null;
  /** Every read the session waits for has answered. */
  ready: boolean;
  /** A tier read failed; the session cannot start without it. */
  failed: boolean;
  retry: () => void;
}

export function useSessionReads(ids: readonly string[], withPredictions: boolean): SessionReads {
  const tierResults = useQueries({
    queries: TIERS.map((tier) => ({
      queryKey: queryKeys.tier(tier),
      queryFn: () => tierList(supabase, 'game', tier),
      refetchOnMount: 'always' as const,
    })),
  });

  const guessIds = ids.slice(0, MAX_PREDICTION_IDS);
  const guesses = useQuery({
    queryKey: queryKeys.batchPredictions('game', guessIds),
    queryFn: () => batchPredictions(supabase, 'game', guessIds),
    enabled: withPredictions && guessIds.length > 0,
    refetchOnMount: 'always',
  });

  // `isSuccess`, not "has data": a refetch that failed keeps the old list as
  // its data, and that is exactly the list the session must not start from.
  const tiersSettled = tierResults.every((result) => result.isSuccess && !result.isFetching);
  const tiers: TierRows | null = tiersSettled
    ? {
        loved: tierResults[0]!.data!,
        liked: tierResults[1]!.data!,
        fine: tierResults[2]!.data!,
        disliked: tierResults[3]!.data!,
      }
    : null;

  const asked = withPredictions && guessIds.length > 0;
  const guessesSettled = !asked || guesses.isError || (guesses.data !== undefined && !guesses.isFetching);

  return {
    tiers,
    predictions: asked && !guesses.isError ? (guesses.data ?? null) : null,
    ready: tiers !== null && guessesSettled,
    failed: tierResults.some((result) => result.isError && !result.isFetching),
    retry: () => {
      for (const result of tierResults) if (result.isError) void result.refetch();
    },
  };
}

/** Ranking's banner: the played games with no ranking yet, newest first. */
export function usePlayedNotRanked() {
  return useQuery<PlayedNotRankedRow[]>({
    queryKey: queryKeys.playedNotRanked('game'),
    queryFn: () => playedNotRanked(supabase, 'game'),
  });
}
