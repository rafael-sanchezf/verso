/**
 * Home. For games: what you are playing, what is next, what is coming. For
 * movies: the rows by reason (decision 28, `movies-home.tsx`).
 *
 * Games Home is three blocks and nothing else (rule 3), three items to a
 * block, and every one of them one tap from the game page. The screen owns the medium switch, the
 * pull to refresh and the navigation; each block owns its own loading, error
 * and empty states, because two lists can be fine while the third is not and
 * the screen should show what it has.
 *
 * Above the blocks, under the switcher, the ask button opens the question
 * sheet (`/ask`, movies-build.md PR 3) for games and movies alike; on movies
 * the rows by reason sit under it (PR 7).
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { askQuestion } from '@/screens/ask/trace';
import { searchHref } from '@/screens/search/intent';
import { useLayout } from '@/lib/use-layout';
import { useActiveMedium } from '@/state/medium';
import { useTheme } from '@/ui';
import { Pane, PaneRow } from '@/ui/pane';

import { AskButton } from './ask-button';
import { ComingUpBlock } from './coming-up-block';
import { MediaSwitcher } from './media-switcher';
import { MoviesHome } from './movies-home';
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

  // The inner display of the iPhone Duo, or any regular window: Playing on
  // the left, Up next over Coming up on the right, the seam at the middle so
  // the fold falls on it (duo-brief.md, "The inner display"). Three blocks
  // still (rule 3); only their arrangement changes.
  const panes = useLayout().width === 'regular';

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
          {(() => {
            const playing = (
              <PlayingBlock
                query={data.playing}
                firstRun={firstRun}
                // The Up next read, which is the backlog; no read of its own.
                backlog={data.upNext.isSuccess ? data.upNext.data.length : null}
                actions={actions}
                onPickFromBacklog={goToBacklog}
                onSearchNew={searchNewGame}
              />
            );
            const upNext = (
              <UpNextBlock
                query={data.upNext}
                onSeeAll={goToBacklog}
                onSearch={goToSearch}
                onOpenGame={openGame}
              />
            );
            const comingUp = <ComingUpBlock query={data.comingUp} onOpenGame={openGame} />;
            if (!panes) {
              return (
                <>
                  {playing}
                  {upNext}
                  {comingUp}
                </>
              );
            }
            return (
              <PaneRow>
                <Pane>{playing}</Pane>
                <Pane style={{ gap: theme.space[6] }}>
                  {upNext}
                  {comingUp}
                </Pane>
              </PaneRow>
            );
          })()}
        </ScrollView>
      ) : (
        <MoviesHome />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
