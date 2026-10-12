/**
 * The color a score badge is filled with.
 *
 * Beli paints its score badges on a continuous ramp rather than in four flat
 * steps, and the direction round adopted the same idea for Verso
 * (docs/design/ui-principles.md, "Color direction"): a 9.4 and an 8.6 are both
 * Loved, and the badge should say which one is further up. So the fill shades
 * continuously across the four tier colors instead of snapping to the tier.
 *
 * The anchors are the tier bands' centers, not their edges: a score in the
 * middle of a band gets that tier's color exactly, and the blending happens
 * across the boundaries between bands. Anchoring at the edges instead would
 * mean no score ever showed a tier's own color, which is the one thing the
 * palette exists to communicate.
 *
 * Interpolation is piecewise-linear in sRGB, which is what the Figma frames
 * did, so the badges in the app match the badges in the file. It is not a
 * perceptually uniform blend (OKLab would be); with four anchors this close in
 * lightness (the deep solids of decision 29 sit at OKLCH L 0.45 to 0.50, so the
 * ramp reads brick, brown, olive, forest) the difference is not visible, and
 * matching the approved frames is worth more than the theory here.
 *
 * The palette is passed in rather than imported because `packages/core` has no
 * opinion about themes: the app hands it `theme.colors['tier/loved']` and
 * friends for the scheme it is drawing in. Since decision 29 the four values
 * are the same in light and dark, but that is the tokens' business, not this
 * function's.
 */

import { TIER_BANDS, TIERS, type Tier } from './model';

/** The four tier colors for one color scheme, as `#RRGGBB`. */
export type TierPalette = Readonly<Record<Tier, string>>;

/**
 * Where each tier's color sits on the 0-to-10 scale: the center of its band.
 *
 * Loved 9.25, Liked 7.45, Fine 5.2, Didn't like 1.95. Derived from
 * `TIER_BANDS` so that moving a band edge moves the anchor with it.
 */
export const SCORE_ANCHORS: Readonly<Record<Tier, number>> = Object.fromEntries(
  TIERS.map((tier) => {
    const [low, high] = TIER_BANDS[tier];
    return [tier, (low + high) / 2];
  }),
) as Record<Tier, number>;

/** Anchors worst first, which is the order the ramp is walked in. */
const RAMP: readonly Tier[] = [...TIERS].reverse();

type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{6})$/i;

function parseHex(hex: string): Rgb {
  const match = HEX.exec(hex.trim());
  if (!match) throw new RangeError(`expected a #RRGGBB color, got ${JSON.stringify(hex)}`);
  const n = Number.parseInt(match[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
}

/**
 * One channel of the blend, rounded to a byte.
 *
 * Halves round down. Three of the five badges in the fidelity frames land on an
 * exact half (8.4 gives red 131.5 and the frame draws #83C053, so 131), and a
 * channel that disagreed by one would make the app's badges not quite the
 * file's. The epsilon absorbs the floating-point error in `t`, which is what
 * separates 137.5 from 137.50000000000003.
 */
function channel(from: number, to: number, t: number): number {
  const value = from + (to - from) * t;
  return Math.min(255, Math.max(0, Math.ceil(value - 0.5 - 1e-9)));
}

/**
 * The fill for a badge showing `score`, blended across `palette`.
 *
 * Below the worst anchor and above the best one the color is clamped, so a 0.4
 * is the Didn't-like color and a 9.9 is the Loved color rather than something
 * darker or lighter than the palette contains.
 *
 * `score` is the 0-to-10 figure `scoreForPosition` returns; it is never stored
 * (see ROADMAP.md), so this is always called with a freshly computed number.
 */
export function scoreColor(score: number, palette: TierPalette): string {
  if (!Number.isFinite(score)) {
    throw new RangeError(`score must be a finite number, got ${score}`);
  }

  const stops = RAMP.map((tier) => ({
    at: SCORE_ANCHORS[tier],
    rgb: parseHex(palette[tier]),
  }));

  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (score <= first.at) return toHex(first.rgb);
  if (score >= last.at) return toHex(last.rgb);

  // Scores and anchors are hundredths of a point, so comparing and dividing
  // them as integers keeps the halves above exactly on the half.
  const hundredths = Math.round(score * 100);

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]!;
    const to = stops[i + 1]!;
    const lo = Math.round(from.at * 100);
    const hi = Math.round(to.at * 100);
    if (hundredths > hi) continue;

    const t = (hundredths - lo) / (hi - lo);
    return toHex([
      channel(from.rgb[0], to.rgb[0], t),
      channel(from.rgb[1], to.rgb[1], t),
      channel(from.rgb[2], to.rgb[2], t),
    ]);
  }

  /* c8 ignore next -- unreachable: the clamps above cover everything past the last stop. */
  return toHex(last.rgb);
}
