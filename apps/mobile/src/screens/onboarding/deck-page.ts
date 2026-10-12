/**
 * The deck page's rules: which rows show, the count in the header, the meta
 * lines, where "Done for now" goes, and what "Rank these" hands the session
 * (specs/onboarding.md, "The deck page").
 *
 * Marks are local state until "Rank these": a map from a row's id to the tier
 * its slider stopped on. An untouched row is not played and is never written.
 *
 * No React and no `react-native` import (`test/onboarding-deck-page.test.ts`).
 */

import { orderDeck, type Tier } from '@verso/core';
import type { DeckCandidateRow } from '@verso/api';

import { platformShortName } from '../../lib/format';
import { orderedPicks, picksFromPlatforms, pickShortName } from './platform-picks';

/** A page is ten rows; "Show 10 more" asks for the next ten. */
export const DECK_PAGE_SIZE = 10;

/** The goal the header counts toward: ten ranked (onboarding-guidelines.md). */
export const DECK_GOAL = 10;

/** How many of page one's most popular rows open it whatever the profile says. */
export const DECK_PINNED = 3;

export type DeckMarks = ReadonlyMap<string, Tier>;

/**
 * The page order of one page's rows: `orderDeck` with the pin on page one only
 * (a later page passes `pinned: 0`, as @verso/core asks).
 */
export function orderPage(rows: readonly DeckCandidateRow[], offset: number): DeckCandidateRow[] {
  return orderDeck(rows, { pinned: offset === 0 ? DECK_PINNED : 0 });
}

/**
 * Every page's rows in one list, in page order, each game once.
 *
 * A game is shown once in the session (onboarding.md: an untouched row is
 * "never asked again on a later page"). Offsets count rows of a list the
 * database recomputes on every read, so a later page can repeat a row an
 * earlier read placed differently; the first place wins. A page still loading
 * is skipped, so the rows above it keep their place.
 */
export function mergePages(pages: readonly (readonly DeckCandidateRow[] | undefined)[]): DeckCandidateRow[] {
  const seen = new Set<string>();
  const out: DeckCandidateRow[] = [];
  pages.forEach((page, index) => {
    if (!page) return;
    for (const row of orderPage(page, index * DECK_PAGE_SIZE)) {
      if (seen.has(row.mediaItemId)) continue;
      seen.add(row.mediaItemId);
      out.push(row);
    }
  });
  return out;
}

/** Whether another page is worth asking for: the last one came back full. */
export function hasMorePages(pages: readonly (readonly DeckCandidateRow[] | undefined)[]): boolean {
  const last = pages[pages.length - 1];
  return last !== undefined && last.length >= DECK_PAGE_SIZE;
}

/** A slider moved: the row is marked with that tier. */
export function markRow(marks: DeckMarks, mediaItemId: string, tier: Tier): Map<string, Tier> {
  const next = new Map(marks);
  next.set(mediaItemId, tier);
  return next;
}

/** Ranked games plus the rows marked on this page: the header's n. Not capped. */
export function progressCount(ranked: number, marks: DeckMarks): number {
  return Math.max(0, ranked) + marks.size;
}

/**
 * The header's line under the bar. The number is capped at the goal on screen
 * only: past ten the line reads "10 of 10" and the bar stays full, while the
 * count itself keeps going (the button says how many are marked).
 */
export function progressLabel(count: number): string {
  return `${Math.min(count, DECK_GOAL)} of ${DECK_GOAL}`;
}

/** How full the header's bar is, 0 to 1; full from ten. */
export function progressFraction(count: number): number {
  return Math.min(1, Math.max(0, count) / DECK_GOAL);
}

/** "Rank these {n}"; at zero the button is disabled and reads "Rank these". */
export function rankButtonLabel(marked: number): string {
  return marked > 0 ? `Rank these ${marked}` : 'Rank these';
}

/**
 * The deck's meta line: where the rows come from, then what to do.
 * "Popular on Switch 2 and PS5 · tap how it was"; the first two picks by the
 * picker's order and the rest dropped; "Popular everywhere" with no platforms.
 */
export function deckMetaLine(profilePlatforms: readonly string[] | null | undefined): string {
  const labels = [...new Set(orderedPicks(picksFromPlatforms(profilePlatforms)).map(pickShortName))];
  const where = labels.length === 0 ? 'Popular everywhere' : `Popular on ${labels.slice(0, 2).join(' and ')}`;
  return `${where} · tap how it was`;
}

/**
 * A row's meta line: "{year} · {platform short names}", the user's platforms
 * first, at most three and then a count, each short name once (a game on
 * Windows, Mac and Linux reads "PC, Mac, Linux", never "PC, PC").
 */
export function deckRowMeta(
  row: Pick<DeckCandidateRow, 'year' | 'platforms'>,
  profilePlatforms: readonly string[] | null | undefined,
): string | null {
  const mine = new Set(profilePlatforms ?? []);
  const ordered = [
    ...row.platforms.filter((name) => mine.has(name)),
    ...row.platforms.filter((name) => !mine.has(name)),
  ];
  const names = [...new Set(ordered.map(platformShortName).filter(Boolean))];
  const shown = names.slice(0, 3).join(', ');
  const rest = names.length - 3;
  const platforms = names.length === 0 ? null : rest > 0 ? `${shown} +${rest}` : shown;

  const parts = [row.year === null ? null : String(row.year), platforms].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * The played-on platform to pre-fill when a marked row is written: the one
 * platform the game shares with the profile, or null when it shares none or
 * several (onboarding.md: "when the game is on exactly one of the user's
 * platforms").
 */
export function playedOnFor(
  gamePlatforms: readonly string[],
  profilePlatforms: readonly string[] | null | undefined,
): string | null {
  const mine = new Set(profilePlatforms ?? []);
  const shared = [...new Set(gamePlatforms.filter((name) => mine.has(name)))];
  return shared.length === 1 ? shared[0]! : null;
}

/** The marked rows in the order the page shows them: the session's tie-break order. */
export function markedRows(
  rows: readonly DeckCandidateRow[],
  marks: DeckMarks,
): { row: DeckCandidateRow; tier: Tier }[] {
  return rows.flatMap((row) => {
    const tier = marks.get(row.mediaItemId);
    return tier ? [{ row, tier }] : [];
  });
}

/**
 * Where the header's `x` goes: with marks, into the session (the same writes
 * as "Rank these"); without, to the tabs for a new user and back for a
 * returning one.
 */
export function doneForNow(marked: number, returning: boolean): 'session' | 'tabs' | 'back' {
  if (marked > 0) return 'session';
  return returning ? 'back' : 'tabs';
}
