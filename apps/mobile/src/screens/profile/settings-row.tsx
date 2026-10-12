/**
 * Settings is not drawn in the fidelity round, so its layout is coded from
 * convention (profile.md, "Behavior"): an iOS grouped list, `bg/surface`
 * cards holding rows with hairline separators between them.
 *
 * "Sign out in destructive red" (profile.md) is `text/destructive`: #BB0A10 in
 * light and iOS's dark-mode red #FF453A in dark, so it holds 4.5:1 on the
 * grouped card in both (tier/disliked stood in for it until 2026-10-08, and is
 * the verdict color only).
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon, Pressed, Text, textStyles } from '@/ui';
import { useTheme } from '@/ui/theme';

export interface SettingsRowSpec {
  key: string;
  label: string;
  /** A static value on the right (the email, the app version) rather than a chevron. */
  value?: string;
  /** Sign out. Red label, no chevron, no value. */
  destructive?: boolean;
  /** Shows the trailing chevron for a row that navigates or opens a sheet. */
  navigates?: boolean;
  busy?: boolean;
  onPress?: () => void;
}

export function SettingsRow({ label, value, destructive, navigates, busy, onPress }: SettingsRowSpec) {
  const theme = useTheme();

  return (
    <Pressed
      onPress={onPress}
      disabled={!onPress || busy}
      style={[styles.row, { paddingHorizontal: theme.space[4], paddingVertical: 12, gap: theme.space[3] }]}>
      <Text size={17} color={destructive ? 'text/destructive' : 'text/primary'} layout={textStyles.fill}>
        {label}
      </Text>
      {trailing({ value, navigates, busy })}
    </Pressed>
  );
}

function trailing({ value, navigates, busy }: Pick<SettingsRowSpec, 'value' | 'navigates' | 'busy'>): ReactNode {
  if (busy) return <ActivityIndicator />;
  if (value) {
    return (
      <Text size={17} color="text/secondary" numberOfLines={1}>
        {value}
      </Text>
    );
  }
  if (navigates) return <Icon name="chevron-right" size={18} color="text/secondary" />;
  return null;
}

export function Separator() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.separator,
        { backgroundColor: theme.colors['border/separator'], marginLeft: theme.space[4] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  separator: { height: StyleSheet.hairlineWidth },
});
