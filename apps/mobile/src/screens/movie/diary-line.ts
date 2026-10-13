/**
 * The movie page's diary line, which replaces the game page's status line
 * (movies-brief.md, "Movie page"; frame `Movie page` 259:78), and what the
 * page offers around it.
 *
 * - On the watchlist, not watched: "On your watchlist".
 * - Watched once: "Watched Sep 2 · Change".
 * - Watched more than once: "Watched 2× · last Sep 2 ›", which opens the rows.
 * - Watched with no diary row at all (a film marked played before the diary
 *   existed): "Watched".
 * - Seen with only an undated row (`watchedOn` null: a bulk "seen it" from
 *   the film deck or an import with no day, `watch_log.source` `bulk` or
 *   `import`): "Seen before Verso ›", which opens the rows, where the day can
 *   be added. Never "Watched null". Several undated rows: "Seen 2× before
 *   Verso ›". A mix reads as several watches, "last" being the newest dated
 *   one (the diary sorts undated rows last).
 * - Watched and not ranked: the line gains "Rank it ›" in the brand green,
 *   and the page has no primary button any more (question 18's default:
 *   the diary line alone once a film is watched).
 *
 * The place left the line with Rafa's letter on the log sheet (2026-10-12:
 * "Where" goes), so the line never says where a film was watched.
 *
 * No React; relative imports only (`test/movie-diary-line.test.ts`).
 */

import type { DiaryRow, Entry } from '@verso/api';

import { personalDate } from '../../lib/format';

export type DiaryAction = 'change' | 'open' | null;

export interface DiaryLine {
  /** The words, or null when there is nothing to say (an untracked film). */
  text: string | null;
  /** "Change" on one watch, "›" opening the rows on several. */
  action: DiaryAction;
  /** "Rank it ›": watched, not ranked. */
  rankIt: boolean;
  /** Whether the film counts as watched: the two actions give way to the line. */
  watched: boolean;
}

export function diaryLine(
  entry: Pick<Entry, 'status'> | null,
  diary: readonly Pick<DiaryRow, 'watchedOn'>[],
  ranked: boolean,
  now: Date = new Date(),
): DiaryLine {
  const watched = diary.length > 0 || entry?.status === 'played';
  const rankIt = watched && !ranked;

  const latest = diary.find((row) => row.watchedOn !== null)?.watchedOn ?? null;
  if (diary.length > 0 && latest === null) {
    const text = diary.length === 1 ? 'Seen before Verso' : `Seen ${diary.length}× before Verso`;
    return { text, action: 'open', rankIt, watched };
  }
  if (diary.length === 1 && latest !== null) {
    return { text: `Watched ${personalDate(latest, now) ?? latest}`, action: 'change', rankIt, watched };
  }
  if (diary.length > 1 && latest !== null) {
    return { text: `Watched ${diary.length}× · last ${personalDate(latest, now) ?? latest}`, action: 'open', rankIt, watched };
  }
  if (watched) return { text: 'Watched', action: null, rankIt, watched };
  if (entry?.status === 'backlog') return { text: 'On your watchlist', action: null, rankIt: false, watched: false };
  return { text: null, action: null, rankIt: false, watched: false };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function local(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export interface TheatricalLine {
  text: string;
  /** "Going? ›" or "Change"; both open the day picker. */
  action: 'going?' | 'change';
}

/**
 * The theatrical line, only while it applies (movies-brief.md, "Movie page"):
 * "Going Fri Oct 24 · Change" once a day is planned, "In theaters Oct 22 ·
 * Going? ›" before it opens, "In theaters now · Going? ›" while it plays.
 * Nothing once it streams or when it never had a theatrical date.
 */
export function theatricalLine(
  placement: string | null,
  placementOn: string | null,
  plannedOn: string | null,
  today: string,
): TheatricalLine | null {
  if (plannedOn !== null && plannedOn >= today) {
    const date = local(plannedOn);
    const when = date ? `${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}` : plannedOn;
    return { text: `Going ${when}`, action: 'change' };
  }
  if (placement === 'opening' && placementOn !== null) {
    const date = local(placementOn);
    const when = date ? `${MONTHS[date.getMonth()]} ${date.getDate()}` : placementOn;
    return { text: `In theaters ${when}`, action: 'going?' };
  }
  if (placement === 'in_theaters') return { text: 'In theaters now', action: 'going?' };
  return null;
}

/**
 * Details' streaming row: "Streaming since" with the month and year once the
 * digital date has passed ("May 2022"), "Streaming from" with the day while it
 * is ahead ("Dec 3"). Null with no digital date.
 */
export function streamingRow(digitalOn: string | null, today: string): { label: string; value: string } | null {
  if (digitalOn === null) return null;
  const date = local(digitalOn);
  if (!date) return null;
  if (digitalOn <= today) return { label: 'Streaming since', value: `${MONTHS[date.getMonth()]} ${date.getFullYear()}` };
  return { label: 'Streaming from', value: `${MONTHS[date.getMonth()]} ${date.getDate()}` };
}

/** "2nd watch" above the log sheet's buttons when a diary row exists; null for the first. */
export function watchOrdinal(existingWatches: number): string | null {
  if (existingWatches <= 0) return null;
  const n = existingWatches + 1;
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix} watch`;
}
