/**
 * What a failed read leaves behind: one quiet line, and the one thing worth
 * offering.
 *
 * specs/README.md defines it for every screen in one line — "one line in
 * `text/secondary` with a 'Retry' text button" — and never draws it, so
 * Phase 2's screen branches each built their own: `ErrorLine` in
 * `screens/game/states.tsx`, `screens/log/pieces.tsx`,
 * `screens/profile/loading-error.tsx` and `screens/search/placeholders.tsx`,
 * and `BlockError` in `screens/home/block.tsx`. Five copies that had drifted
 * to two text sizes and two Retry colours. This is the one.
 *
 * One line and never a modal or a whole-screen error: on Home two of the three
 * lists can be fine while the third is not, and the screen should show what it
 * has (rule 9, say what you don't know). A network blip is not an event, and a
 * red panel would make it one.
 *
 * The message says what could not be loaded, never what the server said: a
 * PostgREST error code is not an explanation, and the only useful action is
 * the same one either way.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useT } from '@/lib/i18n';

import { TextButton } from './button';
import { Text } from './text';
import { useTheme } from './theme';

export interface ErrorLineProps {
  message: string;
  /** Omitted, the line stands alone: some reads have nothing to retry into. */
  onRetry?: () => void;
  /**
   * `start` (the default) puts the line on the left and the Retry at the right
   * edge. `center` groups them in the middle, for a state that stands in for a
   * whole screen rather than for one row.
   */
  align?: 'start' | 'center';
  style?: StyleProp<ViewStyle>;
}

export function ErrorLine({ message, onRetry, align = 'start', style }: ErrorLineProps) {
  const t = useT();
  const theme = useTheme();
  const centered = align === 'center';

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.row,
        { gap: theme.space[3] },
        centered ? styles.centered : undefined,
        style,
      ]}>
      {/*
        The message takes the space the Retry does not, so a long line wraps
        rather than pushing the button off the edge; centred, it hugs instead.
      */}
      <Text size={15} color="text/secondary" layout={centered ? styles.shrink : styles.fill}>
        {message}
      </Text>
      {onRetry ? <TextButton label={t('shell.errorLine.retry')} onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  centered: { justifyContent: 'center', flexWrap: 'wrap' },
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
});
