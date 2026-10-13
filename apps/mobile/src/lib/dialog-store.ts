/**
 * The queue behind `showDialog`, `alert` and `select` on web, and the rules
 * that turn an `Alert.alert` call into a dialog.
 *
 * react-native-web's `Alert.alert` is an empty function (W0 finding 1), so on
 * web every confirm, menu and error the app sends through it was silent. The
 * shim in `lib/dialog.ts` puts the same call here instead, and the one
 * `DialogHost` in the root layout draws whatever is at the head of the queue.
 *
 * A queue rather than a slot, because alerts arrive in sequence: "Import from
 * a file" asks, the import runs, and "Import complete" follows while the first
 * dialog may still be closing. One is on screen at a time, in the order they
 * were asked for, which is what the phone's alerts do.
 *
 * No React and no `react-native` in this file, so the rules can be unit-tested
 * in Node; the store is read through `useSyncExternalStore` by the host, the
 * same shape as `use-session.ts`.
 */

import type { MenuItem } from '@/ui/menu';

import { translate, type TranslationKey } from './i18n/dictionary';
import { languageStore } from './i18n/store';

/**
 * A dialog's own word ("OK", "Cancel") in the app's language, read when the
 * dialog is built (spanish-build.md, wave 2). The pure halves of the language
 * layer rather than `t` from `@/lib/i18n`, which binds the device and would
 * take this file out of the node tests; `lib/format.ts` does the same.
 */
export function dialogWord(key: TranslationKey): string {
  return translate(languageStore.language(), key);
}

export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

/** One button, as `Alert.alert` describes one. */
export interface DialogButton {
  text: string;
  style?: DialogButtonStyle;
  onPress?: () => void;
}

/** A choice in a `select`: a row in the dialog's list, with an optional icon. */
export type DialogChoice = MenuItem;

export interface DialogOptions {
  title?: string;
  message?: string;
  /** One to three, as `Alert.alert` takes them; more stack vertically. */
  buttons?: readonly DialogButton[];
  /** A `select`: rows above the buttons, each of which closes the dialog. */
  choices?: readonly DialogChoice[];
  /** Called when the dialog closes without a button: Escape, or the dim, with no cancel button. */
  onDismiss?: () => void;
}

export interface DialogRequest extends DialogOptions {
  id: number;
  buttons: readonly DialogButton[];
}

/**
 * The shape of React Native's `AlertButton`, restated so this file needs no
 * `react-native` import. `lib/dialog.ts` passes the real type through.
 */
export interface AlertButtonLike {
  text?: string;
  style?: DialogButtonStyle;
  onPress?: (value?: never) => void;
  isPreferred?: boolean;
}

/**
 * `Alert.alert`'s buttons as dialog buttons.
 *
 * The defaults are React Native's own: no buttons means one "OK" (Alert.js
 * does this on Android and UIKit on iOS), a button without text gets "OK" if
 * it is the only one and an empty label otherwise, and a missing style is
 * `default`. Order is kept; the dialog decides where each one sits.
 */
export function buttonsFromAlert(buttons?: readonly AlertButtonLike[]): DialogButton[] {
  if (!buttons || buttons.length === 0) return [{ text: dialogWord('common.ok'), style: 'default' }];

  return buttons.map((button) => {
    const press = button.onPress;
    return {
      text: button.text || (buttons.length === 1 ? dialogWord('common.ok') : ''),
      style: button.style ?? 'default',
      ...(press ? { onPress: () => press() } : null),
    };
  });
}

/**
 * The button Escape and the dim press: the cancel button if there is one.
 *
 * Without one, a dialog with a single plain button (an "OK" that only
 * acknowledges) closes through that button, so its `onPress` still runs as it
 * would on the phone. Anything else returns -1: dismissing a dialog whose only
 * choices are actions must not pick one of them.
 */
export function cancelButtonIndex(buttons: readonly DialogButton[]): number {
  const cancel = buttons.findIndex((button) => button.style === 'cancel');
  if (cancel !== -1) return cancel;
  if (buttons.length === 1 && buttons[0]!.style !== 'destructive') return 0;
  return -1;
}

/**
 * The button Enter presses: the first that is neither cancel nor destructive.
 *
 * -1 when there is none, so Enter on "Delete your account?" ([Cancel, Delete])
 * does nothing at all: a destructive action is never one keystroke away. The
 * one exception is a dialog whose only button is a cancel, the Time-to-beat
 * breakdown's "Done": Enter closes it as Escape does, since there is nothing
 * else it could mean.
 */
export function defaultButtonIndex(buttons: readonly DialogButton[]): number {
  const index = buttons.findIndex((button) => button.style !== 'cancel' && button.style !== 'destructive');
  if (index !== -1) return index;
  return buttons.length === 1 && buttons[0]!.style === 'cancel' ? 0 : -1;
}

/**
 * Where each button sits, as indexes into `buttons`.
 *
 * Wide, the web's order: a row, cancel first (leftmost) and the rest in the
 * caller's order, so the commit is at the right edge. Compact, a phone's: a
 * column with the actions in order and cancel last, under them, where an
 * action sheet keeps it.
 */
export function buttonOrder(buttons: readonly DialogButton[], layout: 'compact' | 'wide'): number[] {
  const indexes = buttons.map((_, index) => index);
  const cancels = indexes.filter((index) => buttons[index]!.style === 'cancel');
  const actions = indexes.filter((index) => buttons[index]!.style !== 'cancel');
  return layout === 'wide' ? [...cancels, ...actions] : [...actions, ...cancels];
}

/**
 * The fill each button gets: a destructive one is destructive, a cancel is
 * always the quiet secondary (even a lone "Done" that Enter presses), and of
 * the rest the one Enter presses is primary.
 */
export function buttonVariant(
  buttons: readonly DialogButton[],
  index: number,
): 'primary' | 'secondary' | 'destructive' {
  const style = buttons[index]?.style;
  if (style === 'destructive') return 'destructive';
  if (style === 'cancel') return 'secondary';
  return index === defaultButtonIndex(buttons) ? 'primary' : 'secondary';
}

// The store.

let queue: readonly DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: readonly DialogRequest[]): void {
  queue = next;
  for (const listener of listeners) listener();
}

/** Add a dialog to the end of the queue. Returns its id. */
export function enqueueDialog(options: DialogOptions): number {
  const id = nextId++;
  const buttons = options.buttons && options.buttons.length > 0 ? options.buttons : [];
  publish([...queue, { ...options, id, buttons }]);
  return id;
}

/** Take a dialog off the queue, whether or not it is the one on screen. */
export function closeDialog(id: number): void {
  if (!queue.some((request) => request.id === id)) return;
  publish(queue.filter((request) => request.id !== id));
}

/** The dialog on screen, or null. */
export function currentDialog(): DialogRequest | null {
  return queue[0] ?? null;
}

export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests: forget everything. */
export function resetDialogs(): void {
  nextId = 1;
  publish([]);
}
