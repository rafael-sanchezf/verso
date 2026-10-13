/**
 * Import from Letterboxd: pick the files, review, confirm.
 *
 * Coded from conventions rather than drawn (Rafa, 2026-10-01: "can you try to
 * build it"); the layout follows Settings, and the draft list follows the
 * batch session's review. Three states on one pushed screen:
 *
 *   pick     how to get the export, and the button that opens the picker
 *   review   what will happen, the choice to rank from the stars (off by
 *            default), the draft when it is on, the films that will be
 *            watched, the ones the catalog does not have; the confirm and
 *            Cancel in a footer that never scrolls away
 *   done     the counts, and Done
 *
 * The rule the screen keeps (rule 35, ROADMAP.md decision 35): watched is not
 * ranked. The default marks every film watched, its dates in the diary, and
 * ranks nothing. Ranking from the stars is the user's choice, shown in full as
 * a draft that can be dragged, and written only on its own confirm.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { useT, type TranslationKey } from '@/lib/i18n';
import { Button, EmptyState, EmptyStateCard, ErrorLine, SegmentedControl, Skeleton, Text, useTheme } from '@/ui';

import { diaryDates, filmCount, reviewHeadline, rowFacts, type ReviewFilm, type Say } from './model';
import { ReviewList } from './review-list';
import { useLetterboxdImport } from './use-letterboxd-import';

type Mode = 'watched' | 'rank';

export function LetterboxdImportScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const flow = useLetterboxdImport();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const step = flow.step;
  const list = step.kind === 'review' || step.kind === 'saving' ? step.list : null;
  const facts = useMemo(() => (list ? rowFacts(list) : new Map()), [list]);
  const modes = useMemo(
    () =>
      [
        { value: 'watched', label: t('profile.letterboxd.review.modeWatched') },
        { value: 'rank', label: t('profile.letterboxd.review.modeRank') },
      ] as const,
    [t],
  );

  if (step.kind === 'pick' || step.kind === 'reading') {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: theme.space[4], gap: theme.space[5] }}>
          <View style={{ gap: theme.space[2] }}>
            <Text style="title-2">{t('profile.letterboxd.pick.title')}</Text>
            <Text size={15} color="text/secondary">
              {t('profile.letterboxd.pick.lead')}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors['bg/surface'], padding: theme.space[4], gap: theme.space[3] },
            ]}>
            <Step n={1} text={t('profile.letterboxd.pick.step1')} />
            <Step n={2} text={t('profile.letterboxd.pick.step2')} />
            <Step n={3} text={t('profile.letterboxd.pick.step3')} />
          </View>

          {flow.error ? <ErrorLine message={flow.error} align="start" /> : null}

          {step.kind === 'reading' ? (
            <View style={{ gap: theme.space[3] }} accessibilityLabel={t('profile.letterboxd.pick.reading')}>
              <Text size={15} color="text/secondary">
                {t('profile.letterboxd.pick.matching')}
              </Text>
              <Skeleton width="100%" height={52} radius={8} />
              <Skeleton width="100%" height={52} radius={8} />
              <Skeleton width="100%" height={52} radius={8} />
            </View>
          ) : (
            <Button label={t('profile.letterboxd.pick.chooseFiles')} variant="primary" onPress={() => void flow.choose()} />
          )}

          <Text size={13} color="text/secondary">
            {t('profile.letterboxd.pick.nothingSaved')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step.kind === 'done') {
    const { result, ranked } = step;
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]} edges={['bottom']}>
        <View style={[styles.fill, { padding: theme.space[4], justifyContent: 'center' }]}>
          <EmptyStateCard>
            <EmptyState
              icon="film"
              title={
                ranked
                  ? counted(result.ranked, 'profile.letterboxd.done.rankedOne', 'profile.letterboxd.done.rankedMany', t)
                  : counted(
                      result.watched,
                      'profile.letterboxd.done.markedWatchedOne',
                      'profile.letterboxd.done.markedWatchedMany',
                      t,
                    )
              }
              body={doneBody(result.watched, result.diary, result.unmatched, ranked, t)}
              action={{ label: t('profile.letterboxd.done.button'), onPress: () => router.back() }}
            />
          </EmptyStateCard>
        </View>
      </SafeAreaView>
    );
  }

  // review or saving
  const { review, notes, choice } = step;
  const saving = step.kind === 'saving';
  const rank = choice.rank;
  const total = review.rated.length + review.watched.length;
  const dates = diaryDates(review);

  // Leaving a draft the user has worked on asks first, as the batch session does.
  const cancel = () => {
    if (!rank || choice.moved.size === 0) {
      flow.reset();
      return;
    }
    alert(t('profile.letterboxd.review.discardTitle'), t('profile.letterboxd.review.discardMessage'), [
      { text: t('profile.letterboxd.review.keepReviewing'), style: 'cancel' },
      { text: t('profile.letterboxd.review.discard'), style: 'destructive', onPress: flow.reset },
    ]);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]} edges={['bottom']}>
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: theme.space[4], gap: theme.space[5] }}
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: theme.space[2] }}>
          <Text style="title-2">{t('profile.letterboxd.review.title')}</Text>
          <Text size={15} color="text/secondary">
            {reviewHeadline(review, t, rank)}
          </Text>
          {dates > 0 ? (
            <Text size={13} color="text/secondary">
              {counted(dates, 'profile.letterboxd.review.diaryOne', 'profile.letterboxd.review.diaryMany', t)}
            </Text>
          ) : null}
          {notes.map((note) => (
            <Text key={note} size={12} color="text/secondary">
              {note}
            </Text>
          ))}
        </View>

        {review.rated.length > 0 ? (
          <View style={{ gap: theme.space[2] }}>
            <SegmentedControl<Mode>
              segments={modes}
              value={rank ? 'rank' : 'watched'}
              onChange={(mode) => flow.setRank(mode === 'rank')}
            />
            <Text size={13} color="text/secondary">
              {rank
                ? [
                    t('profile.letterboxd.review.rankHint'),
                    ...(review.fuzzy > 0
                      ? [counted(review.fuzzy, 'profile.letterboxd.review.fuzzyOne', 'profile.letterboxd.review.fuzzyMany', t)]
                      : []),
                  ].join(' ')
                : counted(
                    review.rated.length,
                    'profile.letterboxd.review.watchedHintOne',
                    'profile.letterboxd.review.watchedHintMany',
                    t,
                  )}
            </Text>
          </View>
        ) : null}

        {rank && list ? (
          <ReviewList
            list={list}
            facts={facts}
            moved={choice.moved}
            scrollableRef={scrollRef}
            onDrop={flow.setList}
            sortEnabled={!saving}
          />
        ) : null}

        <FilmSection
          title={
            rank
              ? t('profile.letterboxd.review.watchedNotRanked', { count: review.watched.length })
              : t('profile.letterboxd.review.markedWatched', { count: total })
          }
          hint={
            rank
              ? t('profile.letterboxd.review.watchedNotRankedHint')
              : t('profile.letterboxd.review.markedWatchedHint')
          }
          films={rank ? review.watched : [...review.rated, ...review.watched]}
        />
        <FilmSection
          title={t('profile.letterboxd.review.notInCatalog', { count: review.unmatched.length })}
          hint={t('profile.letterboxd.review.notInCatalogHint')}
          films={review.unmatched}
        />
        <FilmSection
          title={t('profile.letterboxd.review.alreadyRanked', { count: review.skipped.length })}
          hint={t('profile.letterboxd.review.alreadyRankedHint')}
          films={review.skipped}
        />
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[3], gap: theme.space[3] }}>
        {flow.error ? <ErrorLine message={flow.error} align="start" /> : null}
        <Button
          label={
            saving
              ? t('profile.letterboxd.review.importing')
              : rank
                ? t('profile.letterboxd.review.confirmRank', { films: filmCount(total, t) })
                : counted(total, 'profile.letterboxd.review.confirmWatchedOne', 'profile.letterboxd.review.confirmWatchedMany', t)
          }
          variant="primary"
          disabled={saving || total === 0}
          onPress={() => void flow.confirm()}
        />
        <Button label={t('profile.letterboxd.review.cancel')} variant="secondary" disabled={saving} onPress={cancel} />
      </View>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.step, { gap: theme.space[3] }]}>
      <Text size={15} weight={700} color="text/secondary" layout={styles.stepNumber}>
        {n}
      </Text>
      <Text size={15} layout={styles.stepText}>
        {text}
      </Text>
    </View>
  );
}

function FilmSection({ title, hint, films }: { title: string; hint: string; films: readonly ReviewFilm[] }) {
  const t = useT();
  const theme = useTheme();
  if (films.length === 0) return null;

  const shown = films.slice(0, 12);
  const more = films.length - shown.length;

  return (
    <View style={{ gap: theme.space[2] }}>
      <Text style="headline">{title}</Text>
      <Text size={13} color="text/secondary">
        {hint}
      </Text>
      <View style={{ gap: 4 }}>
        {shown.map((entry) => (
          <Text key={entry.film.key} size={15} numberOfLines={1}>
            {entry.match?.title ?? entry.film.title}
            {entry.film.year !== null ? ` (${entry.film.year})` : ''}
          </Text>
        ))}
        {more > 0 ? (
          <Text size={13} color="text/secondary">
            {t('profile.letterboxd.review.andMore', { count: more })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** One sentence for one and another for several, each with `{count}`. */
function counted(n: number, one: TranslationKey, many: TranslationKey, t: Say): string {
  return n === 1 ? t(one) : t(many, { count: n });
}

function doneBody(watched: number, diary: number, unmatched: number, ranked: boolean, t: Say): string {
  const parts: string[] = [];
  if (ranked && watched > 0) {
    parts.push(counted(watched, 'profile.letterboxd.done.watchedWaitingOne', 'profile.letterboxd.done.watchedWaitingMany', t));
  }
  if (!ranked && watched > 0) parts.push(t('profile.letterboxd.done.watchedNotRanked'));
  if (diary > 0) parts.push(counted(diary, 'profile.letterboxd.done.diaryOne', 'profile.letterboxd.done.diaryMany', t));
  if (unmatched > 0) {
    parts.push(counted(unmatched, 'profile.letterboxd.done.notFoundOne', 'profile.letterboxd.done.notFoundMany', t));
  }
  return parts.join(' ');
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderRadius: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNumber: { width: 18 },
  stepText: { flex: 1 },
});
