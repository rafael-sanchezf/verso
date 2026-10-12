/**
 * Home: what you are playing, what is next, what is coming.
 *
 * Three blocks and nothing else (rule 3), three items to a block, and every one
 * of them one tap from the game page. The screen owns the medium switch, the
 * pull to refresh and the navigation; each block owns its own loading, error
 * and empty states, because two lists can be fine while the third is not and
 * the screen should show what it has.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { searchHref } from '@/screens/search/intent';
import { EmptyState, useTheme } from '@/ui';

import { ComingUpBlock } from './coming-up-block';
import { MediaSwitcher, mediumFor, type MediumDescriptor, type MediumKey } from './media-switcher';
import { PlayingBlock } from './playing-block';
import { homeState } from './rules';
import { UpNextBlock } from './up-next-block';
import { useHomeData, usePlayingActions } from './use-home-data';

export function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [medium, setMedium] = useState<MediumKey>('games');

  // "The switch is visual state that resets when the tab is left" (home.md).
  // The cleanup runs on blur, so coming back to Home is always coming back to
  // games — nobody returns to a tab they left in a mode with nothing in it.
  useFocusEffect(useCallback(() => () => setMedium('games'), []));

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
      <MediaSwitcher active={medium} onSelect={setMedium} />

      {medium === 'games' ? (
        <ScrollView
          contentContainerStyle={{
            paddingTop: theme.space[2],
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
        <MediumPlaceholder medium={mediumFor(medium)} />
      )}
    </SafeAreaView>
  );
}

/**
 * What the other three media have on Home until they have anything.
 *
 * Bare and centred rather than in a card, because it stands in for the whole
 * content area rather than for one block (shell.md, EmptyState). The tab bar
 * does not change: the tabs are the same five whichever medium is showing, and
 * this is a look ahead rather than a place to be.
 *
 * home.md writes the line as "{Books, Movies, TV} arrive after games." and
 * `EmptyState` takes a title and a body. Substituting the name into the
 * sentence and using it for both would say the name twice and, for one of the
 * three, say "TV arrive"; so the name is the title and the body is the rest of
 * the spec's own sentence. Listed in the PR.
 */
function MediumPlaceholder({ medium }: { medium: MediumDescriptor }) {
  return (
    <View style={styles.placeholder}>
      <EmptyState icon={medium.icon} title={medium.label} body="Arrives after games." />
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
