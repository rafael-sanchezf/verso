/**
 * A grey block at the size of the thing that has not loaded yet.
 *
 * specs/README.md defines the loading state for every screen in one line —
 * "skeleton blocks in `bg/placeholder` at the row's size" — and never draws it,
 * so Phase 2's seven screen branches each built their own: `Skeleton` in
 * `screens/game/states.tsx`, `screens/home/block.tsx` and
 * `screens/profile/loading-error.tsx`, `SkeletonBlock` in
 * `screens/log/pieces.tsx`, `Block` in `screens/search/placeholders.tsx`. Five
 * copies of nine lines. This is the one.
 *
 * At the row's own size on purpose: a spinner says "something is happening" and
 * a skeleton says "a card this big is about to be here", which is the
 * difference between the screen jumping and the screen filling in.
 *
 * A screen still composes its own arrangement of these — a game page's
 * skeleton looks nothing like a search row's, and should not. What is shared is
 * the block, not the layout.
 */

import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme';

export interface SkeletonProps {
  height: number;
  /** Omitted, it fills its slot: the whole column, or its share of a row. */
  width?: DimensionValue;
  /** `radius/sm` by default, which is what most of the blocks stand in for. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ height, width, radius, style }: SkeletonProps) {
  const theme = useTheme();

  return (
    <View
      // Not `accessibilityLabel`: a screen reader should hear one "Loading"
      // for the block of them, which the screen says around its arrangement,
      // rather than one per grey rectangle.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        width === undefined && styles.stretch,
        {
          height,
          width,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors['bg/placeholder'],
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  stretch: { alignSelf: 'stretch' },
});
