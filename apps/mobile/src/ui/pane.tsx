/**
 * Two panes side by side, for the iPhone Duo's inner display and any window
 * of regular width (docs/design/duo-brief.md, "The inner display").
 *
 * The phone stacks its blocks; the inner display lays what the phone stacks
 * side by side, with the seam at the middle so the fold, when the device is
 * half open, falls between the panes and never across a control. `PaneRow`
 * is the row, `Pane` one half of it. A pane measures its own width and hands
 * it down as the content width, so everything inside that divides
 * `useContentWidth()` (the Playing cards, a grid) divides the pane, not the
 * screen, without knowing it is in one.
 *
 * Each block keeps its own 16 of side padding, so the two panes' contents
 * stand 32 apart at the seam with no gap of the row's own.
 */

import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { PaneWidthProvider, useContentWidth } from '@/lib/use-layout';

export function PaneRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Pane({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  // Half the content until the pane has been measured, so the first frame is
  // sized right rather than to the whole screen.
  const content = useContentWidth();
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };
  return (
    <View style={[styles.pane, style]} onLayout={onLayout}>
      <PaneWidthProvider value={width ?? Math.floor(content / 2)}>{children}</PaneWidthProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  pane: {
    flex: 1,
    minWidth: 0,
  },
});
