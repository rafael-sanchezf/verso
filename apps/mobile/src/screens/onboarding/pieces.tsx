/**
 * The small pieces every onboarding screen shares: the title block, the
 * header's progress bar and its `x`, and the bottom of the screen where the
 * primary action sits.
 *
 * Exported for the session screens too (batch-session.md: "B uses the same
 * header conventions"); `ProgressBar` is the 160 by 4 bar both headers draw.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, useTheme } from '@/ui';

/** "Let's set up Verso" over "What do you want to keep track of?" over the hint. */
export function TitleBlock({
  kicker,
  title,
  subtitle,
  align = 'left',
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}) {
  return (
    <View style={{ gap: 6 }}>
      {kicker ? (
        <Text size={15} color="text/secondary" align={align}>
          {kicker}
        </Text>
      ) : null}
      <Text size={28} weight={700} align={align} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text size={15} color="text/secondary" align={align}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** The header's bar: `bg/placeholder` track, `brand/primary` fill, 160 by 4. */
export function ProgressBar({ fraction, style }: { fraction: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, fraction));

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.colors['bg/placeholder'] },
        style,
      ]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, backgroundColor: theme.colors['brand/primary'] },
        ]}
      />
    </View>
  );
}

/**
 * The header row of the deck and the session: an `x` on the left with a 44pt
 * region, and the progress centered whatever the sides hold.
 */
export function ProgressHeader({
  onClose,
  closeLabel,
  fraction,
  caption,
}: {
  onClose: () => void;
  /** What the `x` does, for VoiceOver ("Done for now"). */
  closeLabel: string;
  fraction: number;
  caption: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.header, { paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        // 20pt glyph in a 44pt square.
        hitSlop={12}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Icon name="x" size={20} color="text/primary" />
      </Pressable>
      <View style={styles.progress} accessible accessibilityLabel={caption}>
        <ProgressBar fraction={fraction} />
        <Text size={13} color="text/secondary" align="center">
          {caption}
        </Text>
      </View>
      {/* Balances the `x` so the progress sits on the screen's centre. */}
      <View style={styles.close} />
    </View>
  );
}

/** The bottom of a step: its buttons, 16 above the home indicator. */
export function BottomActions({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          paddingHorizontal: theme.space[4],
          paddingTop: theme.space[3],
          paddingBottom: insets.bottom + theme.space[4],
          gap: theme.space[3],
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: 160, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.7 },
});
