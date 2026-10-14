/**
 * A modal that asks: a title, a line, one to three buttons.
 *
 * The phone asks with the native alert, which is the convention there (rule 7)
 * and which react-native-web does not draw at all (W0 finding 1). This is the
 * web's equivalent, and the presentation W3 asks for: a centered dialog at
 * 1024 px and wider, a card anchored to the bottom edge like `Sheet` below
 * that. Same content, same buttons, one component.
 *
 * Mostly reached through `alert`, `showDialog` and `select` in `lib/dialog.ts`,
 * which put a request on a queue that the one `DialogHost` in the root layout
 * draws. A screen that needs a dialog with content of its own can render
 * `Dialog` directly, controlled by `visible`.
 *
 * Keyboard, on web:
 * - Focus is trapped inside while it is open (react-native-web's `Modal`
 *   traps it, `focus.ts` wraps Tab between the buttons) and goes back to
 *   whatever opened it when it closes.
 * - Escape presses the cancel button, and so does a click on the dim
 *   (`cancelButtonIndex` decides which button that is, if any).
 * - Enter presses the default button, the first that is neither cancel nor
 *   destructive (or a lone "Done"), unless a button has the focus, in which
 *   case that button is what Enter presses. A destructive action is never the
 *   default (`defaultButtonIndex`).
 *
 * Colors are `Sheet`'s: `bg/sheet` over a 35% black dim (VER-200), so in dark
 * mode the card is #1C1C1E rather than the canvas black that vanished into the
 * dimmed screen, and its content sits in `ElevatedScope` so the secondary
 * buttons and a `select` list's highlight step up with it. The bottom-anchored
 * card also takes `Sheet`'s dark top hairline; the centered card stands clear
 * of every edge and its fill is edge enough. The bottom-anchored card has no
 * grabber, because nothing about it can be dragged.
 */

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buttonOrder,
  buttonVariant,
  cancelButtonIndex,
  closeDialog,
  currentDialog,
  defaultButtonIndex,
  subscribeDialogs,
  type DialogButton,
} from '@/lib/dialog-store';
import { useLayout } from '@/lib/use-layout';

import { Button } from './button';
import { useRestoreFocus, wrapTab } from './focus';
import { NO_OUTLINE } from './interaction';
import { MenuList, type MenuItem } from './menu';
import { DIM_COLOR, sheetEdge } from './sheet';
import { Text } from './text';
import { ElevatedScope, useTheme } from './theme';

/** A centered dialog never runs wider than a line of its message can be read. */
const WIDE_MAX_WIDTH = 440;

export interface DialogProps {
  visible: boolean;
  title?: string;
  message?: string;
  /** One to three, in the caller's order; the dialog places them (see `buttonOrder`). */
  buttons: readonly DialogButton[];
  /**
   * Called when the dialog closes, before the pressed button's own `onPress`:
   * the parent hides it here. `button` is null for Escape or the dim when
   * there is no cancel button for them to press.
   */
  onClose: (button: DialogButton | null) => void;
  /** Content between the message and the buttons: `select`'s list. */
  children?: ReactNode;
}

export function Dialog({ visible, title, message, buttons, onClose, children }: DialogProps) {
  const cancelIndex = cancelButtonIndex(buttons);

  const press = (button: DialogButton) => {
    onClose(button);
    button.onPress?.();
  };

  const cancel = () => {
    const button = buttons[cancelIndex];
    if (button) press(button);
    else onClose(null);
  };

  // On web a closed dialog is not rendered at all. react-native-web's Modal
  // keeps its focus trap live through a hidden modal's exit, and a trap with
  // nothing in it takes the focus for itself, which is the focus `focus.ts`
  // is trying to hand back to the opener. On native the Modal stays mounted
  // so it can animate out.
  if (!visible && Platform.OS === 'web') return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancel}
      accessibilityLabel={title}>
      {visible ? (
        <DialogBody title={title} message={message} buttons={buttons} onPress={press} onCancel={cancel}>
          {children}
        </DialogBody>
      ) : null}
    </Modal>
  );
}

/**
 * The dim and the card. Its own component so its effects run when the card is
 * in the document: react-native-web's `Modal` portals its children on mount.
 */
