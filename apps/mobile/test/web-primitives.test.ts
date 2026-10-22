import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  useWindowDimensions: () => ({ width: 0, height: 0 }),
}));

import { WIDE_BREAKPOINT, widthClassFor } from '../src/lib/layout-model';
import { isTypingTarget, matchesShortcut, type ShortcutEvent } from '../src/lib/use-shortcut';
import { dateOnly, dateOnlyOf, localDateOf } from '../src/ui/date-field-value';
import { menuPosition } from '../src/ui/menu-position';

describe('widthClassFor', () => {
  it('turns wide at 1024, the web breakpoint', () => {
    expect(WIDE_BREAKPOINT).toBe(1024);
    expect(widthClassFor(1023)).toBe('regular');
    expect(widthClassFor(1024)).toBe('wide');
    expect(widthClassFor(1440)).toBe('wide');
  });

  it('is compact for every phone, and before the window is measured', () => {
    expect(widthClassFor(402)).toBe('compact');
    expect(widthClassFor(0)).toBe('compact');
  });
});

describe('matchesShortcut', () => {
  const press = (key: string, extra: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { tagName: 'DIV' },
    ...extra,
  });

  it('fires for its key outside a field', () => {
    expect(matchesShortcut(press('/'), '/')).toBe(true);
    expect(matchesShortcut(press('k'), '/')).toBe(false);
  });

  it('never fires while typing', () => {
    expect(matchesShortcut(press('/', { target: { tagName: 'INPUT' } }), '/')).toBe(false);
    expect(matchesShortcut(press('/', { target: { tagName: 'textarea' } }), '/')).toBe(false);
    expect(matchesShortcut(press('/', { target: { tagName: 'SELECT' } }), '/')).toBe(false);
    expect(matchesShortcut(press('/', { target: { tagName: 'DIV', isContentEditable: true } }), '/')).toBe(false);
  });

  it("leaves the browser's and the system's chords alone", () => {
    expect(matchesShortcut(press('/', { metaKey: true }), '/')).toBe(false);
    expect(matchesShortcut(press('/', { ctrlKey: true }), '/')).toBe(false);
    expect(matchesShortcut(press('/', { altKey: true }), '/')).toBe(false);
  });

  it('matches by the character typed, so Shift is allowed', () => {
    expect(matchesShortcut(press('?'), '?')).toBe(true);
  });

  it('treats a missing or odd target as not a field', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({})).toBe(false);
    expect(isTypingTarget('INPUT')).toBe(false);
  });
});

describe('DateField values', () => {
  it('reads a stored day as that day in local time, not UTC midnight', () => {
    const date = localDateOf('2026-09-24')!;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 8, 24]);
    expect(dateOnlyOf('2026-09-24')).toBe('2026-09-24');
  });

  it("shows a timestamp's local day", () => {
    const afternoon = new Date(2026, 8, 24, 15, 30);
    expect(dateOnlyOf(afternoon.toISOString())).toBe('2026-09-24');
  });

  it('gives back a zero-padded local day', () => {
    expect(dateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('is null for nothing or nonsense', () => {
    expect(dateOnlyOf(null)).toBeNull();
    expect(dateOnlyOf('')).toBeNull();
    expect(dateOnlyOf('not a date')).toBeNull();
  });
});

describe('menuPosition', () => {
  const viewport = { width: 1280, height: 800 };
  const options = { align: 'start' as const, gap: 4, estimatedHeight: 200, minWidth: 200 };

  it('opens under the trigger, aligned to its left edge', () => {
    const trigger = { top: 100, bottom: 132, left: 300, right: 340 };
    expect(menuPosition(trigger, viewport, options)).toEqual({ top: 136, left: 300 });
  });

  it('aligns right edges for a trigger at the end of a row', () => {
    const trigger = { top: 100, bottom: 132, left: 1200, right: 1240 };
    expect(menuPosition(trigger, viewport, { ...options, align: 'end' })).toEqual({ top: 136, right: 40 });
  });

  it('opens above when there is no room below', () => {
    const trigger = { top: 700, bottom: 732, left: 300, right: 340 };
    expect(menuPosition(trigger, viewport, options)).toEqual({ bottom: 104, left: 300 });
  });

  it('stays below when neither side has room and below has more', () => {
    const short = { width: 1280, height: 300 };
    const trigger = { top: 60, bottom: 92, left: 300, right: 340 };
    expect(menuPosition(trigger, short, { ...options, estimatedHeight: 250 })).toEqual({ top: 96, left: 300 });
  });

  it('never runs off either side', () => {
    const nearRight = { top: 100, bottom: 132, left: 1200, right: 1240 };
    expect(menuPosition(nearRight, viewport, options).left).toBe(1280 - 200 - 4);

    const nearLeft = { top: 100, bottom: 132, left: 10, right: 50 };
    expect(menuPosition(nearLeft, viewport, { ...options, align: 'end' }).right).toBe(1280 - 200 - 4);
  });
});
