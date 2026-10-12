/**
 * The Backlog sort menu: "Your order, Date added, Release date, Time to
 * beat" (docs/design/specs/next.md, the sub row). Only "Your order" is
 * stored (`backlog_position`); the other three are computed here from the
 * list the query already has — "Sorting is client-side" (specs/next.md,
 * "Data").
 *
 * None of the three is drawn, so the direction each one reads is a
 * convention (README, rule 7), noted in the PR: "Date added" and "Release
 * date" read newest first (the games most likely to be on a player's mind),
 * "Time to beat" reads shortest first (the quickest thing to clear from the
 * backlog). A null value — a game with no catalog date, no time-to-beat
 * figure — sorts last rather than being guessed at (rule 9).
 */

import type { EntryRow } from '@verso/api';

export const BACKLOG_SORTS = ['your-order', 'date-added', 'release-date', 'time-to-beat'] as const;

export type BacklogSort = (typeof BACKLOG_SORTS)[number];

/** The sub row's trailing words: "your order", "by date added", ... */
export const BACKLOG_SORT_LABELS: Record<BacklogSort, string> = {
  'your-order': 'your order',
  'date-added': 'by date added',
  'release-date': 'by release date',
  'time-to-beat': 'by time to beat',
};

/** The native menu's rows, in the order the spec lists them. */
export const BACKLOG_SORT_MENU: readonly { value: BacklogSort; title: string }[] = [
  { value: 'your-order', title: 'Your order' },
  { value: 'date-added', title: 'Date added' },
  { value: 'release-date', title: 'Release date' },
  { value: 'time-to-beat', title: 'Time to beat' },
];

/** Newest first; a date-less row sorts to the end regardless of direction. */
function compareDatesDescending(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

/** Smallest first; a figure-less row sorts to the end. */
function compareNumbersAscending(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * `entries` in the chosen order. "Your order" returns a shallow copy in the
 * order the caller passed in — the backlog's own order — without reading any
 * particular field, so a fixture that omits `backlogPosition` still sorts.
 */
export function sortBacklogEntries(entries: readonly EntryRow[], sort: BacklogSort): EntryRow[] {
  const copy = [...entries];
  switch (sort) {
    case 'your-order':
      return copy;
    case 'date-added':
      return copy.sort((a, b) => compareDatesDescending(a.entry.addedAt, b.entry.addedAt));
    case 'release-date':
      return copy.sort((a, b) => compareDatesDescending(a.releaseDate, b.releaseDate));
    case 'time-to-beat':
      return copy.sort((a, b) =>
        compareNumbersAscending(a.timeToBeat.normallySeconds, b.timeToBeat.normallySeconds),
      );
  }
}
