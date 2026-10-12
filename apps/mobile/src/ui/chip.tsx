/**
 * The pill. Four variants, because the frames use it for four different jobs.
 *
 * surface   a neutral tag, and the unselected state of anything selectable.
 * filled    the selected state: the text color inverted, so selection reads
 *           without depending on a hue (rule 5).
 * outlined  a chip that is an action rather than a state.
 * played    a platform the game was played on (decision 19): the brand text
 *           color as a border plus a check, never a fill, so it cannot be
 *           confused with the filled selection state sitting next to it.
 *
 * A chip with `onPress` gets the web's hover dim and focus ring
 * (`interaction.ts`); nothing changes on native.
 */

import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import { interactionStyle, type InteractionState } from './interaction';
import { Text } from './text';
import { useTheme, type ColorToken } from './theme';

export type ChipVariant = 'surface' | 'filled' | 'outlined' | 'played';

export interface ChipProps {
  label: string;
  variant?: ChipVariant;
  /** 13 in most rows, 14 in the Ranking filters. */
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  icon?: IconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  variant = 'surface',
  size = 13,
  weight = 500,
  icon,
  onPress,
  style,
}: ChipProps) {
  const theme = useTheme();

  const fill: ColorToken | 'transparent' =
    variant === 'filled' ? 'text/primary' : variant === 'outlined' ? 'transparent' : 'bg/surface';
  const labelColor: ColorToken = variant === 'filled' ? 'bg/canvas' : 'text/primary';

  // `played` shows the check whether or not the caller passed an icon; that is
  // the point of the variant.
  const leadingIcon: IconName | undefined = variant === 'played' ? 'check' : icon;

  const border =
    variant === 'played'
      ? { borderWidth: 1.5, borderColor: theme.colors['brand/text'] }
      : variant === 'outlined'
        ? { borderWidth: 1, borderColor: theme.colors['border/separator'] }
        : null;

  const content = (
    <>
      {leadingIcon ? (
        <Icon
          name={leadingIcon}
          size={14}
          color={variant === 'played' ? 'brand/text' : labelColor}
        />
      ) : null}
      <Text size={size} weight={weight} color={labelColor}>
        {label}
      </Text>
    </>
  );

  const chipStyle = [
    styles.chip,
    {
      backgroundColor: fill === 'transparent' ? 'transparent' : theme.colors[fill],
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.space[3],
      paddingVertical: 6,
      gap: theme.space[1] + 2,
    },
    border,
    style,
  ];

  if (!onPress) return <View style={chipStyle}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state: InteractionState) => [chipStyle, interactionStyle(state, theme)]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});
