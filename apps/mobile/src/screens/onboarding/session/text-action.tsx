/**
 * A text button whose touch target is 44pt tall at any text size: "Place the
 * rest for me" and "Rank more" (specs/batch-session.md: "a `TextButton` with a
 * 44pt region").
 *
 * Not `TextButton` from `@/ui`: its fixed 10pt slop leaves a 15pt line at
 * about 40pt, short of the HIG's 44 (the calibration of 2026-09-29). This one
 * computes the slop from the line height the `Text` primitive will draw, as
 * `screens/steam/link-text.tsx` does for its links, and keeps the shell's
 * hover dim and focus ring from `interaction.ts`. Built here rather than in
 * `src/ui`, which is the shell's; say so in the PR, and fold it into
 * `TextButton` if the shell agrees.
 */

import { Pressable } from 'react-native';

import { Text, useTheme, type ColorToken, type FontWeight } from '@/ui';
import { interactionStyle, type InteractionState } from '@/ui/interaction';

const TARGET = 44;

export interface TextActionProps {
  label: string;
  onPress: () => void;
  size?: number;
  weight?: FontWeight;
  color?: ColorToken;
  disabled?: boolean;
}

export function TextAction({
  label,
  onPress,
  size = 15,
  weight = 400,
  color = 'text/secondary',
  disabled = false,
}: TextActionProps) {
  const theme = useTheme();
  const lineHeight = Math.round(size * (theme.font.body.lineHeight / theme.font.body.fontSize));
  const slop = Math.max(0, Math.ceil((TARGET - lineHeight) / 2));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: 12, right: 12 }}
      style={(state: InteractionState) => [
        { alignSelf: 'center' as const },
        disabled && { opacity: 0.4 },
        interactionStyle(state, theme, { disabled, ringRadius: theme.radius.sm }),
      ]}>
      <Text size={size} weight={weight} color={color} align="center">
        {label}
      </Text>
    </Pressable>
  );
}
