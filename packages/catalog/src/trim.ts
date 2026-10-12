import type { IgdbGame } from './types';

/**
 * How far back "recently released" reaches, in days. Two years.
 */
export const RECENT_RELEASE_DAYS = 730;

/** IGDB's `game_type` for a main game. */
export const MAIN_GAME_TYPE = 0;

/** IGDB's `game_type` for a remake: a new game built on an old one. */
export const REMAKE_GAME_TYPE = 8;

/**
 * The `game_type` values the mirror keeps: main games and remakes.
 *
 * The rule for what counts as one game, inferred 2026-10-12 from
 * docs/private/phone-feedback.md entry 14 and still Rafa's to confirm: the
 * platform never matters, so a port (11) is the same game and stays out, and
 * the original on N64, Virtual Console and Switch Online is one entry. A
 * remake is a different game, so it is its own row with its own year and
 * release date. DLC (1), expansions (2), bundles (3), standalone expansions
 * (4), mods (5), episodes (6), seasons (7), remasters (9), expanded games
 * (10), forks (12), packs (13) and updates (14) stay out. Remasters and
 * expanded games are the open question: see docs/design/igdb-setup.md.
 */
export const KEPT_GAME_TYPES: readonly number[] = [MAIN_GAME_TYPE, REMAKE_GAME_TYPE];

export interface TrimRule {
  /**
   * The `where` body for an IGDB query, without the trailing semicolon and
   * without any `updated_at` cursor.
   */
  where: string;
  /** The same rule applied to a game IGDB actually returned. */
  keep: (game: IgdbGame) => boolean;
}

/**
 * The one trim rule that keeps the mirror inside Supabase's Free 500 MB limit.
 *
 * IGDB holds well over 300,000 games. Mirroring all of them, with summaries,
 * would not fit. Keep a game only when all of the following hold:
 *
 *   1. it is a main game or a remake (`game_type` 0 or 8, see
 *      {@link KEPT_GAME_TYPES}), so no DLC, bundles, ports, remasters, or mods;
 *   2. it has a cover, because a catalog row with no art is not showable in
 *      the app and is almost always an obscure stub; and
 *   3. somebody has rated it (`total_rating_count >= 1`) **or** it came out
 *      within the last {@link RECENT_RELEASE_DAYS} days, so that new releases
 *      are searchable before they accumulate ratings.
 *
 * The returned object exposes the rule twice, from one definition: as the
 * IGDB `where` clause that keeps the trim server-side (so the pull stays small
 * and fast), and as a local predicate applied to every row that comes back.
 * The local pass is not redundant: IGDB's `where` is evaluated against a
 * search index that can lag the record, and a page fetched mid-update can
 * carry rows that no longer match.
 *
 * @param now Reference instant, injected so the rule is testable.
 */
export function catalogTrim(now: Date): TrimRule {
  const cutoffSeconds = Math.floor(now.getTime() / 1000) - RECENT_RELEASE_DAYS * 24 * 60 * 60;

  return {
    where:
      // `= (a,b)` is IGDB's "any of" for a single-valued field.
      `game_type = (${KEPT_GAME_TYPES.join(',')})` +
      ` & cover != null` +
      ` & (total_rating_count >= 1 | first_release_date >= ${cutoffSeconds})`,

    keep(game: IgdbGame): boolean {
      if (game.game_type === undefined || !KEPT_GAME_TYPES.includes(game.game_type)) return false;
      if (!game.cover?.image_id) return false;

      const rated = (game.total_rating_count ?? 0) >= 1;
      const recent =
        game.first_release_date !== undefined && game.first_release_date >= cutoffSeconds;

      return rated || recent;
    },
  };
}
