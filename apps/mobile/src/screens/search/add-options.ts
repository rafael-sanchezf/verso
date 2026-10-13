/**
 * Which rows the add sheet offers for one game, and what they say.
 *
 * A released game gets the three drawn in 26:189. A game that is not out gets
 * one row, because nothing else is true of it yet: nobody is playing GTA 6 and
 * nobody has finished it (phone feedback entry 7, specs/search.md). The
 * platform row the sheet once carried under the three left with decision 26. The row writes what "Backlog"
 * writes, and the game then lists in Home's Coming up and the Next tab's
 * Upcoming, which already split the backlog by release date.
 *
 * Out or not is `releaseState` from `@verso/api`, the same rule those two lists
 * apply, so the sheet can never lock down a game Coming up would not list.
 *
 * No React here, so the copy is tested in
 * `apps/mobile/test/search-add-options.test.ts`. Imports are relative for the
 * reason `subtitle.ts` gives: vitest resolves no `@/` alias.
 */

import type { ReleaseState } from '@verso/api';

import { releaseDate } from '../../lib/format';
import type { TranslationKey } from '../../lib/i18n/dictionary';

import type { Phrase } from '../game/phrase';

/** Which row was tapped. */
export type Choice = 'backlog' | 'playing' | 'finished' | 'watched';

/** The words are dictionary keys and phrases the sheet says (the Spanish wave). */
export interface AddOption {
  choice: Choice;
  title: TranslationKey;
  description: Phrase;
  /** The filled `brand/primary` row: the one that starts the ranking loop. */
  filled: boolean;
}

export interface AddSheetRows {
  options: readonly AddOption[];
}

const RELEASED: AddSheetRows = {
  options: [
    {
      choice: 'backlog',
      title: 'browse.search.addSheet.backlog',
      description: { key: 'browse.search.addSheet.backlogBody' },
      filled: false,
    },
    {
      choice: 'playing',
      title: 'browse.search.addSheet.playing',
      description: { key: 'browse.search.addSheet.playingBody' },
      filled: false,
    },
    {
      choice: 'finished',
      title: 'browse.search.addSheet.finished',
      description: { key: 'browse.search.addSheet.finishedBody' },
      filled: true,
    },
  ],
};

/**
 * The sheet's rows for a game in this release state.
 *
 * `now` only formats the date; whether the game is out was already decided by
 * whoever built `release`.
 */
export function addSheetRows(release: ReleaseState, now: Date = new Date()): AddSheetRows {
  if (release.released) return RELEASED;

  return {
    options: [
      {
        choice: 'backlog',
        title: 'browse.search.addSheet.wantToPlay',
        description: unreleasedDescription(release.releaseDate, now),
        filled: false,
      },
    ],
  };
}

/**
 * `Out Nov 19 · shows in Coming up`, or `Release date to be announced`.
 *
 * The date in the app's release-date form (`Nov 19` this year, `Feb 2027` next
 * year, `2028` further out), the one Coming up and Upcoming print beside the
 * same game: the catalog stores no precision, and a far date spelled to the
 * day would be inventing one (rule 9).
 */
function unreleasedDescription(date: string | null, now: Date): Phrase {
  const out = releaseDate(date, now);
  return out === null
    ? { key: 'browse.search.addSheet.toBeAnnounced' }
    : { key: 'browse.search.addSheet.outOn', vars: { date: out } };
}

/**
 * The sheet's rows for a film (movies-brief.md, "Search": "Want to watch"
 * and "I watched this"; nothing about services). "Want to watch" writes what
 * Backlog writes, and the film lands on the Watchlist or the Calendar by its
 * release state (rule 37), so an unreleased film needs no row of its own.
 * "I watched this" opens the log sheet: logging is not ranking (rule 35).
 */
export const FILM_ROWS: AddSheetRows = {
  options: [
    {
      choice: 'backlog',
      title: 'browse.search.addSheet.wantToWatch',
      description: { key: 'browse.search.addSheet.wantToWatchBody' },
      filled: false,
    },
    {
      choice: 'watched',
      title: 'browse.search.addSheet.watched',
      description: { key: 'browse.search.addSheet.watchedBody' },
      filled: true,
    },
  ],
};
