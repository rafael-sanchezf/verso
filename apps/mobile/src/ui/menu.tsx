/**
 * A dropdown menu, for the web build.
 *
 * On the phone the app's menus are the platform's own: `Link.Menu` for Home's
 * long press and `@expo/ui`'s `MenuView` for the backlog's Sort, both drawn by
 * iOS with SF Symbols. Neither does anything in a browser (W0 findings 2 and
 * 3): MenuView renders its trigger and fires nothing, and the click falls
 * through to the row beneath it. The web convention is a dropdown anchored to
 * the control that opened it, so that is this.
 *
 * - Items are `{ label, icon?, destructive?, onPress }`, the same shape the
 *   native menus are given, so a caller writes the list once.
 * - Keyboard: Enter or Space on the trigger opens it with the first item
 *   focused; the arrow keys move (Home and End jump); Enter picks; Escape
 *   closes and gives focus back to the trigger. A click outside closes it.
 * - It opens below the trigger, aligned to the edge the caller names, and
 *   above it when the window has no room below (`menu-position.ts`).
 *
 * On native `Menu` renders its trigger alone, so a caller can put the same
 * trigger inside `Link.Menu` or MenuView there and inside this on web. The
 * screens are wired on each screen's branch in the web round, not here.
 *
 * `MenuList` is the list without the dropdown, for `select` in a dialog.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useRestoreFocus } from './focus';
import { Icon, type IconName } from './icon';
import {
  interactionStyle,
  isHovered,
  isKeyboardModality,
  NO_OUTLINE,
  PRESSED_OPACITY,
  type InteractionState,
} from './interaction';
import { menuPosition, type MenuPosition } from './menu-position';
import { Text } from './text';
import { useTheme, type ColorToken } from './theme';

export interface MenuItem {
  label: string;
  icon?: IconName;
  /** Drawn in `text/destructive`, like Settings' destructive rows. */
  destructive?: boolean;
  onPress: () => void;
}

/** 44, the iOS minimum target; a menu opened by touch on a narrow browser needs it too. */
const ROW_HEIGHT = 44;
/** Wide enough for "Remove from library" at 16 with an icon. */
const MENU_MIN_WIDTH = 200;
const MENU_MAX_WIDTH = 320;

/** The DOM node behind a react-native-web host component. Web only. */
function domNode(ref: View | null): HTMLElement | null {
  return ref as unknown as HTMLElement | null;
}

export interface MenuListProps {
  items: readonly MenuItem[];
  /** Called with the item chosen; the caller closes whatever holds the list. */
  onPick: (item: MenuItem) => void;
  /** Focus the first item when the list appears: true when opened from the keyboard or a dialog. */
  autoFocus?: boolean;
}

/**
 * The rows, with arrow-key movement between them.
 *
 * A row is highlighted with `bg/surface` while hovered or while it holds the
 * keyboard's focus, which is how a menu shows where the keyboard is; a ring
 * around one row of a list reads as a second selection.
 */
