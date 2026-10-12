/**
 * iOS's segmented control, drawn from tokens.
 *
 * Not the platform's own: `@expo/ui`'s native control cannot take the icons the
 * Next tab's segments have, and its colors come from the system rather than
 * from the token file, which would leave one control on screen that does not
 * follow the theme. Everything else about it is the convention — equal widths,
 * a sliding-looking selected fill, one tap to switch (rule 6).
 *
 * On web an unselected segment dims under the pointer, a pressed one dims
 * further, and the keyboard's focus draws the ring (`interaction.ts`). On
 * native a segment has never had a pressed state and still has none.
 */

import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import {
  focusRing,
  HOVER_OPACITY,
  isFocusVisible,
  isHovered,
  PRESSED_OPACITY,
  type InteractionState,
} from './interaction';
import { Text } from './text';
import { useTheme } from './theme';

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: 10,
          padding: 2,
          gap: 2,
        },
        style,
      ]}>
      {segments.map((segment) => {
        const selected = segment.value === value;

        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
            style={(state: InteractionState) => [
              styles.segment,
              {
                borderRadius: theme.radius.sm,
                paddingVertical: 7,
                gap: theme.space[1] + 2,
                backgroundColor: selected ? theme.colors['bg/canvas'] : 'transparent',
              },
              // The selected segment is where you already are: no hover on it.
              // Web only, all three; a segment on the phone has no pressed state.
              !selected && Platform.OS === 'web' && state.pressed && styles.pressed,
              !selected && isHovered(state) && styles.hovered,
              isFocusVisible(state) && focusRing(theme),
            ]}>
            {segment.icon ? (
              <Icon
                name={segment.icon}
                size={16}
                color={selected ? 'text/primary' : 'text/secondary'}
              />
            ) : null}
            <Text
              size={15}
              weight={selected ? 600 : 400}
              color={selected ? 'text/primary' : 'text/secondary'}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row' },
  hovered: { opacity: HOVER_OPACITY },
  pressed: { opacity: PRESSED_OPACITY },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
