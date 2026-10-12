/**
 * Keeping the keyboard's place around a dialog or a menu, on web.
 *
 * react-native-web's `Modal` traps focus and, when it closes, gives focus back
 * to whatever had it when it opened. Two things get in its way here, both
 * found driving `/preview` in a headless browser:
 *
 * - It records "whatever had it" in an effect of its own, and React runs a
 *   child's effects before its parent's. `Dialog` and `Menu` move the focus
 *   inside in their own effects, which run first, so the Modal records an
 *   element inside itself and has nothing to return to. `useRestoreFocus`
 *   records the opener during the first render instead, before any effect,
 *   and gives the focus back when the dialog or menu unmounts.
 * - Its trap wraps Tab by focusing the first element inside that accepts
 *   focus, and a dialog's card accepts focus (it holds it at open so Enter can
 *   mean the default button). Tab then lands on the card, an invisible stop.
 *   `wrapTab` does the wrap itself, between the controls only.
 *
 * Both are no-ops on native, where none of this exists.
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const FOCUSABLE = '[tabindex="0"], a[href], button, input, select, textarea';

/** The controls inside `container` that Tab can reach, in document order. */
export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-disabled') !== 'true' &&
      element.tabIndex >= 0,
  );
}

/**
 * Tab and Shift+Tab, wrapped inside `container`. Returns whether it handled
 * the key; a Tab between two controls in the middle is left to the browser.
 */
export function wrapTab(event: KeyboardEvent, container: HTMLElement): boolean {
  if (event.key !== 'Tab') return false;
  const controls = focusableIn(container);
  if (controls.length === 0) return false;

  const first = controls[0]!;
  const last = controls[controls.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  const outsideControls = active === null || !controls.includes(active);

  if (event.shiftKey && (active === first || outsideControls)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || (outsideControls && active !== container))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/**
 * The element focus was last given back to. A dialog opened by a button of the
 * dialog before it records that button as its opener, and the button is gone
 * by the time the second dialog closes; the focus then goes where the first
 * dialog's went, so a chain of dialogs ends where it began.
 */
let lastRestored: HTMLElement | null = null;

/**
 * Remember what had the focus when this component first rendered, and give it
 * back when the component unmounts, if the focus has nowhere better to be: it
 * fell to the page because the focused element went away with the dialog. A
 * dialog that opens in the same moment takes the focus in its own effect,
 * which runs after this one.
 */
export function useRestoreFocus(): void {
  const [opener] = useState<HTMLElement | null>(() =>
    Platform.OS === 'web' && typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null,
  );

  useEffect(() => {
    if (!opener) return;
    return () => {
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (!lost) return;
      const target = opener.isConnected ? opener : lastRestored?.isConnected ? lastRestored : null;
      if (!target) return;
      lastRestored = target;
      target.focus();
    };
  }, [opener]);
}
