/**
 * Typed wrappers around the catalog RPCs. The catalog is mirrored from IGDB
 * into Postgres by a scheduled script; the app never calls IGDB directly, so
 * search is a trigram query against media_items and media_aliases (IGDB's
 * alternative names and the initialisms derived from each title).
 *
 * Both RPCs take a medium since
 * supabase/migrations/20260916230000_per_medium_backlog_and_rpcs.sql, and both
 * default to `'game'` in the database rather than here. The wrappers send
 * `p_medium` only when a caller gives one, so a call that says nothing about
 * the medium is byte for byte the call it always was and every existing caller
 * keeps working untouched.
 */

import type { Medium } from '@verso/core';
import type { Client } from './client';
import type { Database } from './database.types';

type Functions = Database['public']['Functions'];

/** Re-adds the nullability that `supabase gen types` drops for set-returning functions. */
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/**
 * One search hit. `score` is the match tier (4 exact title, 3 exact IGDB
 * alternative name, 2 a word or alias starting with the term, 1 similar) plus
 * a closeness between 0 and 1, so it runs from 1 to 5 and is only meaningful
 * as an ordering; popularity breaks ties the score does not show.
 *
 * `cover_image_id` and `external_ids` are the two facts a cover is built from,
 * so a hit goes to `coverCandidates` as it is and a game IGDB has no cover for
 * falls back to its Steam art. `external_ids` is `Json`, which already admits
 * null, so it needs no entry in the `Nullable` list below.
 */
export type SearchGameRow = Nullable<
  Functions['search_games']['Returns'][number],
  'year' | 'cover_image_id' | 'developer' | 'igdb_id'
>;

export interface SearchGamesOptions {
  /** Maximum hits. The database clamps this to 1..100; it defaults to 20. */
  limit?: number;
  /**
   * Which medium to search. Omitted means games, which is the database's own
   * default, so nothing is sent for it and a caller that never heard of the
   * argument is unaffected.
   */
  medium?: Medium;
}

/**
 * Search one medium's catalog by title and by alias. Results come back exact
 * title first, then an exact IGDB alternative name ("gtav"), then titles with
 * a word starting with the term ("zelda", "breath") and aliases starting with
 * it ("gta", "botw"), then by similarity; within each, the closer match and
 * then the more popular title first. A blank query returns nothing. See
 * supabase/migrations/20260923110000_search_aliases.sql.
 *
 * `genres` comes from whichever extension table holds the row, so a film's
 * genres are TMDB's and a game's are IGDB's. `igdbId`, `developer` and
 * `platforms` are a game's fields and come back null or empty for a film or a
 * series rather than being dropped from the row.
 */
export async function searchGames(
  client: Client,
  query: string,
  options: SearchGamesOptions = {},
): Promise<SearchGameRow[]> {
  const { data, error } = await client.rpc('search_games', {
    p_query: query,
    ...(options.limit === undefined ? {} : { p_limit: options.limit }),
    ...(options.medium === undefined ? {} : { p_medium: options.medium }),
  });
  if (error) throw error;
  return (data ?? []) as SearchGameRow[];
}

/**
 * One row of the popular list: what a Search row draws, and what a cover needs.
 *
 * Deliberately narrower than `SearchGameRow`. There is no `score`, because
 * nothing was searched for; no `developer` or `genres`, because the row that
 * shows this does not use them; and the catalog id is called `id` rather than
 * `media_item_id`, because this one comes from `media_items` and not from a
 * join whose subject needed naming. The six columns are the ones
 * docs/design/specs/search.md lists for a Popular row, `external_ids`
 * included, which is the field the Steam cover fallback is built from.
 */
export type PopularGameRow = Nullable<
  Functions['popular_games']['Returns'][number],
  'year' | 'cover_image_id'
>;

/**
 * The most-rated games in the catalog, most rated first.
 *
 * The one catalog read that works signed out: `popular_games` is
 * `security definer`, so Search's "Popular" list and the signed-out cover wall
 * can both be real rather than a hardcoded collage. The tables behind it stay
 * closed to `anon` — see the head of
 * supabase/migrations/20260916160000_popular_games.sql.
 *
 * The ordering is IGDB's count of ratings, which is popularity and not
 * quality. It is never shown as a number, and the label above the list must
 * not claim a signal the data does not carry: "Popular", not "Popular this
 * week" (docs/design/specs/search.md).
 *
 * The rating count is compared as `numeric`: IGDB's field is a double, and
 * the index the function reads is built over the same cast.
 *
 * `limit` is clamped by the database to 1..50 and defaults to 20. `medium`
 * defaults to `'game'` in the database and is sent only when it is given, so a
 * caller that passes a limit alone is making the same call it always made. For
 * films and series the ordering is TMDB's vote count rather than IGDB's rating
 * count, which is the same question asked of the other catalog, and `platforms`
 * comes back empty because it is a game's field.
 */
export async function popularGames(
  client: Client,
  limit?: number,
  medium?: Medium,
): Promise<PopularGameRow[]> {
  const { data, error } = await client.rpc('popular_games', {
    ...(limit === undefined ? {} : { p_limit: limit }),
    ...(medium === undefined ? {} : { p_medium: medium }),
  });
  if (error) throw error;
  return (data ?? []) as PopularGameRow[];
}

/** One catalog item's release date: `YYYY-MM-DD`, or null when the catalog has none. */
export interface ReleaseDateRow {
  mediaItemId: string;
  releaseDate: string | null;
}

/**
 * The release dates of the items with these ids, for `releaseState`.
 *
 * Search's two RPCs return no date, and the Playing intent needs one per row:
 * a game that is not out is never offered as Playing (phone feedback entry
 * 10). One read of `media_items`, which RLS opens to anyone signed in, for
 * every row on screen, the way `trackedMediaItemIds` asks about the same ids.
 * Duplicates are collapsed, an empty argument never reaches the network, and
 * an id the catalog does not have is simply absent from the answer.
 */
export async function releaseDates(
  client: Client,
  mediaItemIds: readonly string[],
): Promise<ReleaseDateRow[]> {
  const unique = [...new Set(mediaItemIds)];
  if (unique.length === 0) return [];

  const { data, error } = await client.from('media_items').select('id, release_date').in('id', unique);
  if (error) throw error;

  return data.map((row) => ({ mediaItemId: row.id, releaseDate: row.release_date }));
}
