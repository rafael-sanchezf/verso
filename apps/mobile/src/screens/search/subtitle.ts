/**
 * The second line of a search row: what we know about a game we have never
 * shown this user before.
 *
 * Rule 9, show what you know and say what you don't: the line falls down a
 * defined hierarchy and is never an empty 13pt gap under the title. The chain
 * specs/search.md gives for a result is `{year} · {platforms}`, then the year
 * alone, then the developer — and, since the row has both facts or neither
 * independently, the platforms alone when the catalog has no year, which is the
 * one case the spec does not name and the one case where dropping to the
 * developer would be throwing away the better fact.
 *
 * Popular rows come from a narrower function (`popular_games` returns six
 * columns and no developer), so their chain stops one step earlier.
 *
 * Imported relatively rather than through `@/`: this module is tested under
 * `apps/mobile/test/` by vitest, which resolves the app's path alias only for
 * Metro.
 */

import type { PopularGameRow, SearchGameRow } from '@verso/api';

import { platforms as formatPlatforms } from '../../lib/format';

/**
 * `2025 · Switch 2, PC`, or whichever half exists.
 *
 * Platforms are joined with `, ` and capped at three plus a count, which is
 * `format.ts`'s rule for a Search row (specs/README.md, "Formatting helpers").
 */
function yearAndPlatforms(
  year: number | null,
  platformNames: readonly string[] | null | undefined,
): string | null {
  const parts: string[] = [];
  if (year !== null && Number.isFinite(year)) parts.push(String(year));

  const names = formatPlatforms(platformNames, ', ');
  if (names !== null) parts.push(names);

  return parts.length === 0 ? null : parts.join(' · ');
}

/** The subtitle for one `searchGames` hit. */
export function searchSubtitle(row: Pick<SearchGameRow, 'year' | 'platforms' | 'developer'>): string | null {
  const catalog = yearAndPlatforms(row.year, row.platforms);
  if (catalog !== null) return catalog;

  const developer = row.developer?.trim();
  return developer ? developer : null;
}

/**
 * The subtitle for one `popularGames` row.
 *
 * No developer to fall back to, so a catalog row with neither a year nor a
 * platform list draws a title and nothing else — which is honest, and is what
 * `ListRow` does with a null subtitle.
 */
export function popularSubtitle(row: Pick<PopularGameRow, 'year' | 'platforms'>): string | null {
  return yearAndPlatforms(row.year, row.platforms);
}
