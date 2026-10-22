/**
 * Whether one catalog item is out yet.
 *
 * The same rule the Upcoming split in views.ts applies in SQL, as a function a
 * screen can ask about a single item: `upcoming()` keeps a backlog game whose
 * `release_date` is after today, and `backlog()` keeps the rest, undated games
 * included. The add sheet (docs/design/specs/search.md) asks this before it
 * offers "Playing now" and "Rank this", and the two answers have to
 * agree: a game the sheet calls unreleased is one Coming up lists as soon as it
 * is in the backlog, and a game Coming up would never list is one the sheet
 * does not lock down.
 *
 * **A date decides when there is one.** After today where the user is standing
 * (`todayLocal`, as the lists use) means not out; today or earlier means out,
 * so a game on its release day is released here exactly as it leaves Upcoming
 * there.
 *
 * **A missing date means released, unless the catalog says otherwise.** IGDB
 * leaves `first_release_date` off announced games, and off plenty of old,
 * obscure ones too, which is why views.ts files undated games in the backlog.
 * Locking the add sheet on a missing date would stop anyone saying they played
 * a 1994 shareware game the catalog happens not to date. Only a stored status
 * that says "not out" turns an undated item into an unreleased one.
 */

import { todayLocal } from './entries';

/**
 * The catalog's own word on whether an item is out, for the one case a date
 * cannot settle: an item with no date.
 *
 * Nothing stores one yet. IGDB has a release status per game (`game_status`:
 * released, alpha, beta, early access, offline, cancelled, rumored, delisted),
 * but the mirror does not request it (`GAME_FIELDS` in
 * packages/catalog/src/igdb.ts) and `media_items.metadata` carries only the
 * rating and the game type. Until it does, callers pass nothing and every
 * undated game counts as released. Folding IGDB's eight values into these two
 * is the mirror's decision when it arrives, not a screen's.
 */
export type CatalogReleaseStatus = 'released' | 'unreleased';

/** Out, or not yet and when. `releaseDate` is null when the catalog has no date to give. */
export type ReleaseState =
  | { released: true }
  | { released: false; releaseDate: string | null };

export interface ReleaseStateOptions {
  /** Treat this `YYYY-MM-DD` as today. For tests; the default is the device's own date. */
  today?: string;
  /** What the catalog says, where it says anything. Read only when there is no date. */
  status?: CatalogReleaseStatus | null;
}

/**
 * Whether the item with this release date is out.
 *
 * `releaseDate` is `media_items.release_date` as PostgREST returns a Postgres
 * `date`, `YYYY-MM-DD`, which compares with `today` as a string in calendar
 * order; no `Date` is built, so no timezone can move the answer by a day.
 */
export function releaseState(
  releaseDate: string | null | undefined,
  options: ReleaseStateOptions = {},
): ReleaseState {
  if (releaseDate) {
    const today = options.today ?? todayLocal();
    return releaseDate > today ? { released: false, releaseDate } : { released: true };
  }

  return options.status === 'unreleased'
    ? { released: false, releaseDate: null }
    : { released: true };
}
