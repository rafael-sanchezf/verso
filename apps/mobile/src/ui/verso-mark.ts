/**
 * Verso's mark as data: its geometry, its colors by ground, its sizes.
 *
 * Kept apart from `marks.tsx` so it imports nothing from React Native and the
 * unit tests can hold it against the source of record,
 * `docs/design/assets/brand/verso-mark.svg`: the two path strings below are
 * that file's, character for character, and `test/brand-mark.test.ts` fails
 * if they ever drift. Rafa drew the mark by hand (decision 31, 2026-10-08);
 * its geometry is final and is never redrawn, simplified or rounded here.
 */

import type { Theme } from '@verso/tokens';

/** The drawing's own box, from the SVG: 882 wide, 915 tall. */
export const MARK_VIEWBOX = { width: 882, height: 915 } as const;

/** The play triangle, floating in the top of the V's opening. */
export const MARK_PLAY_PATH = 'M373.809 216V0L561.809 108L373.809 216Z';

/** The V: the left arm unbroken to the apex, the right arm cut short. */
export const MARK_V_PATH =
  'M201.263 32.79L417.129 500.5H417.027L417.354 501.21L527.71 740.314L440.809 914.118L0.361328 33.2236L0 32.5H201.129L201.263 32.79ZM881.256 33.2236L542.843 710.048L455.308 520.389L680.354 32.79L680.488 32.5H881.617L881.256 33.2236Z';

/** The play's opacity on white, as drawn (`fill-opacity` in the SVG). */
export const MARK_PLAY_OPACITY_ON_WHITE = 0.733333;

/** Nothing smaller: at 16 the play is already a dot and the V carries the mark. */
export const MARK_MIN_SIZE = 16;

/**
 * What the mark sits on.
 *
 * - `canvas`: the screen background, white in light and black in dark.
 * - `brand`: the brand green, `brand/primary`, the same in both modes.
 */
export type MarkGround = 'canvas' | 'brand';

export interface MarkColors {
  v: string;
  play: string;
  playOpacity: number;
}

/**
 * The mark's colors for a ground in a scheme, from brand-identity.md:
 *
 * - on white, the V `brand/text` (`#006822`) and the play `brand/tint-half`
 *   (`#80B491`) at 73%, as drawn;
 * - on black in dark mode, the V `brand/text` (lifted to `#009B37`) and the
 *   play `brand/tint-half`, opaque;
 * - on the brand green, either mode, the V `brand/on-primary` (white) and the
 *   play `brand/tint-quarter` (`#CDE8D3`).
 */
export function markColors(theme: Pick<Theme, 'scheme' | 'colors'>, ground: MarkGround = 'canvas'): MarkColors {
  if (ground === 'brand') {
    return {
      v: theme.colors['brand/on-primary'],
      play: theme.colors['brand/tint-quarter'],
      playOpacity: 1,
    };
  }
  return {
    v: theme.colors['brand/text'],
    play: theme.colors['brand/tint-half'],
    playOpacity: theme.scheme === 'light' ? MARK_PLAY_OPACITY_ON_WHITE : 1,
  };
}

/** The mark's box for a requested height: clamped at the floor, width by the drawing's ratio. */
export function markSize(height: number): { width: number; height: number } {
  const h = Math.max(MARK_MIN_SIZE, height);
  return { width: (h * MARK_VIEWBOX.width) / MARK_VIEWBOX.height, height: h };
}

/**
 * The lockup's proportions for a word set at `fontSize`, from the Figma
 * component `Verso lockup` (238:42): the word at 104 beside a mark 112 tall,
 * so the mark is 112/104 of the font size; the gap is half the mark's width;
 * the apex sits on the word's baseline (the caller aligns them).
 */
export function lockupMetrics(fontSize: number): { markHeight: number; gap: number } {
  const markHeight = (fontSize * 112) / 104;
  return { markHeight, gap: markSize(markHeight).width / 2 };
}
