/**
 * The large title four tabs share, and the chip that sits beside it.
 *
 * Drawn rather than taken from the native stack header: the frames put the
 * medium chip on the title's baseline and keep the title at rest, and a native
 * large title would collapse on scroll with the chip in the navigation bar
 * instead. Rule 7 allows the collapsing version as a convention — it is worth
 * revisiting once the screens have real content to scroll — but it is not what
 * the frames show, so this is what ships.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';

export interface ScreenHeaderProps {
  title: string;
  /** The MediumChip on Search, Ranking and Next; the settings icon on Profile. */
  right?: ReactNode;
  /** 12 by default; 8 on Profile, 10 on the Ranking list. */
  paddingBottom?: number;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({ title, right, paddingBottom = 12, style }: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: theme.space[4], paddingBottom, gap: theme.space[3] },
        style,
      ]}>
      <Text style="large-title" numberOfLines={1} layout={styles.title}>
        {title}
      </Text>
      {right}
    </View>
  );
}

/**
 * "Games", with its dot. Which medium you are in, at a glance (rule 4).
 *
 * Static in V0: the app only has games, and the switcher that changes it lives
 * on Home alone (open question 8). The dot is the brand text color, the same
 * for every medium (decision 29: no color per medium); the label says which.
 */
export function MediumChip({ label = 'Games' }: { label?: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.pill,
          paddingLeft: theme.space[2],
          paddingRight: 10,
          paddingVertical: theme.space[1],
          gap: 6,
        },
      ]}>
      <View style={[styles.dot, { backgroundColor: theme.colors['brand/text'] }]} />
      <Text size={13} weight={600}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    // Sits on the title's baseline rather than centred against 41pt of it.
    marginBottom: 6,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
