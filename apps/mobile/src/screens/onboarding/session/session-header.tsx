/**
 * The session's top row (specs/batch-session.md, "The session"): the `x` on
 * the left, and centred on the row a 160 by 4 progress bar with one line
 * under it, "About 6 more to place everything" during the comparisons and
 * "3 of 8" during the tier pass.
 *
 * The bar is the deck page's (onboarding.md): a `bg/placeholder` track and a
 * `brand/primary` fill. A blank column the width of the `x` balances it on the
 * right so the bar sits on the row's true midpoint, as the log flow's top row
 * does. No native header: the onboarding stack draws none, and this row is
 * the screen's own.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Icon, Skeleton, Text, useTheme } from '@/ui';

const BAR_WIDTH = 160;
const BAR_HEIGHT = 4;
/** The `x` is drawn at 20 and reached through a 44pt region. */
const CLOSE_SIZE = 20;
const CLOSE_SLOP = (44 - CLOSE_SIZE) / 2;

export interface SessionHeaderProps {
  /** 0 to 1. */
  fill: number;
  /** The line under the bar; null while there is nothing to count yet (a skeleton line). */
  label: string | null;
  /** What VoiceOver says the `x` does. */
  closeLabel: string;
  onClose: () => void;
}

export function SessionHeader({ fill, label, closeLabel, onClose }: SessionHeaderProps) {
  const t = useT();
  const theme = useTheme();
  const clamped = Math.min(Math.max(fill, 0), 1);

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: theme.space[4], paddingBottom: theme.space[2], paddingTop: theme.space[2] },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        hitSlop={CLOSE_SLOP}
        onPress={onClose}
        style={({ pressed }) => [styles.side, pressed && styles.pressed]}>
        <Icon name="x" size={CLOSE_SIZE} />
      </Pressable>

      <View style={[styles.center, { gap: theme.space[2] }]}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={label ?? t('onboarding.session.progress')}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
          style={[styles.track, { backgroundColor: theme.colors['bg/placeholder'] }]}>
          <View
            style={[
              styles.fill,
              { width: BAR_WIDTH * clamped, backgroundColor: theme.colors['brand/primary'] },
            ]}
          />
        </View>
        {label === null ? (
          <Skeleton width={180} height={13} radius={4} style={styles.labelSkeleton} />
        ) : (
          <Text size={13} color="text/secondary" align="center" numberOfLines={1}>
            {label}
          </Text>
        )}
      </View>

      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  side: { width: CLOSE_SIZE },
  pressed: { opacity: 0.7 },
  center: { flex: 1, alignItems: 'center' },
  track: { width: BAR_WIDTH, height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' },
  fill: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2 },
  // The 13pt line's height, so the row does not jump when the count arrives.
  labelSkeleton: { marginVertical: 2.5 },
});
