/**
 * Compact or wide: the one question a component asks about the window.
 *
 * The web app has two widths and no more (web-brief.md, "The shape: one
 * codebase, two widths"): under the breakpoint it is the phone's layout in a
 * browser, at and above it the web-exclusive one, with a sidebar instead of the
 * tab bar and a centered dialog where the phone has a bottom sheet. Every
 * component that lays out differently reads this hook rather than the raw
 * width, so a screen never grows a third width by accident and the breakpoint
 * lives in one place.
 *
 * On the phone the answer is always `compact`: iPad is unsupported
 * (`supportsTablet: false`) and no phone is 1024 points wide.
 */

import { useWindowDimensions } from 'react-native';

/**
 * Where the layout turns wide, in CSS pixels (points on native).
 *
 * A named constant for now. It becomes a token in `packages/tokens` when the
 * Web round adds the breakpoint variable to Figma, and this then reads it from
 * the generated theme like every other number in `src/ui`.
 */
export const WIDE_BREAKPOINT = 1024;

export type Layout = 'compact' | 'wide';

/** The layout for a window width. Pure, so the threshold can be tested. */
export function layoutFor(width: number): Layout {
  return width >= WIDE_BREAKPOINT ? 'wide' : 'compact';
}

/** The current window's layout; re-renders when the window crosses the breakpoint. */
export function useLayout(): Layout {
  const { width } = useWindowDimensions();
  return layoutFor(width);
}
