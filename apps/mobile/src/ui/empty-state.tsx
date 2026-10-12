/**
 * What a screen shows when it has nothing to show.
 *
 * Rule 14: empty states are screens, not an afterthought — the first run is the
 * only version of this app most people will see before deciding whether to keep
 * it. Drawn in the States round (the `EmptyState` component set on the
 * Components page, variants Action=Button and Action=None).
 *
 * The component draws the block only. Where it sits is the screen's call, and
 * the two placements differ: inside a `bg/surface` card when it stands in for
 * one block of a screen that still has other content (Home, Profile), and bare
 * and centred in the list area with 120pt below it when it stands in for a
 * whole list (Search, Ranking, Next). `EmptyStateCard` is the first of those,
 * so the two screens that need it do not each invent a card.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useTheme } from './theme';

export interface EmptyStateProps {
  /** Any Lucide name; 32pt in `text/secondary`. */
  icon: IconName;
  title: string;
  body: string;
  /** With an action, a primary button that hugs its label sits below the body. */
  action?: { label: string; onPress: () => void };
  /**
   * A second, quieter way out under the primary: the secondary `Button`
   * (`bg/surface` fill, `text/primary` label) at the same small size, hugging
   * its label. Added 2026-09-23 for Home's empty Playing card, which offers
   * "Search a new game" under "Pick from backlog" (home.md).
   */
  secondaryAction?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, title, body, action, secondaryAction, style }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.block,
        {
          paddingVertical: theme.space[8],
          paddingHorizontal: theme.space[6],
          gap: 6,
        },
        style,
      ]}>
      <Icon name={icon} size={32} color="text/secondary" />
      <Text size={17} weight={600} align="center">
        {title}
      </Text>
      <Text size={15} color="text/secondary" align="center">
        {body}
      </Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          size="small"
          weight={600}
          fullWidth={false}
          style={styles.action}
        />
      ) : null}
      {secondaryAction ? (
        <Button
          label={secondaryAction.label}
          onPress={secondaryAction.onPress}
          variant="secondary"
          size="small"
          weight={600}
          fullWidth={false}
          // Under a primary, the column's 6pt gap is the space between the
          // two; alone, it takes the primary's place 10pt below the body.
          style={action ? styles.secondary : styles.action}
        />
      ) : null}
    </View>
  );
}

/**
 * The same block inside the surface card, for when it replaces one block of a
 * screen rather than the whole of it.
 */
export function EmptyStateCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();

  return (
    <View
      style={[
        { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.lg },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  action: {
    // 6pt of gap plus 4 makes the 10pt the spec puts under the body, and the
    // 20pt sides are the button hugging its label rather than the 20 the
    // regular size pads with.
    marginTop: 4,
    paddingHorizontal: 20,
  },
  secondary: {
    paddingHorizontal: 20,
  },
});
