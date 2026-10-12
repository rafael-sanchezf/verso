/**
 * Which medium you are in, and the tap that changes it.
 *
 * Rule 4 says the app is always in exactly one medium and rule 6 says you tap
 * to change it, never swipe. So this is the whole mechanism: the active medium
 * is named on the left in the brand text color, the other three sit on the
 * right as icons in `text/secondary`, and a tap swaps them. No medium has a
 * color of its own (decision 29): the word says which one you are in, and the
 * one brand green says which is active.
 *
 * The active medium is its word alone, with no mark and no icon beside it
 * (brand-build.md, default 5, 2026-10-08): Rafa does not want Verso's mark at
 * the top of Home, Apple's guidance is not to repeat the logo inside the app,
 * and the header is to be redesigned. The icon, the splash and the signed-out
 * lockup carry the mark.
 *
 * In V0 only games has anything behind it. Tapping another medium is real
 * state — the header changes, the content area says the medium is not here yet
 * — and it resets when the tab is left (home.md, Behavior), because it is a
 * look at what is coming rather than a mode anyone can get stuck in.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';

import { Icon, Text, useTheme, type IconName } from '@/ui';

export type MediumKey = 'games' | 'books' | 'movies' | 'tv';

export interface MediumDescriptor {
  key: MediumKey;
  /** The word, as ui-principles.md names it. */
  label: string;
  icon: IconName;
}

/**
 * The four media, in the order the icons sit in.
 *
 * The order never changes as the active one moves out of the row, so the icon
 * you just tapped away from is where you left it and the one you want does not
 * move under your thumb.
 */
export const MEDIA: readonly MediumDescriptor[] = [
  { key: 'games', label: 'Games', icon: 'gamepad-2' },
  { key: 'books', label: 'Books', icon: 'book-open' },
  { key: 'movies', label: 'Movies', icon: 'film' },
  { key: 'tv', label: 'TV', icon: 'tv' },
];

export function mediumFor(key: MediumKey): MediumDescriptor {
  return MEDIA.find((medium) => medium.key === key) ?? MEDIA[0]!;
}

export interface MediaSwitcherProps {
  active: MediumKey;
  onSelect: (key: MediumKey) => void;
}

export function MediaSwitcher({ active, onSelect }: MediaSwitcherProps) {
  const theme = useTheme();
  const medium = mediumFor(active);

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: theme.space[4], paddingBottom: theme.space[3] },
      ]}>
      {/*
        Keyed by the medium so the name re-enters on every switch: the word
        arriving is what makes the change read as "you are somewhere else now"
        rather than as a label quietly rewriting itself.
      */}
      <Animated.View key={medium.key} entering={FadeInLeft.duration(220)} style={styles.active}>
        <Text size={30} weight={700} color="brand/text" numberOfLines={1}>
          {medium.label}
        </Text>
      </Animated.View>

      <View style={[styles.others, { gap: 10 }]}>
        {MEDIA.filter((other) => other.key !== active).map((other) => (
          <Pressable
            key={other.key}
            accessibilityRole="button"
            accessibilityLabel={other.label}
            accessibilityHint={`Switch to ${other.label}`}
            // A 28pt icon is under the 44pt target iOS asks for, and these sit
            // 10pt apart; the slop makes them reachable without spacing them out.
            hitSlop={8}
            onPress={() => onSelect(other.key)}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
            <Icon name={other.icon} size={28} color="text/secondary" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  others: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
});
