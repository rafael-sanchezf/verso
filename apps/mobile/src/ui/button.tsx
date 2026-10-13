/**
 * The three buttons the frames use, and the dialog's fourth.
 *
 * primary is the brand green (`brand/primary` with `brand/on-primary`, decision
 * 29) and carries the one action a screen is for.
 * secondary is the quiet alternative beside it, and the escape hatches in the
 * comparison flow (rule 12: available, not tempting). contrast is the
 * near-black/near-white fill that Done and Share use, where the action is
 * final rather than thematic. destructive is the confirm in a `Dialog` that
 * removes something ("Delete"): a #BB0A10 fill with a white label (6.6:1) in
 * both modes. The fill reads `tier/disliked` because that is the token holding
 * #BB0A10 in both modes: `text/destructive` lifts to #FF453A in dark, and white
 * on #FF453A is 3.4:1, under the 4.5:1 a label needs. Destructive text
 * elsewhere (Settings, menus, errors) uses `text/destructive`.
 *
 * On web each also has a hover state, quieter than pressed, and a focus ring
 * for the keyboard (`interaction.ts`). Nothing about them changes on native.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import { interactionStyle, type InteractionState } from './interaction';
import { Text } from './text';
import { useTheme, type ColorToken } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'contrast' | 'destructive';
export type ButtonSize = 'regular' | 'compact' | 'small';

export interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Override the size's label weight. The small size is medium in the frames'
   * escape hatches and semibold in the EmptyState action, which is the only
   * reason this exists.
   */
  weight?: 400 | 500 | 600 | 700;
  /** A leading icon, at the label's size. */
  icon?: IconName;
  disabled?: boolean;
  /** Buttons stretch by default; `false` hugs the label (the EmptyState action). */
  fullWidth?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Anything that is not a label — a Google mark, a spinner — before the label. */
  leading?: ReactNode;
  /** The label's color instead of the variant's: the movie page's "Want to watch" reads in the brand green once the film is on the list. */
  labelColor?: ColorToken;
}

/** Label size and weight, and the vertical padding, per size. */
const SIZES = {
  regular: { fontSize: 17, weight: 600, paddingVertical: 14 },
  compact: { fontSize: 16, weight: 600, paddingVertical: 13 },
  small: { fontSize: 15, weight: 500, paddingVertical: 12 },
} as const;

function colorsFor(variant: ButtonVariant): { fill: ColorToken; label: ColorToken } {
  switch (variant) {
    case 'primary':
      return { fill: 'brand/primary', label: 'brand/on-primary' };
    case 'secondary':
      return { fill: 'bg/surface', label: 'text/primary' };
    case 'contrast':
      return { fill: 'text/primary', label: 'bg/canvas' };
    case 'destructive':
      return { fill: 'tier/disliked', label: 'tier/label' };
  }
}

export function Button({
  label,
  variant = 'primary',
  size = 'regular',
  weight,
  icon,
  disabled = false,
  fullWidth = true,
  onPress,
  style,
  leading,
  labelColor: labelOverride,
}: ButtonProps) {
  const theme = useTheme();
  const { fontSize, weight: defaultWeight, paddingVertical } = SIZES[size];
  const labelWeight = weight ?? defaultWeight;
  const { fill, label: variantLabel } = colorsFor(variant);
  const labelColor = labelOverride ?? variantLabel;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={(state: InteractionState) => [
        styles.base,
        {
          backgroundColor: theme.colors[fill],
          borderRadius: theme.radius.md,
          paddingVertical,
          paddingHorizontal: theme.space[5],
          gap: theme.space[2],
          alignSelf: fullWidth ? 'stretch' : 'center',
        },
        // A disabled button is a statement ("this is done"), not a mistake, so
        // it dims rather than greying out to a different color.
        disabled && styles.disabled,
        interactionStyle(state, theme, { disabled }),
        style,
      ]}>
      {leading}
      {icon ? <Icon name={icon} size={fontSize + 1} color={labelColor} /> : null}
      <Text size={fontSize} weight={labelWeight} color={labelColor} align="center">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A label that acts like a button and looks like text: "Change", "See all",
 * "Forgot password?", "Retry". iOS uses these everywhere and a filled button
 * would shout.
 */
export interface TextButtonProps {
  label: string;
  onPress?: () => void;
  color?: ColorToken;
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  align?: 'left' | 'center' | 'right';
  disabled?: boolean;
}

export function TextButton({
  label,
  onPress,
  color = 'text/primary',
  size = 15,
  weight = 500,
  align,
  disabled = false,
}: TextButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // A 15pt word is under the 44pt touch target iOS asks for; the hit slop
      // makes it reachable without making it look bigger.
      hitSlop={10}
      style={(state: InteractionState) => [
        disabled && styles.disabled,
        // A word has no corners of its own; the ring borrows the small radius
        // so it reads as a focus ring rather than a selection box.
        interactionStyle(state, theme, { disabled, ringRadius: theme.radius.sm }),
      ]}>
      <Text size={size} weight={weight} color={color} align={align}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A container that dims on press, for cards and rows that act as buttons.
 *
 * `ListRow` is made of it, and so are Home's cards, so on web they all get
 * the hover dim and the keyboard's focus ring from here.
 */
export function Pressed({
  onPress,
  onLongPress,
  disabled,
  style,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useTheme();

  if (!onPress && !onLongPress) return <View style={style}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={(state: InteractionState) => [style, interactionStyle(state, theme)]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
