/**
 * The action sheets and alerts this page opens.
 *
 * None of them were drawn: the ellipsis menu, the change-status sheet, the
 * "Already ranked" alert and the Time-to-beat alert are all rule 7, conventions
 * first, and iOS has a native control for each. Using the native ones rather
 * than drawing a sheet means they inherit the platform's blur, its haptics, its
 * dismiss gesture and its accessibility for free, and it means the destructive
 * item is red because the system says so rather than because a screen picked a
 * color.
 *
 * `ActionSheetIOS` is iOS-only; everywhere else the same choices come back as
 * an alert, which is the closest thing Android has. The app is iOS-first, so
 * that path is a fallback rather than a design.
 *
 * In a browser neither exists (react-native-web's `Alert.alert` does nothing,
 * W0 finding 1), so on web each of the three goes to `lib/dialog.ts`: the
 * action sheet becomes `select`, a list in the app's `Dialog`, and the two
 * alerts become dialogs with the same buttons. The iOS and Android paths
 * below are untouched; once wave A's game-page work has merged, this file can
 * become three calls to `lib/dialog.ts`, which holds the same native paths.
 */

import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { select, showDialog } from '@/lib/dialog';
import { t } from '@/lib/i18n';

export interface SheetChoice {
  label: string;
  /** Red, and last but one: removing something the user has kept. */
  destructive?: boolean;
  onPress: () => void;
}

/**
 * Run a choice on the next tick rather than inside UIKit's dismiss.
 *
 * Two of these menus open another one — "Change status…" opens the status
 * sheet, "Remove from library" opens a confirm — and a UIAlertController
 * presented from inside the handler of the one that is still on screen is a
 * presentation that silently does not happen. One tick is enough.
 */
function defer(action: () => void): void {
  setTimeout(action, 0);
}

/** A native action sheet, with Cancel appended. */
export function showActionSheet(options: { title?: string; choices: SheetChoice[] }): void {
  const { title, choices } = options;

  if (Platform.OS === 'web') {
    select({ title, choices });
    return;
  }

  if (Platform.OS === 'ios') {
    const labels = [...choices.map((choice) => choice.label), t('common.cancel')];
    const destructive = choices.findIndex((choice) => choice.destructive);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: labels,
        cancelButtonIndex: labels.length - 1,
        ...(destructive === -1 ? {} : { destructiveButtonIndex: destructive }),
      },
      // The cancel index falls off the end of `choices`, so cancelling is
      // simply nothing happening.
      (index) => {
        const choice = choices[index];
        if (choice) defer(choice.onPress);
      },
    );
    return;
  }

  Alert.alert(title ?? '', undefined, [
    ...choices.map((choice) => ({
      text: choice.label,
      style: choice.destructive ? ('destructive' as const) : ('default' as const),
      onPress: () => defer(choice.onPress),
    })),
    { text: t('common.cancel'), style: 'cancel' as const },
  ]);
}

/** "Are you sure?", for the one careless tap that cannot be undone (rule 13). */
export function confirmDestructive(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    showDialog({
      title: options.title,
      message: options.message,
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        { text: options.confirmLabel, style: 'destructive', onPress: options.onConfirm },
      ],
    });
    return;
  }

  Alert.alert(options.title, options.message, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: options.confirmLabel, style: 'destructive', onPress: options.onConfirm },
  ]);
}

/** A plain alert with one dismiss button: the Time-to-beat breakdown. */
export function showInfo(title: string, message: string): void {
  if (Platform.OS === 'web') {
    showDialog({ title, message, buttons: [{ text: t('browse.game.done'), style: 'cancel' }] });
    return;
  }

  Alert.alert(title, message, [{ text: t('browse.game.done'), style: 'cancel' }]);
}
