import { COLOR_TOKENS, CSS_VARIABLES, lightTheme } from '@verso/tokens';
import type { CSSProperties, ReactNode } from 'react';

import type { Shot } from '@/content/shots';

/**
 * A phone, drawn in CSS: what every product shot sits in since round two
 * ("a floating screen is very ugly; it should be like a phone with the actual
 * app on it", Rafa, 2026-10-07, which overrides round one's no-bezel rule).
 *
 * The proportions are the iPhone 16 Pro's: a 402 × 874 pt screen with its
 * corners at 62 pt (15.4% of its width), a black bezel of 2.2% of the
 * phone's width and a titanium edge of 1%, the Dynamic Island
 * (125 × 37 pt, 11 pt from the top), the side buttons and the home
 * indicator. Everything is sized in container units of the phone's own width,
 * so one component draws a 200 px phone in the strip and a 270 px one in the
 * hero. Apple's Product Bezels were not used: they are a download behind
 * Apple's terms, and this frame needs neither (DESIGN.md, "Round two").
 *
 * The screen is its own container too, with `--pt` set to one point of the
 * 402 pt screen, so whatever is drawn inside it (the finder mock) can be laid
 * out in the app's points. The screen always carries the light palette, from
 * the tokens' own light values, because the screenshots inside it are light.
 */

/**
 * The tokens' light values as the CSS variables the utilities read, so a
 * screen stays light in dark mode. The site's accent names are declared
 * again here, because a variable that points at another is resolved where
 * it is declared: inherited from the page, `--color-accent-text` would
 * carry the canvas's dark `brand/text`; declared here, it takes the
 * screen's light one.
 */
const LIGHT_SCREEN = {
  ...Object.fromEntries(COLOR_TOKENS.map((token) => [CSS_VARIABLES[token], lightTheme.colors[token]])),
  '--color-accent': 'var(--color-brand-primary)',
  '--color-accent-text': 'var(--color-brand-text)',
  '--color-accent-label': 'var(--color-brand-on-primary)',
  // The mark's play at its on-white opacity in either scheme (verso-mark.tsx): unset here, the file's own value applies.
  '--site-mark-play-opacity': 'initial',
} as CSSProperties;

/** One point of the 402 pt screen, for anything drawn inside a screen. */
export const pt = (points: number) => `calc(${points} * var(--pt))`;

export function Phone({
  width,
  children,
  label,
  bare = false,
  className = '',
}: {
  /** The phone's outer width; everything else follows from it. */
  width: string;
  children: ReactNode;
  /** For a drawn screen (not an image): what a screen reader hears for the whole phone. */
  label?: string;
  /**
   * The front face alone, for the angled phone (angled-phone.tsx): no side
   * buttons, which would float off a turned edge, and no shadow, which would
   * turn with the face; the angled phone draws its edge and its floor shadow
   * itself.
   */
  bare?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`@container relative ${className}`}
      style={{ width }}
      {...(label ? { role: 'img', 'aria-label': label } : {})}
    >
      {bare ? null : (
        <>
          {/* The side buttons: the Action button and volume on the left, the side button on the right. */}
          <span aria-hidden="true" className="site-device-button absolute top-[17%] -left-[0.6cqi] h-[5%] w-[1cqi] rounded-l-[0.5cqi]" />
          <span aria-hidden="true" className="site-device-button absolute top-[25%] -left-[0.6cqi] h-[9%] w-[1cqi] rounded-l-[0.5cqi]" />
          <span aria-hidden="true" className="site-device-button absolute top-[36%] -left-[0.6cqi] h-[9%] w-[1cqi] rounded-l-[0.5cqi]" />
          <span aria-hidden="true" className="site-device-button absolute top-[27%] -right-[0.6cqi] h-[14%] w-[1cqi] rounded-r-[0.5cqi]" />
        </>
      )}

      {/* Edge 1%, bezel 2.2%: the screen is 93.6% of the width, its corners 15.4% of that, 14.4%. */}
      <div className={`site-device-edge relative rounded-[17.6cqi] p-[1cqi] ${bare ? '' : 'shadow-device'}`}>
        <div className="site-device-bezel rounded-[16.6cqi] p-[2.2cqi]">
          <div
            className="@container relative aspect-[402/874] overflow-hidden rounded-[14.4cqi] bg-bg-canvas text-text-primary [--pt:calc(100cqi/402)]"
            style={LIGHT_SCREEN}
          >
            {children}
            <StatusBar />
            <span
              aria-hidden="true"
              className="absolute left-1/2 -translate-x-1/2 rounded-pill bg-black"
              style={{ top: pt(11), width: pt(125), height: pt(37) }}
            />
            <span
              aria-hidden="true"
              className="absolute left-1/2 -translate-x-1/2 rounded-pill bg-text-primary"
              style={{ bottom: pt(8), width: pt(139), height: pt(5) }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 9:41, the signal, Wi-Fi and the battery, either side of the Island. Drawn, so it is hidden from screen readers. */
function StatusBar() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-0 flex items-center justify-between text-text-primary"
      style={{ height: pt(59), paddingInline: pt(10) }}
    >
      <span
        className="flex-1 text-center font-semibold tracking-[-0.01em] tabular-nums"
        style={{ fontSize: pt(16.5), maxWidth: pt(138) }}
      >
        9:41
      </span>
      <span className="flex flex-1 items-center justify-center" style={{ maxWidth: pt(138), gap: pt(6) }}>
        <svg viewBox="0 0 18 12" style={{ width: pt(18), height: pt(12) }} fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg viewBox="0 0 16 12" style={{ width: pt(16), height: pt(12) }} fill="currentColor">
          <path d="M8 2.6c2.2 0 4.2.85 5.7 2.25l1.1-1.15A9.5 9.5 0 0 0 8 1 9.5 9.5 0 0 0 1.2 3.7l1.1 1.15A8 8 0 0 1 8 2.6Z" />
          <path d="M8 5.9c1.3 0 2.5.5 3.4 1.3l1.1-1.15A6.4 6.4 0 0 0 8 4.3a6.4 6.4 0 0 0-4.5 1.75L4.6 7.2A4.8 4.8 0 0 1 8 5.9Z" />
          <path d="M8 9.1c.5 0 .95.18 1.3.48L8 11l-1.3-1.42c.35-.3.8-.48 1.3-.48Z" />
        </svg>
        <svg viewBox="0 0 27 13" style={{ width: pt(27), height: pt(13) }} fill="none">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor" />
          <path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

/** A screenshot in a phone: whole, at the screen's own ratio (every file is 402:874, at 1x or 3x). */
export function PhoneShot({
  shot,
  width,
  priority = false,
  caption,
  className = '',
}: {
  shot: Shot;
  width: string;
  priority?: boolean;
  /** A caption under the phone; most shots carry none since round two. */
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={`mx-auto ${className}`} style={{ width }}>
      <Phone width="100%">
        <img
          src={shot.src}
          width={shot.width}
          height={shot.height}
          alt={shot.alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className="block h-full w-full"
        />
      </Phone>
      {caption ? (
        <figcaption className="mt-5 text-center text-footnote text-text-secondary">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
