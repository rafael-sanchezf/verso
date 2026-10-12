/**
 * One of the four tiles in Profile's stats row: Ranked, Backlog, Upcoming,
 * Friends. `bg/surface`, radius 12, vertical padding 10, centered, gap 2:
 * value 20 bold, label 12 `text/secondary` (profile.md, "Layout").
 *
 * 20 bold is off the type ramp (`title-3` is 20/600, not 20/700), so this
 * sets size and weight explicitly rather than naming a ramp style, the way
 * `src/ui/text.tsx` says an off-ramp combination should be written.
 */

import { StyleSheet } from 'react-native';

import { Pressed, Text } from '@/ui';
import { useTheme } from '@/ui/theme';

export interface StatTileProps {
  value: string;
  label: string;
  onPress?: () => void;
}

export function StatTile({ value, label, onPress }: StatTileProps) {
  const theme = useTheme();

  return (
    <Pressed
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.md, paddingVertical: 10, gap: 2 },
      ]}>
      <Text size={20} weight={700} align="center" numberOfLines={1}>
        {value}
      </Text>
      <Text size={12} color="text/secondary" align="center" numberOfLines={1}>
        {label}
      </Text>
    </Pressed>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, alignItems: 'center' },
});
