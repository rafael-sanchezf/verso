import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The shim's two halves meet at `Platform.OS`: the native one must hand
// `Alert.alert` exactly what it was given, the web one must put the same
// dialog on the queue. One mutable mock covers both.
const rn = vi.hoisted(() => ({
  Platform: { OS: 'ios' as string },
  Alert: { alert: vi.fn() },
  ActionSheetIOS: { showActionSheetWithOptions: vi.fn() },
}));
vi.mock('react-native', () => rn);

import { alert, select, showDialog } from '../src/lib/dialog';
import {
  buttonOrder,
  buttonsFromAlert,
  buttonVariant,
  cancelButtonIndex,
  closeDialog,
  currentDialog,
  defaultButtonIndex,
  resetDialogs,
  type DialogButton,
} from '../src/lib/dialog-store';

beforeEach(() => {
  rn.Platform.OS = 'ios';
  rn.Alert.alert.mockClear();
  rn.ActionSheetIOS.showActionSheetWithOptions.mockClear();
  resetDialogs();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('alert on native', () => {
  it('is Alert.alert with the same arguments, untouched', () => {
    const buttons = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Delete', style: 'destructive' as const, onPress: () => {} },
    ];
    const options = { cancelable: true };

    alert('Delete your account?', 'This cannot be undone.', buttons, options);

    expect(rn.Alert.alert).toHaveBeenCalledTimes(1);
    expect(rn.Alert.alert).toHaveBeenCalledWith('Delete your account?', 'This cannot be undone.', buttons, options);
    expect(currentDialog()).toBeNull();
  });

  it('passes a bare title through too, on Android as on iOS', () => {
    rn.Platform.OS = 'android';
    alert('Export failed');
    expect(rn.Alert.alert).toHaveBeenCalledWith('Export failed', undefined, undefined, undefined);
  });
});

describe('alert on web', () => {
  beforeEach(() => {
    rn.Platform.OS = 'web';
  });

  it('queues a dialog instead of calling the no-op Alert', () => {
    alert('Export failed', 'Check your connection and try again.');

    expect(rn.Alert.alert).not.toHaveBeenCalled();
    const dialog = currentDialog();
    expect(dialog?.title).toBe('Export failed');
    expect(dialog?.message).toBe('Check your connection and try again.');
    // No buttons means one OK, as on the phone.
    expect(dialog?.buttons).toEqual([{ text: 'OK', style: 'default' }]);
  });

  it('keeps the buttons, their styles and their order', () => {
    const onDelete = vi.fn();
    alert('Delete your account?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);

    const buttons = currentDialog()!.buttons;
    expect(buttons.map((button) => [button.text, button.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Delete', 'destructive'],
    ]);
    expect(buttons[0]!.onPress).toBeUndefined();
    buttons[1]!.onPress!();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('passes onDismiss through for a close without a button', () => {
    const onDismiss = vi.fn();
    alert('Saved', undefined, undefined, { onDismiss });
    expect(currentDialog()?.onDismiss).toBe(onDismiss);
  });

  it('shows one dialog at a time, in the order they were asked for', () => {
    alert('First');
    alert('Second');
    expect(currentDialog()?.title).toBe('First');
    closeDialog(currentDialog()!.id);
    expect(currentDialog()?.title).toBe('Second');
    closeDialog(currentDialog()!.id);
    expect(currentDialog()).toBeNull();
  });
});

describe('buttonsFromAlert', () => {
  it("defaults to React Native's single OK", () => {
    expect(buttonsFromAlert()).toEqual([{ text: 'OK', style: 'default' }]);
    expect(buttonsFromAlert([])).toEqual([{ text: 'OK', style: 'default' }]);
  });

  it('labels a lone textless button OK and leaves the rest blank, as Android does', () => {
    expect(buttonsFromAlert([{}])).toEqual([{ text: 'OK', style: 'default' }]);
    expect(buttonsFromAlert([{ text: 'Later' }, {}]).map((button) => button.text)).toEqual(['Later', '']);
  });

  it('makes a missing style default', () => {
    expect(buttonsFromAlert([{ text: 'Import' }])[0]!.style).toBe('default');
  });
});

describe('which button the keys press', () => {
  const confirm: DialogButton[] = [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive' },
  ];
  const three: DialogButton[] = [
    { text: 'Later' },
    { text: 'Cancel', style: 'cancel' },
    { text: 'Import', style: 'default' },
  ];

  it('Escape presses the cancel button wherever it sits', () => {
    expect(cancelButtonIndex(confirm)).toBe(0);
    expect(cancelButtonIndex(three)).toBe(1);
  });

  it('Escape closes a lone acknowledgement through its button', () => {
    expect(cancelButtonIndex([{ text: 'OK', style: 'default' }])).toBe(0);
  });

  it('Escape presses nothing when every button is an action', () => {
    expect(cancelButtonIndex([{ text: 'Keep' }, { text: 'Delete', style: 'destructive' }])).toBe(-1);
    expect(cancelButtonIndex([{ text: 'Delete', style: 'destructive' }])).toBe(-1);
  });

  it('Enter presses the first button that is neither cancel nor destructive', () => {
    expect(defaultButtonIndex(three)).toBe(0);
    expect(defaultButtonIndex([{ text: 'Cancel', style: 'cancel' }, { text: 'Save' }])).toBe(1);
  });

  it('Enter never presses a destructive button', () => {
    expect(defaultButtonIndex(confirm)).toBe(-1);
  });

  it("Enter closes a dialog whose only button is a cancel, like the Time-to-beat breakdown's Done", () => {
    expect(defaultButtonIndex([{ text: 'Done', style: 'cancel' }])).toBe(0);
  });
});

describe('how the buttons are drawn', () => {
  const three: DialogButton[] = [
    { text: 'Later' },
    { text: 'Cancel', style: 'cancel' },
    { text: 'Import' },
  ];

  it('puts cancel first in a wide row, so the commit is at the right edge', () => {
    expect(buttonOrder(three, 'wide')).toEqual([1, 0, 2]);
  });

  it('puts cancel last in a compact column, under the actions', () => {
    expect(buttonOrder(three, 'compact')).toEqual([0, 2, 1]);
  });

  it('fills only the default button, reddens the destructive one, and keeps cancel quiet', () => {
    expect([0, 1, 2].map((index) => buttonVariant(three, index))).toEqual(['primary', 'secondary', 'secondary']);
    const confirm: DialogButton[] = [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ];
    expect([0, 1].map((index) => buttonVariant(confirm, index))).toEqual(['secondary', 'destructive']);
    expect(buttonVariant([{ text: 'Done', style: 'cancel' }], 0)).toBe('secondary');
  });
});

describe('showDialog', () => {
  it('is Alert.alert on native, with OK when no buttons are given', () => {
    showDialog({ title: 'Already ranked', message: 'This game is already in your ranking.' });
    expect(rn.Alert.alert).toHaveBeenCalledWith(
      'Already ranked',
      'This game is already in your ranking.',
      [{ text: 'OK', style: 'default' }],
      { onDismiss: undefined },
    );
  });

  it('queues the same dialog on web, without choices', () => {
    rn.Platform.OS = 'web';
    showDialog({ title: 'Time to beat', buttons: [{ text: 'Done', style: 'cancel' }], choices: [] });
    expect(currentDialog()?.buttons).toEqual([{ text: 'Done', style: 'cancel' }]);
    expect(currentDialog()?.choices).toBeUndefined();
  });
});

describe('select', () => {
  const choices = () => [
    { label: 'Change status…', onPress: vi.fn() },
    { label: 'Remove from library', destructive: true, onPress: vi.fn() },
  ];

  it('is the iOS action sheet with Cancel appended and the destructive index set', () => {
    const list = choices();
    select({ title: 'Hades', choices: list });

    const [options, callback] = rn.ActionSheetIOS.showActionSheetWithOptions.mock.calls[0]!;
    expect(options).toMatchObject({
      title: 'Hades',
      options: ['Change status…', 'Remove from library', 'Cancel'],
      cancelButtonIndex: 2,
      destructiveButtonIndex: 1,
    });

    vi.useFakeTimers();
    callback(2); // Cancel
    callback(0);
    vi.runAllTimers();
    expect(list[0]!.onPress).toHaveBeenCalledTimes(1);
    expect(list[1]!.onPress).not.toHaveBeenCalled();
  });

  it('is an alert on Android, the choices as buttons and Cancel last', () => {
    rn.Platform.OS = 'android';
    select({ title: 'Hades', choices: choices() });
    const [title, message, buttons] = rn.Alert.alert.mock.calls[0]!;
    expect(title).toBe('Hades');
    expect(message).toBeUndefined();
    expect(buttons.map((button: DialogButton) => [button.text, button.style])).toEqual([
      ['Change status…', 'default'],
      ['Remove from library', 'destructive'],
      ['Cancel', 'cancel'],
    ]);
  });

  it('is a list in a dialog on web, with Cancel the only button', () => {
    rn.Platform.OS = 'web';
    const list = choices();
    select({ title: 'Hades', choices: list });

    const dialog = currentDialog()!;
    expect(dialog.choices?.map((choice) => choice.label)).toEqual(['Change status…', 'Remove from library']);
    expect(dialog.choices?.[1]?.destructive).toBe(true);
    expect(dialog.buttons).toEqual([{ text: 'Cancel', style: 'cancel' }]);

    // A choice runs after the dialog has closed, so it may open another.
    vi.useFakeTimers();
    dialog.choices![0]!.onPress();
    expect(list[0]!.onPress).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(list[0]!.onPress).toHaveBeenCalledTimes(1);
  });
});
