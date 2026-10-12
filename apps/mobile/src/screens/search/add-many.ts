/**
 * Search's add-many intent as rules (specs/onboarding.md, "The doors";
 * `?intent=addmany`, Ranking's "I know what I played").
 *
 * Each tap on a row's pill marks the game played at once (`markFinished`) and
 * puts it in the ADDED list under the results; "Rank {n} games" then opens the
 * session over the added games with no tiers yet, so the session asks the tier
 * first for each. A game already ranked is marked played like any other but
 * is not added: the session places games that have no place yet, and this one
 * has one. The list belongs to the visit and ends with it.
 *
 * A game that is not out is never marked played (phone feedback entry 10):
 * its row keeps the plain add pill, which opens the add sheet and its one
 * honest row, "Want to play" (`addManyPill`), and the tap's write checks the
 * date again first (`lib/when-released.ts`).
 *
 * No React and no `react-native` import (`test/search-add-many.test.ts`).
 */

import { releaseState, type OnboardingGameRow } from '@verso/api';

/**
 * The add-many pill for one row: the check circle for a game that is out,
 * the add pill for one that is not. `releaseDate` is `undefined` until
 * Search's read of the dates answers for the row, and counts as out, as an
 * undated game does; the write asks the catalog again anyway.
 */
export function addManyPill(
  releaseDate: string | null | undefined,
  options: { today?: string } = {},
): 'addmany' | 'add' {
  return releaseState(releaseDate, options).released ? 'addmany' : 'add';
}

export interface AddManyState {
  /** In the order tapped. */
  added: OnboardingGameRow[];
  /** The last game that turned out to be ranked already, for the one-line notice. */
  alreadyRanked: string | null;
}

export const EMPTY_ADD_MANY: AddManyState = { added: [], alreadyRanked: null };

/** Whether this game's pill shows the filled check. */
export function isAdded(state: AddManyState, mediaItemId: string): boolean {
  return state.added.some((row) => row.mediaItemId === mediaItemId);
}

/** After `markFinished` answered for this row. */
export function afterMarked(state: AddManyState, row: OnboardingGameRow, alreadyRanked: boolean): AddManyState {
  if (alreadyRanked) return { ...state, alreadyRanked: row.title };
  if (isAdded(state, row.mediaItemId)) return state;
  return { added: [...state.added, row], alreadyRanked: null };
}

/** The header's counter chip. */
export function addedChipLabel(count: number): string {
  return `${count} added`;
}

/** The pinned button: "Rank 3 games", "Rank 1 game". */
export function rankAddedLabel(count: number): string {
  return count === 1 ? 'Rank 1 game' : `Rank ${count} games`;
}

/** The notice under the header when a tapped game was ranked already. */
export function alreadyRankedLine(title: string): string {
  return `${title} is already in your ranking.`;
}
