/**
 * One of the two cards in a comparison: a cover, a title, a line saying what
 * the game is to the user, and the genre cue when there is one.
 *
 * The press feedback is a short scale rather than the shared `Pressed` dim,
 * because these two cards are the answer itself: the card has to feel picked
 * up, not switched off (specs/log-flow.md, step 2).
 */

import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Cover, Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import type { LogGame } from './game';
import { GenreTag } from './pieces';

/** Points. The frame's cover width inside a comparison card. */
const COVER_WIDTH = 140;

export interface CompareCardProps {
  game: LogGame;
  /** "just finished", or "ranked #4 · 8.9". */
  subtitle: string;
  /** `genreCue(state, language)`; nothing renders when it is null. */
  cue: string | null;
  onPress: () => void;
  disabled?: boolean;
}

export function CompareCard({ game, subtitle, cue, onPress, disabled = false }: CompareCardProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${game.title}, ${subtitle}`}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 140 });
      }}
      style={styles.pressable}>
      <Animated.View
        style={[
          styles.card,
          animated,
          {
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.lg,
            padding: theme.space[3],
            gap: theme.space[2],
          },
        ]}>
        <Cover
          width={COVER_WIDTH}
          radius={10}
          candidates={game.candidates}
          accessibilityLabel={game.title}
        />
        <Text size={16} weight={600} align="center" numberOfLines={1}>
          {game.title}
        </Text>
        <Text size={13} color="text/secondary" align="center" numberOfLines={1}>
          {subtitle}
        </Text>
        {cue ? <GenreTag label={cue} /> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { flex: 1 },
  card: { flex: 1, alignItems: 'center' },
});
