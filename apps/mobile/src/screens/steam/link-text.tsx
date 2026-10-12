/**
 * A line of text that opens a page on Steam: "Powered by Steam", "Open Privacy
 * Settings on Steam".
 *
 * Not `TextButton`: that is a button (it acts inside the app), this is a link
 * (it leaves for Valve's site), and a screen reader should say which. And its
 * fixed 10pt slop leaves a 13 or 15pt line short of the 44pt target; this one
 * computes the slop from the line height the `Text` primitive will draw, so the
 * target is 44 at any size while the words stay the size they are.
 *
 * `Linking.openURL` rather than the auth browser: these are ordinary pages, and
 * on a phone with the Steam app installed Valve's own links may open there,
 * already signed in, which is exactly where the privacy settings are easiest
 * to change.
 */

import * as Linking from 'expo-linking';
import { Pressable, StyleSheet } from 'react-native';

import { Text, useTheme, type ColorToken, type FontWeight } from '@/ui';

const TARGET = 44;

export interface LinkTextProps {
  label: string;
  url: string;
  /** Defaults to the label; say where it goes when the label does not. */
  accessibilityLabel?: string;
  size?: number;
  weight?: FontWeight;
  color?: ColorToken;
}

export function LinkText({
  label,
  url,
  accessibilityLabel,
  size = 15,
  weight = 500,
  color = 'text/primary',
}: LinkTextProps) {
  const theme = useTheme();
  // The same proportion `Text` uses to derive a line height from an
  // overridden size on the default ramp.
  const lineHeight = Math.round(size * (theme.font.body.lineHeight / theme.font.body.fontSize));
  const slop = Math.max(0, Math.ceil((TARGET - lineHeight) / 2));

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => void Linking.openURL(url)}
      hitSlop={{ top: slop, bottom: slop, left: 8, right: 8 }}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Text size={size} weight={weight} color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.7 },
});
