/**
 * "Look right?" (specs/batch-session.md, "The review", frame `R2 · Review`
 * 135:185): the session's result in place in the ranking, before anything is
 * written.
 *
 * Every new row, two ranked rows either side of each as anchors, the rest
 * folded into "{k} more" rows that open on tap; new rows on the medium's tint,
 * the ones the guess placed marked "≈". A long press on a new row's handle
 * drags it within its tier: each tier is its own sortable list with no
 * over-drag, so a row cannot be carried across a divider (tiers are chosen,
 * not dragged), and a dropped row is the user's placement.
 *
 * Done writes one `finishInsertion` per new game in tier order, each with its
 * own answers and its `placedBy` (`batchFinishArgs` over the review's lists,
 * so a moved game is written where it was dropped), then goes on: Link Steam
 * or the tabs for a new user, back through the door for a returning one.
 * "Rank more" writes the same way, then goes back for more.
 */

import { applyBatch, batchFinishArgs } from '@verso/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { useT } from '@/lib/i18n';
import { Button, ErrorLine, Text, useTheme } from '@/ui';

import { rankMoreTarget } from './navigation';
import {
  canMoveRow,
  crossesTen,
  dropInTier,
  expandStretch,
  metaLine,
  moveRow,
  reviewCounts,
  reviewResult,
  reviewSections,
  startReview,
  type ReviewToken,
} from './review-model';
import { ReviewDivider, ReviewRow, StretchRow } from './review-rows';
import { rankMoreHref, TABS_HREF } from './routes';
import { clearFinishedRun, getFinishedRun, type FinishedRun } from './run-store';
import { clearSession } from './session-store';
import { TextAction } from './text-action';
import { useBatchWrites } from './use-batch-writes';
import { useGoOnAfterDone } from './use-next-screen';

export function ReviewScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  // Read once: Done clears the store, and this screen must keep drawing
  // while it navigates away.
  const [run] = useState<FinishedRun | null>(getFinishedRun);

  if (run === null) {
    return (
      <SafeAreaView style={[styles.fill, styles.centered, { backgroundColor: theme.colors['bg/canvas'] }]}>
        <ErrorLine message={t('onboarding.review.nothingToReview')} align="center" />
        <TextAction
          label={t('onboarding.review.close')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(TABS_HREF))}
        />
      </SafeAreaView>
    );
  }

  return <Review run={run} />;
}

