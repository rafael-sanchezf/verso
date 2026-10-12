/**
 * A single-key keyboard shortcut, for the web build.
 *
 * W1, "the keyboard does what the thumb does": `/` focuses search, and the
 * screens of the web round will add their own. One hook, so every shortcut
 * follows the same two rules the web does:
 *
 * - A key typed into a field is text, not a command: nothing fires while the
 *   focus is in an input, a textarea, a select or anything contentEditable.
 * - A chord is the browser's or the system's (Cmd+F, Ctrl+R): nothing fires
 *   with Cmd, Ctrl or Alt held. Shift is allowed, because `?` is Shift+/ on
 *   most layouts and the key is matched by the character it types.
 *
 * The handled key's default is prevented, so `/` does not also land in the
 * field the shortcut has just focused. A no-op on native, where there is no
 * keyboard to speak of.
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** The parts of a `KeyboardEvent` the decision needs. */
export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: unknown;
}

/** True for an element a person types into. */
export function isTypingTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (element.isContentEditable === true) return true;
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Whether this keydown is the shortcut for `key`. Pure, so the rules can be tested. */
export function matchesShortcut(event: ShortcutEvent, key: string): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isTypingTarget(event.target)) return false;
  return event.key === key;
}

/**
 * Call `handler` when `key` is pressed outside a field. `enabled` turns it off
 * without unmounting, for a screen that is mounted but not in front.
 */
export function useShortcut(key: string, handler: () => void, enabled = true): void {
  // The latest handler, so a caller can pass an inline function without the
  // listener being torn down and added again on every render.
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof document === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !matchesShortcut(event, key)) return;
      event.preventDefault();
      latest.current();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [key, enabled]);
}
