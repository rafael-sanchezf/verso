import type { CatalogTitleRow, MatchCounts, MatchResult, SourceKey } from './types';

/**
 * The marks a storefront puts in a title and a catalogue does not.
 *
 * Stripped *before* NFKD, and that order is the whole point: NFKD decomposes
 * U+2122 TRADE MARK SIGN into the two letters "TM" and U+2120 SERVICE MARK into
 * "SM", so a normalizer that folded first and dropped non-letters second would
 * turn "A Game About Digging A Hole™" into `agameaboutdiggingaholetm` and never
 * match the catalog's `agameaboutdiggingahole`. Caught by the live Game Pass
 * fixture, which contains exactly that title.
 *
 * ® and © decompose to nothing and would have been dropped anyway; they are
 * listed here so the rule is one rule rather than two.
 */
const TRADEMARK_MARKS = /[™®©℗℠]/gu;

/**
 * A title reduced to the part two catalogues can agree on.
 *
 * Microsoft, IGDB and everybody else disagree about punctuation, spacing, case
 * and legal furniture but rarely about letters and digits, so the key is the
 * letters and digits and nothing else:
 *
 *   "Marvel's Spider-Man: Miles Morales"  ->  marvelsspidermanmilesmorales
 *   "A Game About Digging A Hole™"        ->  agameaboutdiggingahole
 *   "Assassin's Creed® Odyssey"           ->  assassinscreedodyssey
 *
 * Trademark marks first (see above); then NFKD, so "Ōkami" and "Okami" are not
 * two games and a full-width digit is a digit; then case folding; then
 * everything that is not a Unicode letter or number goes, which takes all
 * punctuation and whitespace with it.
 *
 * This is deliberately lossy, and that is why `matchUnique` below refuses a key
 * that is not unique on *both* sides: collapsing "Portal 2" and "Portal²" into
 * one key is fine as long as nothing is guessed when they actually collide.
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(TRADEMARK_MARKS, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Catalog rows grouped by normalized title.
 *
 * A key with more than one id is the catalog's own ambiguity -- two mirrored
 * IGDB games whose titles differ only in punctuation, a game and its remaster
 * sharing a name -- and `matchUnique` will not resolve it.
 */
export function indexCatalogByTitle(rows: readonly CatalogTitleRow[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const row of rows) {
    const key = normalizeTitle(row.title);
    if (key.length === 0) continue;
    const existing = index.get(key);
    if (existing) existing.push(row.media_item_id);
    else index.set(key, [row.media_item_id]);
  }

  return index;
}

/** Rows grouped by a key that is already exact, such as a Steam app id. */
export function indexCatalogByKey(
  rows: ReadonlyArray<{ media_item_id: string; key: string }>,
): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const row of rows) {
    const existing = index.get(row.key);
    if (existing) existing.push(row.media_item_id);
    else index.set(row.key, [row.media_item_id]);
  }

  return index;
}

/** How many examples of each kind of miss a run keeps for its log. */
export const MATCH_EXAMPLE_LIMIT = 5;

/**
 * Join a source's entries to catalog rows, and refuse to guess.
 *
 * A key is accepted only when exactly one source entry and exactly one catalog
 * row carry it. Everything else is counted and named rather than resolved:
 *
 *   * `ambiguousSource`  - two products with the same key. Two editions of one
 *     game in a Game Pass collection, typically, and nothing in either record
 *     says which is the one our catalog row means.
 *   * `ambiguousCatalog` - two catalog rows with the same key.
 *   * `unmatched`        - a key our catalog does not have at all, which is the
 *     ordinary case: the mirror is trimmed, and Game Pass carries editions and
 *     bundles that are not IGDB games.
 *
 * "Skip and count, never guess" is the whole rule here. A wrong row on this
 * table tells a user a game is on a service they pay for when it is not, and
 * the cost of that is much higher than a missing badge.
 */
export function matchUnique(
  entries: readonly SourceKey[],
  catalog: ReadonlyMap<string, string[]>,
): MatchResult {
  const byKey = new Map<string, SourceKey[]>();
  for (const entry of entries) {
    if (entry.key.length === 0) continue;
    const existing = byKey.get(entry.key);
    if (existing) existing.push(entry);
    else byKey.set(entry.key, [entry]);
  }

  const counts: MatchCounts = {
    ambiguousSource: 0,
    ambiguousCatalog: 0,
    unmatched: 0,
  };
  const matched: Array<{ media_item_id: string; source_ref: string | null }> = [];
  const examples: MatchResult['examples'] = { ambiguousSource: [], ambiguousCatalog: [], unmatched: [] };

  const remember = (bucket: string[], title: string): void => {
    if (bucket.length < MATCH_EXAMPLE_LIMIT && title.length > 0) bucket.push(title);
  };

  for (const [key, group] of byKey) {
    const first = group[0]!;

    if (group.length > 1) {
      counts.ambiguousSource += group.length;
      remember(examples.ambiguousSource, first.title);
      continue;
    }

    const ids = catalog.get(key);
    if (!ids || ids.length === 0) {
      counts.unmatched += 1;
      remember(examples.unmatched, first.title);
      continue;
    }
    if (ids.length > 1) {
      counts.ambiguousCatalog += 1;
      remember(examples.ambiguousCatalog, first.title);
      continue;
    }

    matched.push({ media_item_id: ids[0]!, source_ref: first.sourceRef });
  }

  return { matched, counts, examples };
}
