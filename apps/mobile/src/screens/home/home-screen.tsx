/**
 * Home: what you are playing, what is next, what is coming.
 *
 * Three blocks and nothing else (rule 3), three items to a block, and every one
 * of them one tap from the game page. The screen owns the medium switch, the
 * pull to refresh and the navigation; each block owns its own loading, error
 * and empty states, because two lists can be fine while the third is not and
 * the screen should show what it has.
 *
 * Above the blocks, under the switcher, the ask button opens the question
 * sheet (`/ask`, movies-build.md PR 3) for games and movies alike; on movies
 * it sits over the placeholder until the rows by reason land.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { askQuestion } from '@/screens/ask/trace';
import { searchHref } from '@/screens/search/intent';
import { useActiveMedium } from '@/state/medium';
import { EmptyState, useTheme } from '@/ui';

import { AskButton } from './ask-button';
import { ComingUpBlock } from './coming-up-block';
import { MediaSwitcher } from './media-switcher';
import { PlayingBlock } from './playing-block';
import { homeState } from './rules';
import { UpNextBlock } from './up-next-block';
import { useHomeData, usePlayingActions } from './use-home-data';

export function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  // The app's active medium (state/medium.ts). It used to be Home's own state
  // and reset to games when the tab was left (home.md); since the movies build
  // every tab reads it, so it stays where the person put it (movies-build.md,
  // PR 2, item 1).
  const { medium } = useActiveMedium();

  const data = useHomeData();
  const actions = usePlayingActions();

  const openGame = useCallback(
    (id: string) => router.push({ pathname: '/game/[id]', params: { id, from: 'Home' } }),
    [router],
  );
  // `navigate` rather than `push` for the tabs: pushing a tab onto the stack
  // would leave the tab bar showing one thing and the screen another.
  const goToBacklog = useCallback(() => router.navigate('/next'), [router]);
  const goToSearch = useCallback(() => router.navigate('/search'), [router]);
  // "Search a new game" on the empty Playing card: Search for that one visit
  // marks a result Playing in one tap and comes back here.
  const searchNewGame = useCallback(() => router.navigate(searchHref('playing')), [router]);
  // The ask (movies-build.md, PR 3): both live media have one, and the active
  // medium is always a live one (state/medium.ts).
  const openAsk = useCallback(
    () => router.push({ pathname: '/ask', params: { medium } }),
    [medium, router],
  );

  // Only once all three have answered. A screen that has read nothing yet is
  // not a first run, and showing the welcome card to someone with a backlog
  // while their backlog loads is worse than showing them a skeleton.
  const firstRun =
    data.playing.isSuccess &&
    data.upNext.isSuccess &&
    data.comingUp.isSuccess &&
    homeState({
      playing: data.playing.data.length,
      upNext: data.upNext.data.length,
      comingUp: data.comingUp.data.length,
    }) === 'first-run';

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <MediaSwitcher />
      <AskButton label={askQuestion(medium)} onPress={openAsk} />

      {medium === 'game' ? (
        <ScrollView
          contentContainerStyle={{
            // The site's 20 between the ask button and the first block.
            paddingTop: theme.space[5],
            paddingBottom: theme.space[6],
            gap: theme.space[6],
          }}
          refreshControl={
            <RefreshControl
              refreshing={data.refreshing}
              onRefresh={data.refresh}
              tintColor={theme.colors['text/secondary']}
            />
          }>
          <PlayingBlock
            query={data.playing}
            firstRun={firstRun}
            // The Up next read, which is the backlog; no read of its own.
            backlog={data.upNext.isSuccess ? data.upNext.data.length : null}
            actions={actions}
            onPickFromBacklog={goToBacklog}
            onSearchNew={searchNewGame}
          />
          <UpNextBlock
            query={data.upNext}
            onSeeAll={goToBacklog}
            onSearch={goToSearch}
            onOpenGame={openGame}
          />
          <ComingUpBlock query={data.comingUp} onOpenGame={openGame} />
        </ScrollView>
      ) : (
        <MoviesHomePlaceholder onOpenWatchlist={goToBacklog} />
      )}
    </SafeAreaView>
  );
}

/**
 * Movies Home until its rows land.
 *
 * Decision 28's rows by reason come from `movie_home_rows` (PR 1's read in
 * the movies build); the ask button above already works (PR 3). Until the
 * rows land Home says so plainly and points at the Watchlist, which is real. Bare and centred, as an `EmptyState` that stands
 * in for the whole content area (shell.md).
 */
function MoviesHomePlaceholder({ onOpenWatchlist }: { onOpenWatchlist: () => void }) {
  return (
    <View style={styles.placeholder}>
      <EmptyState
        icon="film"
        title="Our recommendations arrive here soon"
        body="Your watchlist and calendar are ready now."
        action={{ label: 'Open Watchlist', onPress: onOpenWatchlist }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    // The list area's own centre rather than the screen's, so the block does
    // not sit under the tab bar (shell.md).
    paddingBottom: 120,
  },
});
