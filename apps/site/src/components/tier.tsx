import { scoreColor, type Tier, type TierPalette } from '@verso/core';
import { font, lightTheme } from '@verso/tokens';
import { Heart, Meh, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { copy } from '@/content/copy';

/**
 * The tier chip, the score badge and the Ranking divider, drawn as the app
 * draws them since decision 29's option A (#76; docs/design/specs/shell.md,
 * apps/mobile/src/ui/tier-chip.tsx and score-badge.tsx, and ranking-list.tsx
 * for the divider), so every verdict in a mocked screen matches the app.
 *
 * - The chip is the tier's deep solid, the same in light and dark, with the
 *   tier's Lucide icon (heart, thumbs-up, meh, thumbs-down) and the words in
 *   `tier/label`, white. The icon is mandatory: under red-green color
 *   blindness the four solids sit 1 to 4 units apart.
 * - The badge is filled by `scoreColor` from `@verso/core`, the app's own
 *   piecewise blend across the four solids, with white numerals.
 * - The divider is a 2 px rule in the tier's solid either side of the chip,
 *   which retires the upper-case tier word on the canvas.
 *
 * Sizes are the app's, in points; `unit` maps a point to CSS, so the same
 * piece draws in px on the page (How it works) and in a phone's points
 * inside a drawn screen (`pt` from phone.tsx).
 */

type Unit = (points: number) => string;

const px: Unit = (points) => `${points}px`;

/** Whole class names, so Tailwind finds each one in the source. */
const TIER_FILL: Readonly<Record<Tier, string>> = {
  loved: 'bg-tier-loved',
  liked: 'bg-tier-liked',
  fine: 'bg-tier-fine',
  disliked: 'bg-tier-disliked',
};

/** The app's `TIER_ICONS`, as lucide-react components. */
const TIER_ICONS: Readonly<Record<Tier, LucideIcon>> = {
  loved: Heart,
  liked: ThumbsUp,
  fine: Meh,
  disliked: ThumbsDown,
};

/**
 * The four solids, from the tokens, for `scoreColor`. Its fill is worked out
 * at build time, so it is one value: decision 29 gives the tier colors one
 * value for light and dark, so the light theme's are the dark theme's too.
 */
const TIER_PALETTE: TierPalette = {
  loved: lightTheme.colors['tier/loved'],
  liked: lightTheme.colors['tier/liked'],
  fine: lightTheme.colors['tier/fine'],
  disliked: lightTheme.colors['tier/disliked'],
};

/** The app's `Text` keeps the body ramp's proportion when a size is set: 13 gives 17, 12 gives 16, 15 gives 19. */
const lineHeight = (size: number) => Math.round(size * (font.body.lineHeight / font.body.fontSize));

export function TierChip({ tier, unit = px, className = '' }: { tier: Tier; unit?: Unit; className?: string }) {
  const Icon = TIER_ICONS[tier];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill font-semibold whitespace-nowrap text-tier-label ${TIER_FILL[tier]} ${className}`}
      style={{
        paddingLeft: unit(10),
        paddingRight: unit(12),
        paddingBlock: unit(5),
        gap: unit(6),
        fontSize: unit(13),
        lineHeight: unit(lineHeight(13)),
      }}
    >
      <Icon aria-hidden="true" className="shrink-0" style={{ width: unit(14), height: unit(14) }} strokeWidth={2} />
      {copy.tiers[tier]}
    </span>
  );
}

const BADGE = {
  regular: { size: 15, padX: 10, padY: 5 },
  small: { size: 12, padX: 8, padY: 3 },
} as const;

/**
 * A score on the tier ramp. `score` is the figure shown; `children`, when
 * given, is drawn in its place (How it works' second scene crossfades an old
 * score into a new one inside one badge, which keeps the new score's fill).
 */
export function ScoreBadge({
  score,
  size = 'regular',
  unit = px,
  className = '',
  children,
}: {
  score: string;
  size?: keyof typeof BADGE;
  unit?: Unit;
  className?: string;
  children?: ReactNode;
}) {
  const badge = BADGE[size];
  const style: CSSProperties = {
    backgroundColor: scoreColor(Number(score), TIER_PALETTE),
    paddingInline: unit(badge.padX),
    paddingBlock: unit(badge.padY),
    fontSize: unit(badge.size),
    lineHeight: unit(lineHeight(badge.size)),
  };
  return (
    <span className={`shrink-0 rounded-pill font-bold text-tier-label tabular-nums ${className}`} style={style}>
      {children ?? score}
    </span>
  );
}

/** The Ranking divider: the tier's rule, the chip in the gap, the rule again. */
export function TierDivider({ tier, unit = px, className = '' }: { tier: Tier; unit?: Unit; className?: string }) {
  const rule = `flex-1 ${TIER_FILL[tier]}`;
  return (
    <div className={`flex items-center ${className}`} style={{ gap: unit(10) }}>
      <span className={rule} style={{ height: unit(2) }} />
      <TierChip tier={tier} unit={unit} />
      <span className={rule} style={{ height: unit(2) }} />
    </div>
  );
}
