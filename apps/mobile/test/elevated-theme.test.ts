/**
 * The theme inside a sheet or a dialog (src/ui/elevated-theme.ts, VER-200).
 */

import { darkTheme, lightTheme } from '@verso/tokens';
import { describe, expect, it } from 'vitest';

import { elevatedTheme } from '../src/ui/elevated-theme';

describe('bg/sheet', () => {
  it('is the canvas in light and one ramp step above it in dark', () => {
    expect(lightTheme.colors['bg/sheet']).toBe(lightTheme.colors['bg/canvas']);
    expect(darkTheme.colors['bg/sheet']).toBe(darkTheme.colors['bg/surface']);
    expect(darkTheme.colors['bg/sheet']).not.toBe(darkTheme.colors['bg/canvas']);
  });
});

describe('elevatedTheme', () => {
  it('leaves light alone', () => {
    expect(elevatedTheme(lightTheme)).toBe(lightTheme);
  });

  it('moves canvas and surface one step up in dark, so a surface fill stays off the sheet', () => {
    const elevated = elevatedTheme(darkTheme);
    expect(elevated.colors['bg/canvas']).toBe(darkTheme.colors['bg/sheet']);
    expect(elevated.colors['bg/surface']).toBe(darkTheme.colors['bg/placeholder']);
    expect(elevated.colors['bg/surface']).not.toBe(elevated.colors['bg/sheet']);
    expect(elevated.colors['text/primary']).toBe(darkTheme.colors['text/primary']);
    expect(elevated.scheme).toBe('dark');
  });

  it('returns the same object each time, so it is safe to call while rendering', () => {
    expect(elevatedTheme(darkTheme)).toBe(elevatedTheme(darkTheme));
  });

  it('does not touch the dark theme it was given', () => {
    elevatedTheme(darkTheme);
    expect(darkTheme.colors['bg/surface']).toBe('#1C1C1E');
  });
});
