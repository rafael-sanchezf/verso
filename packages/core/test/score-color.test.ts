import { describe, expect, it } from 'vitest';

import { SCORE_ANCHORS, scoreColor, type TierPalette } from '../src/score-color';

/**
 * The tier values in packages/tokens/tokens.json: option A of decision 29, one
 * value per tier for light and dark.
 */
const light: TierPalette = {
  loved: '#006822',
  liked: '#5B6C00',
  fine: '#865900',
  disliked: '#BB0A10',
};

/**
 * Another palette (the retired 2026-09-16 dark values), to prove the function
 * has no palette of its own.
 */
const other: TierPalette = {
  loved: '#8AD989',
  liked: '#B7CF64',
  fine: '#F6B553',
  disliked: '#FFA89D',
};

describe('SCORE_ANCHORS', () => {
  it('sits at the center of each tier band', () => {
    expect(SCORE_ANCHORS).toEqual({ loved: 9.25, liked: 7.45, fine: 5.2, disliked: 1.95 });
  });
});

describe('scoreColor', () => {
  // The fidelity round frames' five badge scores, recomputed by this function
  // on the decision 29 palette (the frames' own values, on the 2026-09-16
  // palette, are why the rounding rule is what it is).
  it.each([
    [8.4, '#2B6A12'],
    [8.2, '#356A0E'],
    [8.0, '#3F6B0A'],
    [6.1, '#756100'],
    [5.4, '#825B00'],
  ])('blends at %s', (score, expected) => {
    expect(scoreColor(score, light)).toBe(expected);
  });

  it('returns a tier color exactly at that tier’s anchor', () => {
    expect(scoreColor(9.25, light)).toBe('#006822');
    expect(scoreColor(7.45, light)).toBe('#5B6C00');
    expect(scoreColor(5.2, light)).toBe('#865900');
    expect(scoreColor(1.95, light)).toBe('#BB0A10');
  });

  it('clamps outside the anchors rather than extrapolating', () => {
    expect(scoreColor(10, light)).toBe('#006822');
    expect(scoreColor(9.9, light)).toBe('#006822');
    expect(scoreColor(0, light)).toBe('#BB0A10');
    expect(scoreColor(1, light)).toBe('#BB0A10');
  });

  it('blends the same way in any palette it is handed', () => {
    // Midway between that palette's Liked and Loved anchors: each channel is
    // the average of the two, with halves rounding down (0xB7 + 0x8A = 337/2).
    expect(scoreColor(8.35, other)).toBe('#A0D476');
    expect(scoreColor(9.25, other)).toBe('#8AD989');
  });

  it('is monotonic through a band boundary', () => {
    const reds = [7.4, 7.8, 8.2, 8.6, 9.0].map((s) =>
      Number.parseInt(scoreColor(s, light).slice(1, 3), 16),
    );
    for (let i = 1; i < reds.length; i++) {
      expect(reds[i]!).toBeLessThanOrEqual(reds[i - 1]!);
    }
  });

  it('accepts lowercase hex and normalizes its output', () => {
    expect(scoreColor(7.45, { ...light, liked: '#5b6c00' })).toBe('#5B6C00');
  });

  it('rejects a color that is not #RRGGBB', () => {
    expect(() => scoreColor(5, { ...light, fine: 'orange' })).toThrow(RangeError);
    expect(() => scoreColor(5, { ...light, fine: '#FFF' })).toThrow(RangeError);
  });

  it('rejects a score that is not a number', () => {
    expect(() => scoreColor(Number.NaN, light)).toThrow(RangeError);
  });
});
