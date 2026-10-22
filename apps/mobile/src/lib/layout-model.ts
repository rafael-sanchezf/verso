/**
 * The layout rules, with nothing from React Native in them so they can be
 * tested in `test/`. `use-layout.ts` reads the window and the safe area and
 * hands them here.
 *
 * Two questions, asked separately (docs/design/duo-brief.md, "The model"):
 *
 * - How wide is the window? `compact` is a phone; `regular` is the iPhone
 *   Duo's inner display (669 by 951 points), an iPad split, or a narrow
 *   browser; `wide` is the web's desktop layout (web-brief.md, "two widths").
 * - Where does the tab bar go? `bottom` everywhere a phone puts it; `side`
 *   where iOS puts its own bars on the side: the Duo's outer display and its
 *   inner display held in landscape, where the system reserves a column along
 *   the right edge for the status bar, the camera and the controls.
 */

/** Where the layout turns regular, in points. */
export const REGULAR_BREAKPOINT = 600;

/**
 * Where the layout turns wide, in CSS pixels (points on native).
 *
 * A named constant for now. It becomes a token in `packages/tokens` when the
 * Web round adds the breakpoint variable to Figma, and this then reads it from
 * the generated theme like every other number in `src/ui`.
 */
export const WIDE_BREAKPOINT = 1024;

/**
 * The least trailing inset that reads as the Duo's control column. Measured
 * at 84 points on the iPhone Duo simulator (iOS 27.1); Apple publishes no
 * number, so the threshold sits well under the reading and well over anything
 * a phone reports (a phone in portrait reports 0 on both sides).
 */
export const SIDE_BAR_MIN_INSET = 48;

/**
 * The column's floor, in points: what it is drawn at when the trailing inset
 * comes in under it. 84 on the simulator; a 48-point button with 12 each side.
 */
export const COLUMN_MIN_WIDTH = 72;

/**
 * The widest a one-column screen is laid out at, in points, where the window
 * is regular: Search's list, Profile, Settings, the detail pages. A row of
 * text wider than this runs past what a line can be read in one look
 * (web-brief.md caps the web's column the same way, at 1100 for its own type).
 */
export const READING_WIDTH = 640;

export type WidthClass = 'compact' | 'regular' | 'wide';
export type BarPlacement = 'bottom' | 'side';

export interface Layout {
  width: WidthClass;
  bar: BarPlacement;
}

/** The width class for a window width. */
export function widthClassFor(width: number): WidthClass {
  if (width >= WIDE_BREAKPOINT) return 'wide';
  if (width >= REGULAR_BREAKPOINT) return 'regular';
  return 'compact';
}

export interface BarSignals {
  /** `ios`, `android`, `web`, as `Platform.OS` says. */
  platform: string;
  /** The window's safe area insets, in points. */
  insets: { top: number; right: number };
}

/**
 * Where the tab bar goes.
 *
 * iOS moves its bars to the side exactly when the status bar has moved there
 * too, and that shows in the safe area: the top inset drops to zero and the
 * trailing inset grows to the width of the control column. A phone in portrait
 * has a top inset and no side inset; the Duo's inner display in portrait keeps
 * a top inset (82 points on the simulator) and gets a bottom bar; the outer
 * display and the inner display in landscape have no top inset and a trailing
 * one, and get the side bar. Only iOS has the column, so the web and Android
 * always answer `bottom`.
 */
export function barFor({ platform, insets }: BarSignals): BarPlacement {
  if (platform !== 'ios') return 'bottom';
  return insets.top === 0 && insets.right >= SIDE_BAR_MIN_INSET ? 'side' : 'bottom';
}

/**
 * The side inset that centers a one-column screen in a regular window: half
 * of what is left past the reading width, nothing in a compact window, and
 * nothing in a wide one, whose own layout the web brief owns.
 */
export function readingInsetFor(width: WidthClass, contentWidth: number): number {
  if (width !== 'regular') return 0;
  return Math.max(0, Math.floor((contentWidth - READING_WIDTH) / 2));
}

/** The column's width: the trailing inset, floored, or nothing when the bar is at the bottom. */
export function columnWidthFor(bar: BarPlacement, rightInset: number): number {
  return bar === 'side' ? Math.max(rightInset, COLUMN_MIN_WIDTH) : 0;
}

/** The width left for content once the side bar has taken its column. */
export function contentWidthFor(windowWidth: number, bar: BarPlacement, rightInset: number): number {
  return windowWidth - columnWidthFor(bar, rightInset);
}
