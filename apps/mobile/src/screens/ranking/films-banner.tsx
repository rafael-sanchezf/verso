/**
 * Ranking for films: the banner and the empty state (frame `Ranking · To
 * rank` 265:135; movies-brief.md, "Ranking"; rule 35, watched is not ranked).
 *
 * The banner sits above the tools row when watched films have no ranking
 * yet, "14 watched films to rank ›", and opens the batch session over them
 * with the movie medium (tier first, then the comparisons, one review at the
 * end). The count and the rows are `played_not_ranked('movie')`, the same
 * drain the games banner reads.
 *
 * The empty state says what to do with films: rank the ones you have
 * watched, "Rank 14 films" when the banner would show, "Add a film" when
 * nothing is watched yet.
 */

import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { usePlayedNotRanked } from '@/screens/onboarding/session/queries';
import { startSession } from '@/screens/onboarding/session/session-store';
import { EmptyState, Pressed, Text, useTheme } from '@/ui';

/** "14 watched films to rank", "1 watched film to rank". */
export function filmsToRankLabel(count: number): string {
  return count === 1 ? '1 watched film to rank' : `${count} watched films to rank`;
}

function useOpenFilmSession() {
  const router = useRouter();
  const drain = usePlayedNotRanked('movie');
  const rows = drain.data ?? [];
  const open = () => {
    startSession({
      source: 'drain',
      medium: 'movie',
      items: rows.map((row) => ({ mediaItemId: row.mediaItemId, tier: null, row })),
      onDone: 'back',
    });
    router.push({ pathname: '/onboarding/session', params: { medium: 'movie' } });
  };
  return { count: rows.length, open };
}

export function FilmsBanner() {
  const theme = useTheme();
  const { count, open } = useOpenFilmSession();
  if (count === 0) return null;

  return (
    <View style={{ paddingHorizontal: theme.space[4], paddingBottom: 10 }}>
      <Pressed
        onPress={open}
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.md,
            paddingVertical: 12,
            paddingHorizontal: 14,
            gap: theme.space[3],
          },
        ]}>
        <View style={styles.text}>
          <Text size={15} weight={600}>
            {filmsToRankLabel(count)}
          </Text>
          <Text size={13} color="text/secondary">
            From your diary
          </Text>
        </View>
        <Text size={17} color="text/secondary">
          ›
        </Text>
      </Pressed>
    </View>
  );
}

export function FilmsEmpty() {
  const router = useRouter();
  const { count, open } = useOpenFilmSession();

  return (
    <View style={styles.area}>
      <EmptyState
        icon="trophy"
        title="Nothing ranked yet"
        body="Rank the films you've watched."
        action={
          count > 0
            ? { label: count === 1 ? 'Rank 1 film' : `Rank ${count} films`, onPress: open }
            : { label: 'Add a film', onPress: () => router.navigate('/search') }
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  area: { flex: 1, justifyContent: 'center', paddingBottom: 120 },
});
