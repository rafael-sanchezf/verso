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
import { Button, EmptyState, EmptyStateCard, ErrorLine, SegmentedControl, Skeleton, Text, useTheme } from '@/ui';

import { diaryDates, filmCount, reviewHeadline, rowFacts, type ReviewFilm } from './model';
import { ReviewList } from './review-list';
import { useLetterboxdImport } from './use-letterboxd-import';

type Mode = 'watched' | 'rank';

const MODES = [
  { value: 'watched', label: 'Mark watched' },
  { value: 'rank', label: 'Rank from my stars' },
] as const;

export function LetterboxdImportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const flow = useLetterboxdImport();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const step = flow.step;
  const list = step.kind === 'review' || step.kind === 'saving' ? step.list : null;
  const facts = useMemo(() => (list ? rowFacts(list) : new Map()), [list]);

  if (step.kind === 'pick' || step.kind === 'reading') {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: theme.space[4], gap: theme.space[5] }}>
          <View style={{ gap: theme.space[2] }}>
            <Text style="title-2">Bring your films over</Text>
            <Text size={15} color="text/secondary">
              Every film you logged on Letterboxd is marked watched, with each date in your diary. Watched is not
              ranked: you rank them when you like. If you want, your star ratings can place them as a first draft
              you check before anything is saved.
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors['bg/surface'], padding: theme.space[4], gap: theme.space[3] },
            ]}>
            <Step n={1} text="In Letterboxd, open Settings, then Import & Export, then Export your data." />
            <Step n={2} text="Letterboxd emails you a zip. Open it in Files; it unzips with a tap." />
            <Step n={3} text="Choose ratings.csv and diary.csv from inside it. Both at once is best." />
          </View>

          {flow.error ? <ErrorLine message={flow.error} align="start" /> : null}

          {step.kind === 'reading' ? (
            <View style={{ gap: theme.space[3] }} accessibilityLabel="Reading your files">
              <Text size={15} color="text/secondary">
                Matching your films to the catalog…
              </Text>
              <Skeleton width="100%" height={52} radius={8} />
              <Skeleton width="100%" height={52} radius={8} />
              <Skeleton width="100%" height={52} radius={8} />
            </View>
          ) : (
            <Button label="Choose files" variant="primary" onPress={() => void flow.choose()} />
          )}

          <Text size={13} color="text/secondary">
            Nothing is saved until you confirm on the next screen.
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
              title={ranked ? `${filmCount(result.ranked)} ranked` : `${filmCount(result.watched)} marked watched`}
              body={doneBody(result.watched, result.diary, result.unmatched, ranked)}
              action={{ label: 'Done', onPress: () => router.back() }}
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
    alert('Discard this import?', 'Nothing has been saved, and the films you moved go back to where the stars put them.', [
      { text: 'Keep reviewing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: flow.reset },
    ]);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]} edges={['bottom']}>
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: theme.space[4], gap: theme.space[5] }}
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: theme.space[2] }}>
          <Text style="title-2">Look right?</Text>
          <Text size={15} color="text/secondary">
            {reviewHeadline(review, rank)}
          </Text>
          {dates > 0 ? (
            <Text size={13} color="text/secondary">
              {`${dates} ${dates === 1 ? 'watch goes' : 'watches go'} into your diary with the day you logged ${dates === 1 ? 'it' : 'them'}.`}
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
              segments={MODES}
              value={rank ? 'rank' : 'watched'}
              onChange={(mode) => flow.setRank(mode === 'rank')}
            />
            <Text size={13} color="text/secondary">
              {rank
                ? `A star rating is not a comparison, so this is a draft: ratings set it, ties are in the order you watched them. Hold ≡ and drag to move a film, across a tier line to change its tier.${
                    review.fuzzy > 0
                      ? ` ${review.fuzzy} ${review.fuzzy === 1 ? 'film was' : 'films were'} matched by a close title and ${review.fuzzy === 1 ? 'shows' : 'show'} the name from your file underneath.`
                      : ''
                  }`
                : `${filmCount(review.rated.length)} ${review.rated.length === 1 ? 'has' : 'have'} a star rating. They are marked watched and wait to be ranked; turn on Rank from my stars to place them from the ratings instead.`}
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
          title={rank ? `Watched, not ranked (${review.watched.length})` : `Marked watched (${total})`}
          hint={
            rank
              ? 'No rating on Letterboxd. They are marked watched and wait to be ranked.'
              : 'Watched is not ranked: these wait to be ranked, whenever you like.'
          }
          films={rank ? review.watched : [...review.rated, ...review.watched]}
        />
        <FilmSection
          title={`Not in the catalog (${review.unmatched.length})`}
          hint="Nothing will be written for these. The catalog grows; try again later or add them by search."
          films={review.unmatched}
        />
        <FilmSection
          title={`Already in your ranking (${review.skipped.length})`}
          hint="Your own placement stays; the file's rating is ignored."
          films={review.skipped}
        />
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[3], gap: theme.space[3] }}>
        {flow.error ? <ErrorLine message={flow.error} align="start" /> : null}
        <Button
          label={saving ? 'Importing…' : rank ? `Confirm ranking and import ${filmCount(total)}` : `Mark ${filmCount(total)} watched`}
          variant="primary"
          disabled={saving || total === 0}
          onPress={() => void flow.confirm()}
        />
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={cancel} />
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
            and {more} more
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function doneBody(watched: number, diary: number, unmatched: number, ranked: boolean): string {
  const parts: string[] = [];
  if (ranked && watched > 0) parts.push(`${filmCount(watched)} marked watched, waiting to be ranked.`);
  if (!ranked && watched > 0) parts.push('Watched, not ranked: they wait to be ranked whenever you like.');
  if (diary > 0) parts.push(`${diary} ${diary === 1 ? 'watch' : 'watches'} added to your diary.`);
  if (unmatched > 0) parts.push(`${filmCount(unmatched)} not found in the catalog.`);
  return parts.join(' ');
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderRadius: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNumber: { width: 18 },
  stepText: { flex: 1 },
});
