/**
 * Hover and keyboard focus, for the web build, in one place.
 *
 * The phone has one interaction state worth drawing, pressed, and every
 * primitive dims to 70% for it. A browser has two more (W0 finding 9: "no hover
 * state, no visible focus ring"): the pointer resting over a control, and the
 * keyboard's focus. Both are drawn here so the seven pressable primitives say
 * the same thing the same way.
 *
 * - Hover dims to 85%: quieter than pressed, so a press still reads as a press
 *   while the pointer is already over the control.
 * - Keyboard focus draws a 2px ring in `brand/text`, 2px outside the
 *   control's edge (it follows the control's corner radius in every current
 *   browser).
 *
 * react-native-web 0.21's `Pressable` hands its style function `hovered` and
 * `focused` but has no focus-visible state: `focused` is true after a mouse
 * click as much as after a Tab. A ring on every click is the thing
 * `:focus-visible` exists to prevent, so this module keeps the distinction
 * itself, the way the browser's own heuristic does: the last input was a key
 * (Tab, an arrow, Enter) or a pointer. A focus that arrives after a key shows
 * the ring; one that arrives after a click does not. The style function reads
 * the flag when the focus change re-renders the control, which is after the
 * keydown or the pointerdown that caused it.
 *
 * Nothing here runs on native: `hovered` and `focused` are web-only, and both
 * checks are behind `Platform.OS === 'web'` as well, so the phone's primitives
 * render exactly what they did.
 */

import { Platform, StyleSheet, type PressableStateCallbackType, type ViewStyle } from 'react-native';

import type { Theme } from './theme';

const isWeb = Platform.OS === 'web';

/** What react-native-web passes a `Pressable` style function; native passes `pressed` only. */
export type InteractionState = PressableStateCallbackType & {
  readonly hovered?: boolean;
  readonly focused?: boolean;
};

/** The press dim every primitive already used. */
export const PRESSED_OPACITY = 0.7;
/** Quieter than pressed, on purpose. */
export const HOVER_OPACITY = 0.85;

/** The ring's width and its gap from the control's edge, in CSS pixels. */
const RING_WIDTH = 2;
const RING_OFFSET = 2;

/**
 * Whether the most recent input was the keyboard.
 *
 * Starts false: a page that has seen no input yet has nothing to show a ring
 * for, and the first Tab flips it before the focus it causes arrives.
 * Modifier chords (Cmd+C, Ctrl+Tab) do not count, as in the browser's own
 * heuristic. Registered once, at module load, and only where a document exists
 * (the static export renders this module in Node).
 */
let keyboardModality = false;

if (isWeb && typeof document !== 'undefined') {
  const options = { capture: true, passive: true } as const;
  document.addEventListener(
    'keydown',
    (event) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) keyboardModality = true;
    },
    options,
  );
  for (const type of ['pointerdown', 'mousedown', 'touchstart'] as const) {
    document.addEventListener(type, () => (keyboardModality = false), options);
  }
}

/** Hovered by a mouse, and not already pressed (pressed wins). Always false on native. */
export function isHovered(state: InteractionState): boolean {
  return isWeb && state.hovered === true && !state.pressed;
}

/** Focused by the keyboard, as `:focus-visible` would say. Always false on native. */
export function isFocusVisible(state: InteractionState): boolean {
  return isWeb && state.focused === true && keyboardModality;
}

/** Whether the keyboard was the last input; for list rows that highlight rather than ring. */
export function isKeyboardModality(): boolean {
  return isWeb && keyboardModality;
}

/**
 * No browser focus ring, for an element that shows focus its own way (a menu
 * row's highlight) or holds focus without being a control (a dialog's card).
 * React Native's types know only solid, dotted and dashed outlines;
 * react-native-web passes `none` through to CSS, and a zero width alone does
 * not hide Chrome's `auto` ring.
 */
export const NO_OUTLINE = { outlineStyle: 'none' } as unknown as ViewStyle;

/**
 * The focus ring, from tokens.
 *
 * `radius` is for a control that has no corner radius of its own (a text
 * button): the ring follows the element's radius, and a square ring around a
 * word reads as a selection box.
 */
export function focusRing(theme: Theme, radius?: number): ViewStyle {
  return {
    outlineColor: theme.colors['brand/text'],
    outlineStyle: 'solid',
    outlineWidth: RING_WIDTH,
    outlineOffset: RING_OFFSET,
    ...(radius === undefined ? null : { borderRadius: radius }),
  };
}

/**
 * The three states as styles, in the order they apply: the press dim, the
 * hover dim when not pressed, and the ring. A disabled control gets neither
 * dim, because it is already dimmed to 40%; it never shows the ring in
 * practice either, since react-native-web gives a disabled `Pressable`
 * `tabIndex -1` and Tab skips it.
 */
export function interactionStyle(
  state: InteractionState,
  theme: Theme,
  options: { disabled?: boolean; ringRadius?: number } = {},
): (ViewStyle | false)[] {
  const { disabled = false, ringRadius } = options;
  return [
    !disabled && state.pressed && styles.pressed,
    !disabled && isHovered(state) && styles.hovered,
    isFocusVisible(state) && focusRing(theme, ringRadius),
  ];
}

const styles = StyleSheet.create({
  pressed: { opacity: PRESSED_OPACITY },
  hovered: { opacity: HOVER_OPACITY },
});