export function MenuList({ items, onPick, autoFocus = false }: MenuListProps) {
  const theme = useTheme();
  const listRef = useRef<View>(null);
  const itemRefs = useRef<(View | null)[]>([]);
  const iconSlot = items.some((item) => item.icon !== undefined);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (autoFocus) domNode(itemRefs.current[0] ?? null)?.focus();

    const list = domNode(listRef.current);
    if (!list) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const nodes = itemRefs.current.map(domNode).filter((node): node is HTMLElement => node !== null);
      if (nodes.length === 0) return;
      const current = nodes.indexOf(document.activeElement as HTMLElement);

      let next: number | null = null;
      if (event.key === 'ArrowDown') next = current === -1 ? 0 : (current + 1) % nodes.length;
      else if (event.key === 'ArrowUp') next = current === -1 ? nodes.length - 1 : (current - 1 + nodes.length) % nodes.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = nodes.length - 1;
      if (next === null) return;

      // The arrows would otherwise scroll the page behind the overlay.
      event.preventDefault();
      nodes[next]!.focus();
    };

    list.addEventListener('keydown', onKeyDown);
    return () => list.removeEventListener('keydown', onKeyDown);
  }, [autoFocus]);

  return (
    <View ref={listRef} accessibilityRole="menu" style={{ gap: 2 }}>
      {items.map((item, index) => {
        const color: ColorToken = item.destructive ? 'text/destructive' : 'text/primary';

        return (
          <Pressable
            key={`${index}-${item.label}`}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            onPress={() => onPick(item)}
            style={(state: InteractionState) => [
              styles.row,
              {
                minHeight: ROW_HEIGHT,
                gap: theme.space[3],
                paddingHorizontal: theme.space[3],
                borderRadius: theme.radius.sm,
              },
              (isHovered(state) || (state.focused === true && isKeyboardModality())) && {
                backgroundColor: theme.colors['bg/surface'],
              },
              state.pressed && styles.pressed,
              // The browser's own ring would draw on top of the highlight.
              Platform.OS === 'web' && NO_OUTLINE,
            ]}>
            {iconSlot ? (
              <View style={styles.iconSlot}>
                {item.icon ? <Icon name={item.icon} size={18} color={color} /> : null}
              </View>
            ) : null}
            <Text size={16} color={color} numberOfLines={1} layout={styles.label}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface MenuProps {
  items: readonly MenuItem[];
  /** What the trigger shows: an ellipsis icon, a chip's look. The menu wraps it in its own button. */
  children: ReactNode;
  /** The trigger's name for a screen reader: "More", "Sort". */
  accessibilityLabel: string;
  /** Which edge of the trigger the menu lines up with. `end` for a trigger at the right of a row. */
  align?: 'start' | 'end';
  /** Layout for the trigger: margins, a hit area. */
  style?: StyleProp<ViewStyle>;
}

/** A dropdown on web; the trigger alone on native. */
export function Menu(props: MenuProps) {
  if (Platform.OS !== 'web') return <View style={props.style}>{props.children}</View>;
  return <WebMenu {...props} />;
}

function WebMenu({ items, children, accessibilityLabel, align = 'start', style }: MenuProps) {
  const theme = useTheme();
  const triggerRef = useRef<View>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const open = position !== null;

  const close = useCallback(() => setPosition(null), []);

  const show = () => {
    const trigger = domNode(triggerRef.current);
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    setPosition(
      menuPosition(
        rect,
        { width: window.innerWidth, height: window.innerHeight },
        {
          align,
          gap: theme.space[1],
          estimatedHeight: items.length * (ROW_HEIGHT + 2) + theme.space[1] * 2,
          minWidth: MENU_MIN_WIDTH,
        },
      ),
    );
  };

  // A menu pinned to where its trigger was is wrong after a resize; closing
  // is what a browser's own menus do.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [open, close]);

  const pick = (item: MenuItem) => {
    close();
    // After the menu has closed and handed focus back, so an item that opens
    // a dialog opens it over the page rather than over a closing menu.
    setTimeout(item.onPress, 0);
  };

  const shadowOpacity = theme.scheme === 'dark' ? 0.5 : 0.16;

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        onPress={show}
        style={(state: InteractionState) => [style, interactionStyle(state, theme, { ringRadius: theme.radius.sm })]}>
        {children}
      </Pressable>

      {/*
        Rendered only while open: react-native-web's Modal keeps its focus
        trap live while hidden, and an empty trap takes the focus that
        `MenuPanelFocus` hands back to the trigger.
      */}
      {position ? (
        <Modal visible transparent animationType="none" onRequestClose={close}>
          {/* The outside click. Not a button: Escape is the keyboard's way out. */}
          <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={close} />
          <View
            style={[
              styles.panel,
              position,
              {
                minWidth: MENU_MIN_WIDTH,
                maxWidth: MENU_MAX_WIDTH,
                padding: theme.space[1],
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors['bg/canvas'],
                borderColor: theme.colors['border/separator'],
                // The one shadow on web, from the same black the covers' edge uses.
                boxShadow: `0px 8px 24px rgba(0, 0, 0, ${shadowOpacity})`,
              },
            ]}>
            <MenuPanelFocus />
            <MenuList items={items} onPick={pick} autoFocus />
          </View>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * Gives the focus back to the trigger when the menu closes (`focus.ts`). It
 * records the trigger while rendering, before the list's effect moves the
 * focus to the first row.
 */
function MenuPanelFocus() {
  useRestoreFocus();
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // 18 is the icons' size; a row without one keeps the slot so labels align.
  iconSlot: { width: 18, alignItems: 'center' },
  label: { flex: 1 },
  pressed: { opacity: PRESSED_OPACITY },
  panel: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
