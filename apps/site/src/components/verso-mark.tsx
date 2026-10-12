import { lightTheme } from '@verso/tokens';

import { markAspect, readMark, type Mark, type MarkPath } from '@/brand/mark';
import { copy } from '@/content/copy';

/**
 * Rafa's mark and the lockup (decision 31; docs/design/brand-identity.md).
 *
 * The mark is drawn inline from `src/brand/mark.svg` at build time, never as
 * an image, so its colors can follow the color scheme. Its two paths go out
 * character for character; only their fills are handed over, each to the
 * token whose light value the file was drawn in:
 *
 * - the V, `#006822` in the file, takes `brand/text`: `#006822` on white and
 *   `#009B37` on black, the dark-mode lift decision 29 gives brand text;
 * - the play, `#80B491` in the file, takes `brand/tint-half` (`#80B491` in
 *   both schemes) at the file's own opacity (0.733) on white, and whole on
 *   black (`--site-mark-play-opacity`, globals.css).
 *
 * Those are the brand identity's colors by ground: on white, the V
 * `#006822` and the play `#80B491` at 73%; on black in dark mode, the V
 * `#009B37` and the play `#80B491`. Inside a mocked screen, which is always
 * light (phone.tsx), the light values hold in either scheme.
 *
 * `next build` and `next dev` run in apps/site, so the file is found from
 * the working directory. Hidden from screen readers: a name always sits
 * beside it.
 */

/**
 * The tokens that carry the mark's colors, matched to the file's own fills
 * by their light values, each with its fill utility written out whole (a
 * utility in use is what makes Tailwind emit the token's variable).
 */
const MARK_FILLS = [
  { token: 'brand/text', className: 'fill-brand-text' },
  { token: 'brand/tint-half', className: 'fill-brand-tint-half' },
] as const;

let cached: Mark | undefined;

function theMark(): Mark {
  cached ??= readMark(process.cwd());
  return cached;
}

function fillOf(path: MarkPath): string {
  const fill = MARK_FILLS.find(({ token }) => lightTheme.colors[token].toLowerCase() === path.fill.toLowerCase());
  if (!fill) throw new Error(`The mark's fill ${path.fill} matches no brand token`);
  return fill.className;
}

/** The mark alone, `height` tall (any CSS length), its width following the viewBox (882 to 915). */
export function VersoMark({ height, className = '' }: { height: string; className?: string }) {
  const mark = theMark();
  return (
    <svg
      viewBox={mark.viewBox.join(' ')}
      aria-hidden="true"
      focusable="false"
      data-verso-mark=""
      className={['block shrink-0', className].filter(Boolean).join(' ')}
      style={{ height, width: `calc(${height} * ${Math.round(markAspect(mark) * 1e6) / 1e6})` }}
    >
      {mark.paths.map((path) => (
        <path
          key={path.d}
          d={path.d}
          className={fillOf(path)}
          style={path.fillOpacity ? { fillOpacity: `var(--site-mark-play-opacity, ${path.fillOpacity})` } : undefined}
        />
      ))}
    </svg>
  );
}

/**
 * The mark's height in the lockup, in ems of the wordmark: the Figma
 * component `Verso lockup` (238:42) sets a 112-unit mark beside a 104-unit
 * wordmark, the mark's apex on the word's baseline.
 */
const LOCKUP_MARK_EM = 112 / 104;

const em = (value: number) => `${Math.round(value * 10000) / 10000}em`;

/**
 * The lockup: the mark left of the wordmark "Verso", a gap of half the
 * mark's width, the mark's apex on the word's baseline, the word in Inter
 * Semi Bold at -2% in `brand/text` (brand-identity.md, "Wordmark and
 * lockup"). The spec writes the word's color as `#006822`; on the dark
 * canvas that is 3.0:1, under the 4.5:1 text needs, so `brand/text` lifts it
 * to `#009B37` there, as decision 29 does for all brand text.
 *
 * Everything is in ems of the word, so the font size sets the whole lockup:
 * the nav's 22 px gives a mark about 24 px tall. The baseline alignment puts
 * the mark's foot, its apex, on the word's baseline (a flex item with no
 * baseline of its own aligns its bottom edge).
 */
export function Lockup({ className = '' }: { className?: string }) {
  const width = LOCKUP_MARK_EM * markAspect(theMark());
  return (
    <span
      data-lockup=""
      className={`inline-flex items-baseline font-semibold tracking-[-0.02em] text-accent-text ${className}`}
      style={{ columnGap: em(width / 2) }}
    >
      <VersoMark height={em(LOCKUP_MARK_EM)} />
      <span>{copy.nav.wordmark}</span>
    </span>
  );
}
