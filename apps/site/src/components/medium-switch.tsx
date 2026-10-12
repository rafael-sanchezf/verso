'use client';

import { BookOpen, Film, Gamepad2, Tv } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';

import { copy, type Medium } from '@/content/copy';

/**
 * The medium switch at the top of the page (round four; site brief, "Rafa's
 * reaction to round three", 1): a pill of two segments, Games with the app's
 * `gamepad-2` and Movies with its `film`, that drives the whole page.
 *
 * Where it sits: in the sticky nav's center from 1024 px, so it stays in
 * reach and a reader can flip How it works or the strip while looking at
 * them; under the nav at the top of the hero below 1024 px, where the nav
 * has no room for it. Both are this component, and CSS shows one.
 *
 * The state lives in the address, `?medium=games` or `?medium=movies`, and
 * with neither the page shows movies (the default since the finalize round,
 * 2026-10-08): the layout's inline
 * script reads it into `<html data-medium>` before the first paint, and a
 * change writes it back with `history.replaceState`, without a reload or a
 * history entry. Everything that names the medium reads `<html>`'s
 * attribute through CSS (globals.css, "The medium the page shows"), so the
 * page is right before React hydrates. This store mirrors the attribute for
 * the radios' checked state, and the event tells the scenes to re-arm.
 *
 * Two native radios in a labeled group, so the keyboard works as a radio
 * group does: Tab reaches the checked one, the arrows move and select, and
 * the focus ring shows on the segment. A polite live region says the page
 * changed.
 *
 * Round five (Rafa's reaction to round four, inference a): TV and Books
 * follow as two more radios in the same group, disabled, each with the
 * app's icon (`tv`, `book-open`) and a small "soon" tag, so the plan shows
 * before the FAQ says it. Disabled radios take no focus and the arrows skip
 * them, so they are never a choice; a screen reader still lists them in the
 * group, as "TV, coming" and "Books, coming", unavailable. A hairline
 * separates them from the two live segments, and the thumb only ever
 * slides between those two.
 *
 * Where room is short the two shed their names and keep the icon and the
 * tag: in the nav at every width, and at the top of the hero below 640 px,
 * where the tag goes under the icon (the looks below; DESIGN.md, "Round
 * five").
 */

export const MEDIUM_EVENT = 'verso:medium';

/** Movies first, the default since the finalize round (Rafa, 2026-10-08), so the selected pill opens the row. */
const MEDIA: { value: Medium; Icon: typeof Gamepad2 }[] = [
  { value: 'movies', Icon: Film },
  { value: 'games', Icon: Gamepad2 },
];

/** The segments' classes per placement (round five), sized so the pill fits where it sits. */
interface Look {
  segment: string;
  coming: string;
  comingIcon: string;
  comingName: string;
  soon: string;
}

const SOON_PILL = 'rounded-pill border border-border-separator px-1.5 text-[11px] leading-4';

/**
 * In the nav, TV and Books are the icon and the "soon" tag, without the
 * name (it is in the tooltip and for screen readers): with the names the
 * pill is 521 px, and beside the wordmark and the links (325 px) it either
 * pushes off the page's center or wraps the links, at 1440 as at 1024. From
 * 1024 to 1279 the segments tighten a little more.
 */
const NAV_LOOK: Look = {
  segment: 'h-10 gap-2 px-4 max-xl:px-3',
  coming: 'h-10 gap-1.5 px-2.5 max-xl:px-2',
  comingIcon: 'size-5',
  comingName: 'hidden',
  soon: SOON_PILL,
};

/**
 * At the top of the hero, below 1024 px: the full pill from 640 px; below
 * it the pill spans the column and TV and Books become the icon over a
 * small "soon", so all four fit a 360 px phone.
 */
const HERO_LOOK: Look = {
  segment: 'h-11 gap-1.5 px-2.5 sm:gap-2 sm:px-4',
  coming: 'h-11 flex-col gap-0.5 px-2 sm:flex-row sm:gap-1.5 sm:px-3',
  comingIcon: 'size-[18px] sm:size-5',
  comingName: 'hidden sm:inline',
  soon: 'text-[10px] leading-none sm:rounded-pill sm:border sm:border-border-separator sm:px-1.5 sm:text-[11px] sm:leading-4',
};