function DialogBody({
  title,
  message,
  buttons,
  onPress,
  onCancel,
  children,
}: {
  title?: string;
  message?: string;
  buttons: readonly DialogButton[];
  onPress: (button: DialogButton) => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const wide = layout === 'wide';
  const cardRef = useRef<View>(null);
  useRestoreFocus();

  // Read by the key handler, which is registered once.
  const latest = useRef({ buttons, onPress });
  useEffect(() => {
    latest.current = { buttons, onPress };
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const card = cardRef.current as unknown as HTMLElement | null;
    if (!card) return;

    // Focus starts on the card itself, not on a button, so Enter means the
    // default button rather than whichever button happens to be first. A list
    // inside (`select`) has already focused its first row; leave it there.
    if (!card.contains(document.activeElement)) card.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (wrapTab(event, card)) return;
      if (event.key !== 'Enter') return;
      // A focused button or row takes its own Enter.
      if (event.target !== card) return;
      const { buttons: current, onPress: pressButton } = latest.current;
      const button = current[defaultButtonIndex(current)];
      if (!button) return;
      event.preventDefault();
      pressButton(button);
    };

    card.addEventListener('keydown', onKeyDown);
    return () => card.removeEventListener('keydown', onKeyDown);
  }, []);

  const order = buttonOrder(buttons, layout);

  return (
    <View style={[styles.fill, wide ? [styles.centered, { paddingHorizontal: theme.space[4] }] : styles.bottom]}>
      {/*
        The dim. A plain view with a responder rather than a Pressable: a
        Pressable is focusable, and the focus trap would hand it the focus
        before the card.
      */}
      <View style={styles.dim} onStartShouldSetResponder={() => true} onResponderRelease={onCancel} />

      <View
        ref={cardRef}
        // Focusable by script only, so the card can hold the focus at open.
        tabIndex={-1}
        style={[
          {
            backgroundColor: theme.colors['bg/sheet'],
            gap: theme.space[5],
          },
          wide
            ? {
                width: '100%',
                maxWidth: WIDE_MAX_WIDTH,
                borderRadius: theme.radius.xl,
                padding: theme.space[6],
              }
            : {
                width: '100%',
                borderTopLeftRadius: theme.radius.xl,
                borderTopRightRadius: theme.radius.xl,
                paddingTop: theme.space[6],
                paddingHorizontal: theme.space[4],
                // The home indicator sits over the last button otherwise.
                paddingBottom: insets.bottom + theme.space[4],
              },
          !wide && sheetEdge(theme),
          // The card holds the focus only to route Enter; it is not a control
          // and draws no ring.
          Platform.OS === 'web' && NO_OUTLINE,
        ]}>
        <ElevatedScope>
          {title || message ? (
            <View style={{ gap: theme.space[2] }}>
              {title ? (
                <Text style="headline" accessibilityRole="header">
                  {title}
                </Text>
              ) : null}
              {message ? (
                <Text style="subheadline" color="text/secondary">
                  {message}
                </Text>
              ) : null}
            </View>
          ) : null}

          {children}

          {buttons.length > 0 ? (
            <View
              style={[
                wide && buttons.length <= 3 ? styles.row : styles.column,
                { gap: theme.space[2] },
              ]}>
              {order.map((index) => {
                const button = buttons[index]!;
                return (
                  <Button
                    key={index}
                    label={button.text}
                    variant={buttonVariant(buttons, index)}
                    size={wide ? 'small' : 'compact'}
                    fullWidth={!wide}
                    onPress={() => onPress(button)}
                  />
                );
              })}
            </View>
          ) : null}
        </ElevatedScope>
      </View>
    </View>
  );
}

/**
 * Whatever `showDialog`, `alert` or `select` asked for, one at a time.
 *
 * Mounted once, in `app/_layout.tsx`, inside the providers and outside the
 * Stack, so a dialog can open over any route. Renders nothing on native,
 * where those calls go to the platform's alert and never reach the queue.
 */
export function DialogHost() {
  const request = useSyncExternalStore(subscribeDialogs, currentDialog, () => null);
  if (!request) return null;

  const pick = (item: MenuItem) => {
    closeDialog(request.id);
    item.onPress();
  };

  return (
    <Dialog
      // A fresh Modal per request, so the focus and the fade start over.
      key={request.id}
      visible
      title={request.title}
      message={request.message}
      buttons={request.buttons}
      onClose={(button) => {
        closeDialog(request.id);
        // Closed without a button: what Android's alert reports as a dismiss.
        if (!button) request.onDismiss?.();
      }}>
      {request.choices && request.choices.length > 0 ? (
        <MenuList items={request.choices} onPick={pick} autoFocus />
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  bottom: { justifyContent: 'flex-end' },
  dim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: DIM_COLOR,
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  column: { flexDirection: 'column' },
});
