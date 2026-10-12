/**
 * A score, on the tier ramp.
 *
 * The fill comes from `scoreColor` in `@verso/core`, which shades continuously
 * across the four tier colors rather than snapping to the tier, so a ranked
 * list reads as a gradient top to bottom (brick, brown, olive, forest). The
 * label is always `tier/label`, white, in both schemes: the four tier colors
 * are deep solids with one value for light and dark (decision 29, option A),
 * and white holds at least 5.8:1 on each of them and on every blend between
 * two neighbors.
 */

import { scoreColor, type TierPalette } from '@verso/core';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './text';
import { useTheme, type Theme } from './theme';

export interface ScoreBadgeProps {
  /** 0 to 10, from `scoreForPosition`. Never stored, always computed. */
  score: number;
  size?: 'regular' | 'small';
  style?: StyleProp<ViewStyle>;
}

/** The four tier colors for the current scheme, in the shape `scoreColor` wants. */
export function tierPalette(theme: Theme): TierPalette {
  return {
    loved: theme.colors['tier/loved'],
    liked: theme.colors['tier/liked'],
    fine: theme.colors['tier/fine'],
    disliked: theme.colors['tier/disliked'],
  };
}

export function ScoreBadge({ score, size = 'regular', style }: ScoreBadgeProps) {
  const theme = useTheme();
  const small = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: scoreColor(score, tierPalette(theme)),
          borderRadius: theme.radius.pill,
          paddingHorizontal: small ? theme.space[2] : 10,
          paddingVertical: small ? 3 : 5,
        },
        style,
      ]}>
      <Text size={small ? 12 : 15} weight={700} color="tier/label">
        {score.toFixed(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start' },
});
