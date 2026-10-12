/**
 * Ranking's empty state as two doors into bulk entry (specs/onboarding.md,
 * "The doors", frame 105:35): the returning user's way into the same tool the
 * new user was walked through, without the media, platforms and seeds steps.
 *
 * "Rank popular games" opens the deck page as a returning user
 * (`?from=ranking`, whose `x` comes back here); "I know what I played" opens
 * Search in the add-many intent, straight into the session from there.
 *
 * The `EmptyState` block draws the icon and the words; the two buttons are
 * full buttons 300 wide, as the frame draws them, rather than the block's own
 * hugging small actions.
 */

import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { searchHref } from '@/screens/search/intent';
import { Button, EmptyState, useTheme } from '@/ui';

export function RankingDoors() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={styles.area}>
      <EmptyState
        icon="trophy"
        title="Nothing ranked yet"
        body="Two ways to start."
        style={{ paddingBottom: theme.space[4] }}
      />
      <View style={[styles.buttons, { gap: 10 }]}>
        <Button
          label="Rank popular games"
          onPress={() => router.push({ pathname: '/onboarding/deck', params: { from: 'ranking' } })}
        />
        <Button label="I know what I played" variant="secondary" onPress={() => router.navigate(searchHref('addmany'))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 120,
  },
  buttons: { width: 300, alignSelf: 'center' },
});