/** The media that come in V1, shown and not selectable (round five). */
const COMING: { value: 'tv' | 'books'; Icon: typeof Gamepad2 }[] = [
  { value: 'tv', Icon: Tv },
  { value: 'books', Icon: BookOpen },
];

const readMedium = (): Medium => (document.documentElement.dataset.medium === 'games' ? 'games' : 'movies');

const subscribe = (onChange: () => void) => {
  window.addEventListener(MEDIUM_EVENT, onChange);
  return () => window.removeEventListener(MEDIUM_EVENT, onChange);
};

/** The medium the page shows. Movies on the server, where there is no address to read. */
export function useMedium(): Medium {
  return useSyncExternalStore(subscribe, readMedium, () => 'movies');
}

/** Shows `next` across the page, writes it to the address, and marks the page as switched (the ask replays at once). */
function chooseMedium(next: Medium) {
  const root = document.documentElement;
  if (readMedium() === next) return;
  root.dataset.medium = next;
  root.dataset.mediumSwitched = '';
  const url = new URL(window.location.href);
  url.searchParams.set('medium', next);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(MEDIUM_EVENT));
}

/**
 * After a client-side navigation back to the home page the layout's script
 * does not run again, so the switch re-reads the address when it mounts.
 */
function syncFromAddress() {
  const fromAddress: Medium = new URLSearchParams(window.location.search).get('medium') === 'games' ? 'games' : 'movies';
  if (readMedium() === fromAddress) return;
  document.documentElement.dataset.medium = fromAddress;
  window.dispatchEvent(new Event(MEDIUM_EVENT));
}

export function MediumSwitch({ placement }: { placement: 'nav' | 'hero' }) {
  const medium = useMedium();
  const name = useId();
  const [announcement, setAnnouncement] = useState('');

  useEffect(syncFromAddress, []);

  const inNav = placement === 'nav';
  const look = inNav ? NAV_LOOK : HERO_LOOK;

  return (
    <div className={inNav ? 'hidden justify-self-center lg:block' : 'mb-8 lg:hidden'}>
      <div
        role="radiogroup"
        aria-label={copy.switch.label}
        className={`flex items-center rounded-pill bg-bg-surface p-1 ${inNav ? 'w-max' : 'w-full sm:w-max'}`}
      >
        <div className={`relative grid grid-cols-2 ${inNav ? '' : 'max-sm:flex-1'}`}>
          <span aria-hidden="true" className="medium-thumb" />
          {MEDIA.map(({ value, Icon }) => (
            <label
              key={value}
              data-value={value}
              className={`medium-seg relative flex cursor-pointer items-center justify-center rounded-pill text-headline text-text-secondary select-none hover:text-text-primary ${look.segment}`}
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={medium === value}
                onChange={() => {
                  chooseMedium(value);
                  setAnnouncement(copy.switch.announce[value]);
                }}
                className="sr-only"
              />
              <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2} />
              {copy.switch[value]}
            </label>
          ))}
        </div>
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border-separator" />
        {COMING.map(({ value, Icon }) => (
          <label
            key={value}
            data-value={value}
            title={`${copy.switch[value]}, ${copy.switch.soon}`}
            className={`medium-seg-coming relative flex shrink-0 cursor-default items-center justify-center rounded-pill text-headline text-text-secondary select-none ${look.coming}`}
          >
            <input type="radio" name={name} value={value} disabled className="sr-only" />
            <span className="sr-only">{`${copy.switch[value]}, ${copy.switch.coming}`}</span>
            <Icon aria-hidden="true" className={`medium-coming-icon shrink-0 ${look.comingIcon}`} strokeWidth={2} />
            <span aria-hidden="true" className={`medium-coming-name ${look.comingName}`}>
              {copy.switch[value]}
            </span>
            <span aria-hidden="true" className={`font-semibold ${look.soon}`}>
              {copy.switch.soon}
            </span>
          </label>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

/** The nav's switch, on the home page only: Privacy and Terms name no medium. */
export function NavMediumSwitch() {
  return usePathname() === '/' ? <MediumSwitch placement="nav" /> : null;
}
