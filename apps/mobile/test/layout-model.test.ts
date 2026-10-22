import { describe, expect, it } from 'vitest';

import {
  barFor,
  contentWidthFor,
  READING_WIDTH,
  readingInsetFor,
  REGULAR_BREAKPOINT,
  WIDE_BREAKPOINT,
  widthClassFor,
} from '../src/lib/layout-model';

/**
 * The windows the app meets, in points (docs/design/duo-brief.md, "The
 * geometry"). The Duo numbers were read from the iPhone Duo simulator on
 * iOS 27.1; the insets are the simulator's and are not Apple's published
 * figures, which is why the rules use thresholds rather than the readings.
 */
const PHONE = { width: 402, height: 874, insets: { top: 59, right: 0 } };
const DUO_OUTER = { width: 466, height: 678, insets: { top: 0, right: 84 } };
const DUO_INNER_PORTRAIT = { width: 669, height: 951, insets: { top: 82, right: 0 } };
const DUO_INNER_LANDSCAPE = { width: 951, height: 669, insets: { top: 0, right: 84 } };
const DUO_SPLIT_LEFT = { width: 475, height: 669, insets: { top: 0, right: 0 } };

describe('widthClassFor', () => {
  it('calls a phone and the Duo outer display compact', () => {
    expect(widthClassFor(PHONE.width)).toBe('compact');
    expect(widthClassFor(DUO_OUTER.width)).toBe('compact');
    expect(widthClassFor(DUO_SPLIT_LEFT.width)).toBe('compact');
  });

  it('calls the Duo inner display regular in both orientations', () => {
    expect(widthClassFor(DUO_INNER_PORTRAIT.width)).toBe('regular');
    expect(widthClassFor(DUO_INNER_LANDSCAPE.width)).toBe('regular');
  });

  it('keeps the web breakpoint where web-brief.md put it', () => {
    expect(WIDE_BREAKPOINT).toBe(1024);
    expect(widthClassFor(1023)).toBe('regular');
    expect(widthClassFor(1024)).toBe('wide');
    expect(widthClassFor(REGULAR_BREAKPOINT - 1)).toBe('compact');
    expect(widthClassFor(REGULAR_BREAKPOINT)).toBe('regular');
  });
});

describe('barFor', () => {
  it('keeps the bar at the bottom on a phone', () => {
    expect(barFor({ platform: 'ios', insets: PHONE.insets })).toBe('bottom');
  });

  it('moves the bar to the side where iOS moved the status bar', () => {
    expect(barFor({ platform: 'ios', insets: DUO_OUTER.insets })).toBe('side');
    expect(barFor({ platform: 'ios', insets: DUO_INNER_LANDSCAPE.insets })).toBe('side');
  });

  it('keeps a bottom bar on the inner display in portrait', () => {
    expect(barFor({ platform: 'ios', insets: DUO_INNER_PORTRAIT.insets })).toBe('bottom');
  });

  it('keeps a bottom bar in the left pane of Split View, which has no column', () => {
    expect(barFor({ platform: 'ios', insets: DUO_SPLIT_LEFT.insets })).toBe('bottom');
  });

  it('never moves the bar on the web or Android', () => {
    expect(barFor({ platform: 'web', insets: DUO_OUTER.insets })).toBe('bottom');
    expect(barFor({ platform: 'android', insets: DUO_OUTER.insets })).toBe('bottom');
  });
});

describe('contentWidthFor', () => {
  it('takes the column off the window only when the bar is on the side', () => {
    expect(contentWidthFor(DUO_OUTER.width, 'side', DUO_OUTER.insets.right)).toBe(382);
    expect(contentWidthFor(PHONE.width, 'bottom', PHONE.insets.right)).toBe(402);
    expect(contentWidthFor(DUO_INNER_PORTRAIT.width, 'bottom', 0)).toBe(669);
  });
});

describe('readingInsetFor', () => {
  it('centers a one-column screen only in a regular window', () => {
    expect(readingInsetFor('compact', 402)).toBe(0);
    expect(readingInsetFor('regular', DUO_INNER_PORTRAIT.width)).toBe(14);
    expect(readingInsetFor('regular', DUO_INNER_LANDSCAPE.width - DUO_INNER_LANDSCAPE.insets.right)).toBe(113);
    expect(readingInsetFor('wide', 1280)).toBe(0);
  });

  it('never goes negative in a regular window narrower than the reading width', () => {
    expect(readingInsetFor('regular', 600)).toBe(0);
    expect(READING_WIDTH).toBe(640);
  });
});
