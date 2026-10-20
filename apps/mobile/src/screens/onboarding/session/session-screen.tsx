/**
 * The comparison session (specs/batch-session.md, "The session", frame
 * `R2 · Session` 134:30): many played games placed into their tiers in one run
 * of questions, starting from the engine's guess and asking where it is weak.
 *
 * The flow, all inside this one route:
 *
 * 1. The tier pass, when games arrived without a tier (the drain, add-many):
 *    one game per screen, the log flow's tier rows. It runs while the reads
 *    load.
 * 2. The reads: the four tiers, fresh, and the guesses (none for the seeds).
 *    Then `startBatch` from `@verso/core` via `beginBatch`.
 * 3. The questions, one at a time, every answer through `answerBatch`. "Place
 *    the rest for me" and the `x` both call `placeRest`.
 * 4. When every game is placed, the review takes over (`/onboarding/review`,
 *    replacing this screen), with the finished run handed over in
 *    `run-store.ts`. Nothing is written before the review's Done. The seeds
 *    skip the review (onboarding.md): their three games are written here and
 *    the deck page follows.
 *
 * The engine decides every question and every placement; this file is wiring.
 * Closing the app mid-session loses only the unwritten batch: the games stay
 * played, and the drain on Ranking offers them again.
 */

import {
  answerBatch,
  applyBatch,
  batchFinishArgs,
  nextQuestion,
  placeRest,
  remainingEstimate,
  TIERS,
  type BatchState,
  type ComparisonOutcome,
  type Tier,
} from '@verso/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { coverHeight, ErrorLine, Skeleton, useTheme } from '@/ui';

import {
  beginBatch,
  pivotSubtitle,
  progressFill,
  remainingLabel,
  uniqueById,
  type StartedBatch,
} from './batch-start';
import { CompareStage } from './compare-stage';
import { gameFromOnboardingRow, gameFromTierListRow, type SessionGame } from './games';
import { useSessionReads } from './queries';
import { crossesTen } from './review-model';
import { REVIEW_HREF, TABS_HREF } from './routes';
import { setFinishedRun } from './run-store';
import { SessionHeader } from './session-header';
import { clearSession, useSessionRequest, type SessionRequest } from './session-store';
import { assignPassTier, passCurrent, passDone, passFill, passLabel, startTierPass, stopPass, withPassTiers } from './tier-pass';
import { TierPassStep } from './tier-pass-step';
import { useBatchWrites } from './use-batch-writes';
import { useGoOnAfterDone } from './use-next-screen';
import { TextAction } from './text-action';

export function SessionScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const live = useSessionRequest();
  // `?medium=movie` from Ranking's films banner (movies-build.md, PR 2, item 7);
  // the request's own medium wins, and games is the default.
  const params = useLocalSearchParams<{ medium?: string }>();
  const paramMedium = params.medium === 'movie' ? 'movie' : undefined;

  // Held from the first request this screen saw, so clearing the store after
  // the seeds' writes cannot blank the screen while it navigates away.
  const [request, setRequest] = useState<SessionRequest | null>(live);
  if (request === null && live !== null) setRequest(live);

  if (request === null) {
    return (
      <SafeAreaView style={[styles.fill, styles.centered, { backgroundColor: theme.colors['bg/canvas'] }]}>
        <ErrorLine message={t('onboarding.session.nothingToRank')} align="center" />
        <TextAction
          label={t('onboarding.session.close')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(TABS_HREF))}
        />
      </SafeAreaView>
    );
  }

  return <Session request={request.medium || !paramMedium ? request : { ...request, medium: paramMedium }} />;
}

/** A session that has started: what `beginBatch` returned, and every game it may draw. */
interface Running {
  readonly started: StartedBatch;
  readonly games: ReadonlyMap<string, SessionGame>;
}

