/**
 * The Backlog row's "Start" control: a bare `play` icon in a `bg/surface`
 * pill (docs/design/specs/next.md, "Backlog segment": "padding 10 sides 5
 * vertical, `play` 14"). No label.
 *
 * Neither shared primitive fits: `Button` always renders a label, and `Chip`
 * is a label-only pill too, so an icon-only control this small is built here
 * rather than adapted from either — noted in the PR per the brief ("build
 * what you need inside your screen folder").
 */

import { Pressable, StyleSheet } from 'react-native';

import { useT } from '@/lib/i18n';
import { Icon } from '@/ui';
import { useTheme } from '@/ui/theme';

export interface StartButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function StartButton({ onPress, disabled = false }: StartButtonProps) {
  const t = useT();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('lists.next.startPlaying')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.pill,
          paddingHorizontal: 10,
          paddingVertical: 5,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}>
      <Icon name="play" size={14} color="text/primary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { alignItems: 'center', justifyContent: 'center' },
});
