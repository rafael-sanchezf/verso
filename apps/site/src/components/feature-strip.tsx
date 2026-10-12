'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

import type { Medium } from '@/content/copy';

/**
 * One medium's row of four phones in "Inside the app" (interactive strip,
 * 2026-10-08; Rafa: "Home is bigger than the rest in this section for
 * movies, but the other phones should expand once they are clicked on").
 *
 * From tablet width (768 px) one phone is the large one, Home first, and the
 * other three are small; a click on a small one makes it the large one and
 * the large one shrinks back, with the line under the large phone changing
 * to match. The state is the selected index and nothing else: the sizes, the
 * vertical centering and the motion are CSS (globals.css, "The strip"), and
 * the phones themselves are rendered on the server and handed in.
 *
 * Below 768 px the row is the sideways snap row it was, with no expand
 * behavior: the buttons are not drawn, every phone is 200 px, and on the
 * movies side (`lead`) Home is wider with its caption under it.
 *
 * To a screen reader each phone keeps its own label for what it shows, and
 * a toggle button over it, "Show Search larger", is pressed while that phone
 * is the large one. Every phone is a button, the large one included, so the
 * focus stays where it was after a press. The drawn captions are hidden from
 * screen readers; one visually hidden line after the row carries the large
 * phone's caption in a polite live region, so a press is announced once and
 * the caption is never read twice.
 *
 * Each side keeps its own selection across a switch: both rows stay mounted
 * and the switch only hides one (globals.css, "The medium the page shows").
 */
export function FeatureStrip({
  medium,
  label,
  phones,
  screens,
  lead = false,
}: {
  medium: Medium;
  /** The row's name, as before: it scrolls sideways at phone width. */
  label: string;
  /** The four phones, in the row's order, rendered on the server. */
  phones: readonly ReactNode[];
  /** Per phone: the button's name and the line under it while it is the large one (copy.product.screens). */
  screens: readonly { expand: string; caption: string }[];
  /** The movies side: Home wider than the rest in the snap row, with its caption under it, as before. */
  lead?: boolean;
}) {
  const [featured, setFeatured] = useState(0);

  return (
    <div data-medium-only={medium} className="strip-frame">
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="strip-row scrollbar-none -mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-2 pb-10 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:mt-10 md:gap-0 md:overflow-visible md:px-0 md:pt-0 md:pb-0"
      >
        {screens.map((screen, index) => {
          const isFeatured = index === featured;
          const isLead = lead && index === 0;
          return (
            <div
              key={screen.expand}
              // The snap row's widths; from 768 px globals.css sizes the phones ("The strip").
              className={`strip-item shrink-0 snap-start ${isLead ? 'w-[min(300px,76vw)]' : 'w-[200px]'}`}
              data-featured={isFeatured ? '' : undefined}
            >
              <div className="strip-phone">
                {phones[index]}
                <button
                  type="button"
                  className="strip-expand"
                  aria-label={screen.expand}
                  aria-pressed={isFeatured}
                  onClick={() => setFeatured(index)}
                />
              </div>

            </div>
          );
        })}
      </div>

      {/* The line under the large phone: all four in one cell, each set under where its phone sits when large, one shown. */}
      <div aria-hidden="true" className="strip-captions">
        {screens.map((screen, index) => (
          <p
            key={screen.expand}
            className="strip-caption text-center text-subheadline text-balance text-text-secondary"
            data-featured={index === featured ? '' : undefined}
            style={{ '--strip-index': index } as CSSProperties}
          >
            {screen.caption}
          </p>
        ))}
      </div>

      {/* What a screen reader hears for the caption: once, and again only when a press changes it. The snap row has no caption and no buttons, so it is out of the tree there. */}
      <p className="sr-only max-md:hidden" aria-live="polite">
        {screens[featured]?.caption}
      </p>
    </div>
  );
}