function Review({ run }: { run: FinishedRun }) {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const writes = useBatchWrites();
  const goOn = useGoOnAfterDone();

  const base = useMemo(() => applyBatch(run.state), [run.state]);
  const [review, setReview] = useState(() => startReview(base, run.existing));

  const sections = useMemo(() => reviewSections(review), [review]);
  const meta = metaLine(review);
  // Bumped when a drop is refused, to redraw that tier's list from the model:
  // the sortable keeps the order a drop left it in until its data changes.
  const [resync, setResync] = useState(0);
  // Once a write has been tried a row must not move: a game already written
  // would not follow it, and the games after it would land one place off.
  const movable = !writes.started;

  /** Write what is not written yet; true once every game has landed. */
  const write = async (): Promise<boolean> => {
    const args = batchFinishArgs(reviewResult(review, base), { medium: run.request.medium ?? 'game' });
    const counts = reviewCounts(review);
    const ok = await writes.save(args, { tenRanked: crossesTen(review.rankedBefore, counts.rankedAfter) });
    if (ok) {
      clearSession();
      clearFinishedRun();
    }
    return ok;
  };

  // Set once the writes have landed, so a second tap while the next screen
  // is being worked out cannot navigate twice.
  const [leaving, setLeaving] = useState(false);
  const busy = writes.saving || leaving;

  const onDone = async () => {
    if (busy || !(await write())) return;
    setLeaving(true);
    await goOn(run.request.onDone);
  };

  const onRankMore = async () => {
    if (busy || !(await write())) return;
    setLeaving(true);
    const target = rankMoreTarget(run.request);
    if (target === 'back-to-deck') {
      if (router.canGoBack()) router.back();
      else router.replace(rankMoreHref('deck-returning'));
    } else if (target === 'search-add-many') {
      router.dismissTo(rankMoreHref(target));
    } else {
      router.replace(rankMoreHref(target));
    }
  };

  const onMove = (id: string, delta: -1 | 1) => setReview((current) => moveRow(current, id, delta));

  // Reduce Motion: the lift, the drop and the rows opening happen without
  // their tweens.
  const motion = reduceMotion
    ? { activationAnimationDuration: 0, dropAnimationDuration: 0, itemEntering: null, itemExiting: null }
    : {};

  const renderToken = (token: ReviewToken) => {
    if (token.kind === 'stretch') {
      return (
        <Sortable.Handle mode="non-draggable">
          <StretchRow token={token} onExpand={() => setReview((current) => expandStretch(current, token.ids))} />
        </Sortable.Handle>
      );
    }
    const row = (
      <ReviewRow
        token={token}
        game={run.games.get(token.id)}
        movable={movable}
        canMoveUp={canMoveRow(review, token.id, -1)}
        canMoveDown={canMoveRow(review, token.id, 1)}
        onMove={(delta) => onMove(token.id, delta)}
      />
    );
    // A ranked row shifts with the reorder and cannot be picked up; a new
    // row carries its own handle inside.
    return token.isNew ? row : <Sortable.Handle mode="non-draggable">{row}</Sortable.Handle>;
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]} edges={['top', 'bottom']}>
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingHorizontal: theme.space[4],
          paddingTop: theme.space[4],
          paddingBottom: theme.space[6],
        }}>
        <View style={{ gap: 6, paddingBottom: theme.space[2] }}>
          <Text style="title-1">{t('onboarding.review.title')}</Text>
          <Text
            size={15}
            weight={meta.emphasis ? 500 : 400}
            color={meta.emphasis ? 'text/primary' : 'text/secondary'}>
            {meta.parts.map((part) => t(part.key, part.vars)).join(' · ')}
          </Text>
        </View>

        {sections.map((section) => (
          <View key={section.tier}>
            <ReviewDivider tier={section.tier} />
            <Sortable.Grid
              key={`${section.tier}:${resync}`}
              columns={1}
              data={section.tokens}
              keyExtractor={(token) => token.key}
              customHandle
              sortEnabled={movable}
              scrollableRef={scrollRef}
              // The row stays inside its tier's list: a drag across a divider
              // has nowhere to land, so the row settles back inside its tier.
              overDrag="none"
              rowGap={2}
              activeItemScale={1.03}
              inactiveItemOpacity={1}
              dragActivationDelay={300}
              {...motion}
              onDragEnd={({ data, key, fromIndex, toIndex }) => {
                if (fromIndex === toIndex) return;
                const next = dropInTier(review, section.tier, data, key);
                if (next === review) setResync((n) => n + 1);
                else setReview(next);
              }}
              renderItem={({ item }) => renderToken(item)}
            />
          </View>
        ))}
      </Animated.ScrollView>

      <View
        style={{
          paddingHorizontal: theme.space[4],
          paddingTop: theme.space[3],
          paddingBottom: theme.space[3],
          gap: theme.space[3],
        }}>
        <Button label={t('onboarding.review.done')} variant="primary" disabled={busy} onPress={() => void onDone()} />
        {writes.pending > 0 && !writes.saving ? (
          <ErrorLine
            message={
              writes.pending === 1
                ? t('onboarding.review.couldNotSaveOne')
                : t('onboarding.review.couldNotSaveOther', { count: writes.pending })
            }
          />
        ) : null}
        <TextAction label={t('onboarding.review.rankMore')} disabled={busy} onPress={() => void onRankMore()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16 },
});
