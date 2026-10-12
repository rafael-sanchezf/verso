/**
 * The recent-searches list, as rules rather than as storage.
 *
 * Everything here is pure so it can be tested without a device: the AsyncStorage
 * side of it lives in `use-recent-searches.ts` and is three lines around these
 * functions. What is worth testing is the list discipline — what counts as the
 * same query, where a repeat goes, and how many are kept — because all three are
 * the kind of thing that looks right until the list quietly fills with
 * "hades", "Hades" and "hades ".
 *
 * Ten are stored and three are shown (specs/search.md). The seven that are not
 * shown are not waste: they are what makes the list survive a few searches for
 * something the user was not looking for.
 */

/** The AsyncStorage key, as specs/search.md names it. */
export const RECENT_KEY = 'search.recent';

/** How many are kept. */
export const RECENT_LIMIT = 10;

/** How many the idle screen draws. */
export const RECENT_SHOWN = 3;

/**
 * Two queries are the same query when they differ only in case or in the spaces
 * around them — searching "hades" and then "Hades " is one search that the user
 * made twice, and a list that disagrees is a list that repeats itself.
 */
function sameQuery(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The list with this query at the front.
 *
 * A repeat moves rather than duplicates, and it keeps the spelling the user just
 * typed rather than the one they typed last week: the newer one is the one they
 * will recognise. A blank query is not a search and leaves the list alone.
 */
export function withRecent(list: readonly string[], query: string): string[] {
  const trimmed = query.trim();
  if (trimmed === '') return [...list];

  const rest = list.filter((entry) => !sameQuery(entry, trimmed));
  return [trimmed, ...rest].slice(0, RECENT_LIMIT);
}

/**
 * What came back out of AsyncStorage, if it is a list of queries.
 *
 * Storage is a string that some earlier version of this app wrote, so it is
 * parsed rather than trusted: bad JSON, a value that is not an array, and
 * entries that are not strings all mean "no recent searches" rather than a
 * crash on the Search tab. The same cleaning `withRecent` applies is applied
 * again on the way in, so a list written by a looser version does not survive
 * as duplicates.
 */
export function parseRecent(raw: string | null | undefined): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const queries: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    if (queries.some((kept) => sameQuery(kept, trimmed))) continue;
    queries.push(trimmed);
  }
  return queries.slice(0, RECENT_LIMIT);
}
