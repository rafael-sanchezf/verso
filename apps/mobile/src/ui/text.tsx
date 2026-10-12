/**
 * Every word on screen goes through this.
 *
 * The ten text styles in the tokens are the ramp, named as they are in Figma,
 * so a spec line ("title 16 medium `text/primary`") maps onto props without a
 * lookup table. The frames also use sizes off the ramp (30, 24, 18, 14, 11, 10)
 * and weights the ramp does not pair with a size, which is why `size` and
 * `weight` override independently rather than there being a style per
 * combination.
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text as RNText, type StyleProp, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { fontFamilyFor, useTheme, type ColorToken, type FontStyle, type FontWeight } from './theme';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  /**
   * Which text style off the ramp. Named `style` because that is what the
   * design file and docs/design/specs/shell.md call it.
   */
  style?: FontStyle;
  /** Override the ramp's size. The line height scales with it. */
  size?: number;
  /** Override the ramp's weight. */
  weight?: FontWeight;
  /** A color token name; defaults to `text/primary`. */
  color?: ColorToken;
  /**
   * Tracking as a share of the size, as the design file writes it: -2% is
   * `-0.02`. Off the ramp, which sets none; the wordmark is what uses it.
   */
  tracking?: number;
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  /**
   * Layout only — flex, margins, a width. The escape hatch that keeps `style`
   * free to mean the ramp; never put a color or a font size here, because then
   * the ramp is no longer the ramp.
   */
  layout?: StyleProp<TextStyle>;
  children?: ReactNode;
}

export function Text({
  style = 'body',
  size,
  weight,
  color = 'text/primary',
  tracking,
  align,
  layout,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const ramp = theme.font[style];

  const fontSize = size ?? ramp.fontSize;
  const fontWeight = weight ?? ramp.fontWeight;

  // Keep the ramp's proportions when a size is overridden, so an 18pt heading
  // sits on the same rhythm as the 17pt one it was derived from.
  const lineHeight = Math.round(fontSize * (ramp.lineHeight / ramp.fontSize));

  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fontFamilyFor(fontWeight),
          // Also set the numeric weight: react-native-web resolves the face
          // from it, and it keeps accessibility APIs honest about emphasis.
          fontWeight: String(fontWeight) as TextStyle['fontWeight'],
          fontSize,
          lineHeight,
          color: theme.colors[color],
          textAlign: align,
          ...(tracking === undefined ? null : { letterSpacing: tracking * fontSize }),
        },
        layout,
      ]}>
      {children}
    </RNText>
  );
}

/**
 * The separator the subtitles use, as one string.
 *
 * Every spec writes fallback chains as `{a} · {b}`, and every screen would
 * otherwise reinvent "join the parts that exist".
 */
export function joinParts(parts: readonly (string | null | undefined)[], separator = ' · '): string | null {
  const present = parts.filter((part): part is string => Boolean(part && part.trim()));
  return present.length === 0 ? null : present.join(separator);
}

export const textStyles = StyleSheet.create({
  /** `flex: 1` on a Text, so a long title truncates instead of pushing a row wide. */
  fill: { flex: 1 },
});
