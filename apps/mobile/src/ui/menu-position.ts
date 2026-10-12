/**
 * Where a dropdown opens, given the trigger's rectangle and the viewport.
 *
 * Kept apart from `menu.tsx` so it can be tested without a renderer. The rule
 * is the browser convention: under the trigger, aligned to the edge the
 * caller chose; above it when there is not room below and there is above;
 * never past the viewport's sides.
 */

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * One of `top`/`bottom` and one of `left`/`right`, as absolute offsets inside a
 * full-viewport overlay.
 */
export interface MenuPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface MenuPositionOptions {
  /** Which edge of the trigger the menu lines up with. */
  align: 'start' | 'end';
  /** The gap between trigger and menu, and the margin kept from the viewport edge. */
  gap: number;
  /** An estimate of the menu's height, from its row count. */
  estimatedHeight: number;
  /** The menu's minimum width, so `start` can be pulled in from the right edge. */
  minWidth: number;
}

export function menuPosition(trigger: Rect, viewport: Viewport, options: MenuPositionOptions): MenuPosition {
  const { align, gap, estimatedHeight, minWidth } = options;

  const roomBelow = viewport.height - trigger.bottom - gap;
  const roomAbove = trigger.top - gap;
  const opensUp = roomBelow < estimatedHeight && roomAbove > roomBelow;

  const vertical: MenuPosition = opensUp
    ? { bottom: viewport.height - trigger.top + gap }
    : { top: trigger.bottom + gap };

  // `start` keeps the menu's left edge on the trigger's, unless that would
  // push a minimum-width menu off the right; `end` keeps the right edges
  // together, unless that would push it off the left.
  const horizontal: MenuPosition =
    align === 'start'
      ? { left: Math.max(gap, Math.min(trigger.left, viewport.width - minWidth - gap)) }
      : { right: Math.max(gap, Math.min(viewport.width - trigger.right, viewport.width - minWidth - gap)) };

  return { ...vertical, ...horizontal };
}
