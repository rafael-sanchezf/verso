/**
 * The column along the right edge of the iPhone Duo's outer display, and of
 * its inner display held in landscape (docs/design/duo-brief.md, "The column").
 *
 * iOS keeps that column for itself: the status bar and the camera at the top,
 * then the navigation buttons of its own containers, with the tab bar at the
 * bottom. Apple's apps put nothing between the column and the page: it is the
 * page's own background, and the controls float in it as glass capsules, the
 * way Safari's back and bookmarks sit under the clock. This module is Verso's
 * copy of what a native probe measured on the simulator
 * (docs/research/iphone-duo-column.md): one host drawn once at the root, over
 * the whole window, and a hook a screen calls to put its own controls into it
 * while the screen is the one in front.
 *
 * Two groups, in the HIG's order for the vertical axis, each one capsule:
 *
 * - **The top group** is the focused screen's controls, where a horizontal bar
 *   would have held them: Home's other media and the "+", Ranking's list or
 *   grid toggle, Profile's settings, a page's overflow menu. A pushed screen
 *   whose native Back button UIKit has already moved into the column says so,
 *   and its capsule starts under that button.
 * - **The bottom group** is the five tabs, icons alone, published by `TabBar`
 *   when the bar is on the side; the navigator leaves a spacer of the column's
 *   width so the screens stop where the column begins.
 *
 * The host is a plain store rather than context: a tab screen that is not in
 * front still renders, and must not re-render the one that is when it changes
 * its mind; `useSyncExternalStore` lets the host alone listen.
 */

import { useIsFocused } from 'expo-router';
import {
  useEffect,
  useId,
  useMemo,
  useSyncExternalStore,
  type DependencyList,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLayout, useSideColumnWidth } from '@/lib/use-layout';

import { Icon, type IconName } from './icon';
import { useTheme } from './theme';

/**
 * The column's measured geometry, in points, from the native probe on the
 * simulator (docs/research/iphone-duo-column.md, "Measured"). Apple's kit says
 * the 84 are 12 inside, 48 of control, 24 outside; the first control's top
 * edge is 173 down, under the clock and the status ring; a pushed screen's
 * Back is its own circle there and the next capsule starts 11 lower; the tab
 * capsule's bottom edge sits 24 above the screen's. Readings, not rules.
 */
export const COLUMN_TOP = 173;
export const COLUMN_INSIDE = 12;
export const COLUMN_BUTTON = 48;
export const NATIVE_BACK_CLEARANCE = COLUMN_BUTTON + 11;
export const COLUMN_BOTTOM = 24;

/** Cells in a capsule: 52 of pitch in the top group, 50 in the tab bar. */
const TOP_PITCH_GAP = 4;
const TAB_PITCH_GAP = 2;

/** The pill behind the selected cell, Apple's 44 by 58. */
const SELECTED_WIDTH = 44;
const SELECTED_HEIGHT = 58;

interface TopSlot {
  key: string;
  node: ReactNode;
  belowNativeBack: boolean;
}

interface ColumnState {
  top: TopSlot | null;
  tabs: ReactNode;
}

let state: ColumnState = { top: null, tabs: null };
const listeners = new Set<() => void>();

function publish(next: Partial<ColumnState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot() {
  return state;
}

/**
 * Put a screen's own controls in the column while the screen is in front.
 *
 * `render` is called once per change of `deps`, like `useMemo`; it returns the
 * cells, `ColumnButton`s, or null when the screen has none right now. The
 * answer is whether the column took them: `true` where the bar is on the
 * side, so the screen leaves the horizontal slot empty, `false` on a phone,
 * where the screen draws them where it always did.
 */
export function useSideColumn(
  render: () => ReactNode,
  deps: DependencyList,
  options: { belowNativeBack?: boolean } = {},
): boolean {
  const { bar } = useLayout();
  const focused = useIsFocused();
  const key = useId();
  const placed = bar === 'side';
  const belowNativeBack = options.belowNativeBack ?? false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const node = useMemo(render, deps);

  useEffect(() => {
    if (!placed || !focused) return;
    publish({ top: { key, node, belowNativeBack } });
    return () => {
      if (state.top?.key === key) publish({ top: null });
    };
  }, [placed, focused, key, node, belowNativeBack]);

  return placed;
}

/** The tab bar's way in: its cells, or null when the bar is at the bottom. */
export function useSideColumnTabs(tabs: ReactNode) {
  useEffect(() => {
    publish({ tabs });
    return () => {
      publish({ tabs: null });
    };
  }, [tabs]);
}

/**
 * The column itself. Rendered once, at the root, after the navigator, so it
 * sits over every screen; it draws nothing and takes no touches where the bar
 * is at the bottom.
 */
export function SideColumnHost() {
  const { bar } = useLayout();
  const width = useSideColumnWidth();
  const { top, tabs } = useSyncExternalStore(subscribe, snapshot, snapshot);

  if (bar !== 'side') return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { width, paddingLeft: COLUMN_INSIDE }]}>
      <View
        pointerEvents="box-none"
        style={{ paddingTop: COLUMN_TOP + (top?.belowNativeBack ? NATIVE_BACK_CLEARANCE : 0) }}>
        {top?.node ? <Capsule gap={TOP_PITCH_GAP}>{top.node}</Capsule> : null}
      </View>
      <View pointerEvents="box-none" style={{ paddingBottom: COLUMN_BOTTOM }}>
        {tabs ? <Capsule gap={TAB_PITCH_GAP}>{tabs}</Capsule> : null}
      </View>
    </View>
  );
}

/**
 * One glass capsule: the surface, the pill's radius, the shadow that lifts it
 * off the page. A capsule with one cell is a circle.
 */
function Capsule({ gap, children }: { gap: number; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.capsule,
        { backgroundColor: theme.colors['bg/surface'], gap, shadowColor: theme.colors['text/primary'] },
      ]}>
      {children}
    </View>
  );
}

export interface ColumnButtonProps {
  icon: IconName;
  /** The accessibility name; the column shows symbols alone (HIG: text stays in horizontal bars). */
  label: string;
  hint?: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** The pill behind the icon and the brand color on it: the state that is on. */
  selected?: boolean;
  /** A dashed ring inside the cell: a place for one more, like the switcher's "+". */
  dashed?: boolean;
  disabled?: boolean;
  iconSize?: number;
  strokeWidth?: number;
}

/** One cell in a column capsule. */
export function ColumnButton({
  icon,
  label,
  hint,
  onPress,
  onLongPress,
  selected = false,
  dashed = false,
  disabled = false,
  iconSize = 24,
  strokeWidth,
}: ColumnButtonProps) {
  const theme = useTheme();
  const color = selected ? 'brand/text' : dashed ? 'text/secondary' : 'text/primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
      {selected ? (
        <View style={[styles.selectedPill, { backgroundColor: theme.colors['bg/canvas'] }]} />
      ) : null}
      {dashed ? (
        <View style={[styles.dashedRing, { borderColor: theme.colors['border/separator'] }]}>
          <Icon name={icon} size={iconSize} color={color} strokeWidth={strokeWidth} />
        </View>
      ) : (
        <Icon name={icon} size={iconSize} color={color} strokeWidth={strokeWidth} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  capsule: {
    width: COLUMN_BUTTON,
    borderRadius: COLUMN_BUTTON / 2,
    alignItems: 'center',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cell: {
    width: COLUMN_BUTTON,
    height: COLUMN_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPill: {
    position: 'absolute',
    width: SELECTED_WIDTH,
    height: SELECTED_HEIGHT,
    borderRadius: SELECTED_WIDTH / 2,
  },
  dashedRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
