/**
 * Where a title's one request goes, shared by the nightly client (`tmdb.ts`)
 * and the search-miss Edge Function (`supabase/functions/tmdb-lookup`), so a
 * film fetched on demand is asked for with exactly the sub-resources the
 * mirror maps. Node-free for the same reason as `tmdb-map.ts`.
 */

/** The environment variable holding the v4 read access token. */
export const TMDB_TOKEN_ENV = 'TMDB_API_READ_ACCESS_TOKEN';

/** TMDB's API host. Every route below is under `/3`. */
export const TMDB_API_BASE = 'https://api.themoviedb.org';

/** The one language the mirror stores. */
export const TMDB_LANGUAGE = 'en-US';

/**
 * Every sub-resource a film's one request brings back.
 *
 * `append_to_response` takes up to 20 of these, so the whole of a title is one
 * round trip rather than five (research 2.1). `release_dates` is the only
 * place the per-region dates and certifications live, and `watch/providers` is
 * the JustWatch relay.
 */
export const MOVIE_APPEND = 'credits,external_ids,release_dates,watch/providers';

/**
 * The same for a series.
 *
 * `aggregate_credits` rather than `credits` because a show's `credits` is the
 * latest season's cast, while the aggregate is ordered by episodes across the
 * whole run, which is what "top cast" means for a series.
 */
export const TV_APPEND = 'aggregate_credits,external_ids,content_ratings,watch/providers';

/** One film with every sub-resource the mirror reads, as a path under the API host. */
export function movieDetailPath(id: number): string {
  return `/3/movie/${id}?language=${TMDB_LANGUAGE}&append_to_response=${encodeURIComponent(MOVIE_APPEND)}`;
}

/** One series, likewise. */
export function tvDetailPath(id: number): string {
  return `/3/tv/${id}?language=${TMDB_LANGUAGE}&append_to_response=${encodeURIComponent(TV_APPEND)}`;
}
