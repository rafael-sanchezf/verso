/**
 * The questions a component asks about the window, answered in one place.
 *
 * `useLayout()` says how wide the window is and where the tab bar sits;
 * `useContentWidth()` says how many points a screen has across, which is the
 * window minus the control column the iPhone Duo reserves on the right when
 * the bar is on the side. Every component that lays out differently reads
 * these rather than the raw window, so a screen never grows a width of its own
 * by accident and the thresholds live in `layout-model.ts`.
 *
 * The web app has two widths (web-brief.md, "The shape: one codebase, two
 * widths"): `compact` is the phone's layout in a browser, `wide` the
 * web-exclusive one with a sidebar. The Duo adds `regular` between them
 * (docs/design/duo-brief.md): its inner display is 669 points across, too
 * wide for a phone's single column and too narrow for the web's sidebar.
 *
 * The window is read from the safe-area frame rather than `useWindowDimensions`:
 * the frame is layout-driven, and under the scene life cycle React Native
 * 0.86's window events are not confirmed to fire when the Duo folds.
 */

import { createContext, useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { barFor, columnWidthFor, contentWidthFor, readingInsetFor, widthClassFor, type Layout } from './layout-model';

export {
  READING_WIDTH,
  REGULAR_BREAKPOINT,
  WIDE_BREAKPOINT,
  widthClassFor,
  type BarPlacement,
  type Layout,
  type WidthClass,
} from './layout-model';

/** The current window's layout; re-renders when the window crosses a threshold. */
export function useLayout(): Layout {
  const { width } = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const bar = barFor({ platform: Platform.OS, insets });
  const widthClass = widthClassFor(width);
  return useMemo(() => ({ width: widthClass, bar }), [widthClass, bar]);
}

/**
 * The points a screen has across: the window, less the Duo's control column
 * when the tab bar is on the side. Column math (the Ranking grid, the Playing
 * cards, the poster rows) divides this, never the window.
 */
export function useContentWidth(): number {
  const { width } = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const bar = barFor({ platform: Platform.OS, insets });
  const pane = useContext(PaneWidthContext);
  return pane ?? contentWidthFor(width, bar, insets.right);
}

/**
 * A pane's way of narrowing the content width for what it holds
 * (`ui/pane.tsx`): inside one, `useContentWidth()` answers the pane's width.
 */
const PaneWidthContext = createContext<number | null>(null);
export const PaneWidthProvider = PaneWidthContext.Provider;

/**
 * The side inset that centers a one-column screen in a regular window
 * (`readingInsetFor`), read where a layout pads its screens.
 */
export function useReadingInset(): number {
  const { width } = useLayout();
  const content = useContentWidth();
  return readingInsetFor(width, content);
}

/**
 * The column's width, in points: what the tab bar's spacer, the root stack's
 * clearance and the column host all take, so they agree to the point. Zero
 * wherever the bar is at the bottom.
 */
export function useSideColumnWidth(): number {
  const insets = useSafeAreaInsets();
  const bar = barFor({ platform: Platform.OS, insets });
  return columnWidthFor(bar, insets.right);
}
