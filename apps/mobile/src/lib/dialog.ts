/**
 * Alerts, confirms and choice lists that work in the browser too.
 *
 * `alert` has `Alert.alert`'s signature exactly, so a call site changes its
 * import and nothing else. On the phone it is `Alert.alert` itself, and so is
 * `showDialog`: the native alert is the convention there (rule 7) and nothing
 * about the phone changes. On web, where react-native-web's `Alert.alert` does
 * nothing at all (W0 finding 1), they put a request on the queue in
 * `dialog-store.ts` and the root layout's `DialogHost` draws it with the
 * `Dialog` primitive: a modal with a focus trap, Escape for cancel, Enter for
 * the default button.
 *
 * `select` is the action sheet: a title, a list of choices, Cancel. On iOS it
 * is `ActionSheetIOS`, on Android the alert fallback, both exactly as
 * `screens/game/native-menus.ts` has always drawn them; on web the choices are
 * a `Menu`-style list inside the dialog. native-menus.ts keeps its own copy of
 * the two native paths until wave A has merged its game-page work, after which
 * it can become a call to this.
 */

import { ActionSheetIOS, Alert, Platform } from 'react-native';

import {
  buttonsFromAlert,
  dialogWord,
  enqueueDialog,
  type DialogButton,
  type DialogChoice,
  type DialogOptions,
} from './dialog-store';

export type { DialogButton, DialogButtonStyle, DialogChoice, DialogOptions } from './dialog-store';

/**
 * Run a choice on the next tick rather than inside the dismiss.
 *
 * A choice that opens another dialog ("Remove from library" opening its
 * confirm) would otherwise present from inside the handler of the one still on
 * screen: on iOS that presentation silently does not happen, and on web it
 * would queue behind a dialog that is about to close anyway. Same reason as
 * `defer` in native-menus.ts.
 */
function defer(action: () => void): () => void {
  return () => {
    setTimeout(action, 0);
  };
}

/**
 * React Native's `Alert.alert`, everywhere.
 *
 * Native: `Alert.alert` with the same arguments, untouched. Web: a dialog with
 * the same title, message and buttons, mapped by `buttonsFromAlert` (no
 * buttons means one "OK", as on the phone). `options.onDismiss` runs when the
 * dialog closes without a button, as Android's does.
 */
export const alert: typeof Alert.alert = (title, message, buttons, options) => {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  enqueueDialog({
    title,
    message,
    buttons: buttonsFromAlert(buttons),
    onDismiss: options?.onDismiss,
  });
};

/**
 * A dialog from options rather than positional arguments.
 *
 * On native it is the same `Alert.alert`: a title (empty if none), the
 * message, the buttons. `choices` are for `select` and are ignored here.
 */
export function showDialog(options: DialogOptions): void {
  const buttons: DialogButton[] =
    options.buttons && options.buttons.length > 0
      ? [...options.buttons]
      : [{ text: dialogWord('common.ok'), style: 'default' }];

  if (Platform.OS !== 'web') {
    Alert.alert(options.title ?? '', options.message, buttons, { onDismiss: options.onDismiss });
    return;
  }

  enqueueDialog({ ...options, choices: undefined, buttons });
}

export interface SelectOptions {
  title?: string;
  /** Web and Android only; iOS's action sheet takes a message too, so it is passed there. */
  message?: string;
  choices: readonly DialogChoice[];
  /** "Cancel" unless a caller needs another word. */
  cancelLabel?: string;
}

/**
 * Pick one of a few: the action sheet, as a list in a dialog on web.
 *
 * Cancel is appended and choosing it does nothing, on every platform. A
 * choice's `onPress` runs on the next tick after the sheet has closed, so it
 * may open another dialog.
 */
export function select(options: SelectOptions): void {
  const { title, message, choices, cancelLabel = dialogWord('common.cancel') } = options;

  if (Platform.OS === 'ios') {
    const labels = [...choices.map((choice) => choice.label), cancelLabel];
    const destructive = choices.findIndex((choice) => choice.destructive);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: labels,
        cancelButtonIndex: labels.length - 1,
        ...(destructive === -1 ? {} : { destructiveButtonIndex: destructive }),
      },
      // The cancel index falls off the end of `choices`, so cancelling is
      // simply nothing happening.
      (index) => {
        const choice = choices[index];
        if (choice) defer(choice.onPress)();
      },
    );
    return;
  }

  if (Platform.OS !== 'web') {
    Alert.alert(title ?? '', message, [
      ...choices.map((choice) => ({
        text: choice.label,
        style: choice.destructive ? ('destructive' as const) : ('default' as const),
        onPress: defer(choice.onPress),
      })),
      { text: cancelLabel, style: 'cancel' as const },
    ]);
    return;
  }

  enqueueDialog({
    title,
    message,
    choices: choices.map((choice) => ({ ...choice, onPress: defer(choice.onPress) })),
    buttons: [{ text: cancelLabel, style: 'cancel' }],
  });
}