function Session({ request }: { request: SessionRequest }) {
  const t = useT();
  const theme = useTheme();
  const stopLabel = t('onboarding.session.stopHere');
  const router = useRouter();
  const writes = useBatchWrites();
  const goOn = useGoOnAfterDone();

  const items = useMemo(() => uniqueById(request.items), [request]);
  const ids = useMemo(() => items.map((item) => item.mediaItemId), [items]);
  const newGames = useMemo(
    () => new Map(items.map((item) => [item.mediaItemId, gameFromOnboardingRow(item.row)])),
    [items],
  );

  // The seeds start with no predictions (onboarding.md, "Three games you love").
  const medium = request.medium ?? 'game';
  const reads = useSessionReads(ids, request.source !== 'seeds', medium);

  const [pass, setPass] = useState(() => startTierPass(items));
  const [running, setRunning] = useState<Running | null>(null);
  const [batch, setBatch] = useState<BatchState | null>(null);
  // The `x` before the questions began: place everything as soon as they can be.
  const [stopRequested, setStopRequested] = useState(false);
  // The seeds' writes, once every seed is placed; also what keeps a second
  // hand-over from starting while the first navigates.
  const [finishing, setFinishing] = useState<BatchState | null>(null);
  const handedOver = useRef(false);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(TABS_HREF);
  };

  const saveSeeds = async (state: BatchState, run: Running) => {
    const result = applyBatch(state);
    const before = run.started.existing;
    const rankedBefore = before.loved.length + before.liked.length + before.fine.length + before.disliked.length;
    const ok = await writes.save(batchFinishArgs(result, { medium }), {
      tenRanked: crossesTen(rankedBefore, rankedBefore + result.placements.length),
    });
    if (!ok) return;
    clearSession();
    await goOn(request.onDone, medium === 'movie' ? 'movie' : 'game');
  };

  /** Every game is placed: on to the review, or for the seeds, write and go on. */
  const handOver = (state: BatchState, run: Running) => {
    if (handedOver.current) return;
    handedOver.current = true;
    if (request.onDone === 'deck') {
      setFinishing(state);
      void saveSeeds(state, run);
      return;
    }
    setFinishedRun({ request, state, existing: run.started.existing, games: run.games });
    router.replace(REVIEW_HREF);
  };

  // Start once the tier pass is over and the reads are in. Runs once: the
  // order the session starts from is the order its positions are written
  // against, so later refetches are ignored.
  useEffect(() => {
    if (handedOver.current || running !== null || !passDone(pass) || !reads.ready || reads.tiers === null) return;
    const tiered = withPassTiers(items, pass).map((item) => ({
      mediaItemId: item.mediaItemId,
      tier: item.tier,
      genres: item.row.genres ?? [],
    }));
    const started = beginBatch({ items: tiered, tiers: reads.tiers, predictions: reads.predictions });
    if (started === null) {
      // Nothing left to place: every game was ranked meanwhile.
      handedOver.current = true;
      leave();
      return;
    }

    const games = new Map<string, SessionGame>(newGames);
    for (const tier of TIERS) {
      for (const row of reads.tiers[tier]) games.set(row.media_item_id, gameFromTierListRow(row));
    }
    const run: Running = { started, games };
    setRunning(run);

    const state = stopRequested ? placeRest(started.state) : started.state;
    setBatch(state);
    if (nextQuestion(state) === null) handOver(state, run);
    // `leave` and `handOver` read only a ref, the router and this render's
    // request; the effect is about the pass and the reads arriving.
  }, [running, pass, reads.ready, reads.tiers, reads.predictions, items, newGames, stopRequested]);

  const onAnswer = (outcome: ComparisonOutcome) => {
    if (batch === null || running === null) return;
    const next = answerBatch(batch, outcome);
    setBatch(next);
    if (nextQuestion(next) === null) handOver(next, running);
  };

  const onPlaceRest = () => {
    if (batch === null || running === null) return;
    const next = placeRest(batch);
    setBatch(next);
    handOver(next, running);
  };

  const onChooseTier = (tier: Tier) => setPass((current) => assignPassTier(current, tier));

  const onClose = () => {
    if (running !== null) {
      onPlaceRest();
      return;
    }
    if (!passDone(pass)) {
      const stopped = stopPass(pass);
      if (withPassTiers(items, stopped).length === 0) {
        handedOver.current = true;
        leave();
        return;
      }
      setPass(stopped);
      setStopRequested(true);
      return;
    }
    // The pass is over and the reads are still out: a failed read has nothing
    // to place against, so leave; otherwise place as soon as they land.
    if (reads.failed) {
      handedOver.current = true;
      leave();
    } else {
      setStopRequested(true);
    }
  };

  const canvas = { backgroundColor: theme.colors['bg/canvas'] };

  // The seeds' writes: a quiet wait, and the one line if a write fails.
  if (finishing !== null && running !== null) {
    return (
      <SafeAreaView style={[styles.fill, styles.centered, canvas]}>
        {writes.pending > 0 && !writes.saving ? (
          <ErrorLine
            message={t('onboarding.session.couldNotSave')}
            align="center"
            onRetry={() => void saveSeeds(finishing, running)}
          />
        ) : (
          <ActivityIndicator accessibilityLabel={t('onboarding.session.saving')} color={theme.colors['text/secondary']} />
        )}
      </SafeAreaView>
    );
  }

  // 1. The tier pass.
  const passing = passCurrent(pass);
  if (passing !== null) {
    const game = newGames.get(passing);
    const passLine = passLabel(pass);
    return (
      <SafeAreaView style={[styles.fill, canvas]} edges={['top', 'bottom']}>
        <SessionHeader
          fill={passFill(pass)}
          label={t(passLine.key, passLine.vars)}
          closeLabel={stopLabel}
          onClose={onClose}
        />
        {game ? <TierPassStep game={game} index={pass.index} onChoose={onChooseTier} /> : null}
      </SafeAreaView>
    );
  }

  // 3. The questions.
  const question = batch === null ? null : nextQuestion(batch);
  if (batch !== null && running !== null && question !== null) {
    const remaining = remainingEstimate(batch);
    const game = running.games.get(question.item.id);
    const pivot = running.games.get(question.pivot.id);
    const remainingLine = remainingLabel(remaining);
    const pivotLine = pivotSubtitle(question, running.started.existing);
    return (
      <SafeAreaView style={[styles.fill, canvas]} edges={['top', 'bottom']}>
        <SessionHeader
          fill={progressFill(batch.log.length, remaining, running.started.firstEstimate)}
          label={t(remainingLine.key, remainingLine.vars)}
          closeLabel={stopLabel}
          onClose={onClose}
        />
        {game && pivot ? (
          <CompareStage
            medium={medium}
            question={question}
            answered={batch.log.length}
            game={game}
            pivot={pivot}
            pivotSubtitle={t(pivotLine.key, pivotLine.vars)}
            onAnswer={onAnswer}
            onPlaceRest={onPlaceRest}
          />
        ) : (
          <View style={[styles.fill, styles.centered]}>
            <ErrorLine message={t('onboarding.session.couldNotLoadComparison')} align="center" />
            <TextAction label={t('onboarding.session.placeRest')} onPress={onPlaceRest} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  // 2. The reads, or the moment between the last answer and the review.
  return (
    <SafeAreaView style={[styles.fill, canvas]} edges={['top', 'bottom']}>
      <SessionHeader fill={0} label={null} closeLabel={stopLabel} onClose={onClose} />
      {reads.failed ? (
        <View style={[styles.fill, styles.centered]}>
          <ErrorLine message={t('onboarding.session.couldNotLoadRanking')} align="center" onRetry={reads.retry} />
        </View>
      ) : (
        <StageSkeleton />
      )}
    </SafeAreaView>
  );
}

/** The question's shape in `bg/placeholder` while the reads are out: the chip, the prompt, two cards. */
function StageSkeleton() {
  const t = useT();
  const theme = useTheme();

  return (
    <View
      accessibilityLabel={t('onboarding.session.loading')}
      style={[styles.fill, styles.centered, { paddingHorizontal: theme.space[4], gap: theme.space[4] }]}>
      <Skeleton width={96} height={26} radius={theme.radius.pill} />
      <Skeleton width="70%" height={26} />
      <View style={[styles.pair, { gap: theme.space[3] }]}>
        {[0, 1].map((index) => (
          <View
            key={index}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors['bg/surface'],
                borderRadius: theme.radius.lg,
                padding: theme.space[3],
                gap: theme.space[2],
              },
            ]}>
            <Skeleton width={140} height={coverHeight(140)} radius={10} />
            <Skeleton width="80%" height={16} />
            <Skeleton width="50%" height={13} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  pair: { flexDirection: 'row', alignSelf: 'stretch' },
  card: { flex: 1, alignItems: 'center' },
});
