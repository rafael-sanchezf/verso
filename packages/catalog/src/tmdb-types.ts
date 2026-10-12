/**
 * Shapes exchanged with TMDB and with Postgres, for the film and TV mirror.
 *
 * The same rule as `types.ts`: only the fields the mirror actually requests
 * are modelled, and everything but `id` is optional. TMDB is more generous
 * than IGDB about sending a key with an empty value rather than omitting it,
 * so a consumer here has to cope with both `undefined` and `''`; the mapper
 * turns the empty string into null on the way to Postgres and nothing else in
 * the package is allowed to store one.
 *
 * Field names are taken from TMDB's own reference pages, fetched on
 * 2026-09-16: movie-details, tv-series-details, movie-release-dates,
 * tv-series-content-ratings, tv-series-aggregate-credits,
 * changes-movie-list, movie-watch-providers and watch-providers-movie-list.
 * The one shape not confirmed against a rendered example is the JSON *key*
 * `append_to_response` nests the watch providers under; see
 * {@link TmdbWatchProviders}.
 *
 * See docs/design/film-tv-catalog.md for which of these fields lands in which
 * column, and docs/research/film-tv-data-sources.md 2.1, 2.2 and 3.1 for why
 * these are the fields worth asking for.
 */

/** The two media this mirror carries. Games come from IGDB and are elsewhere. */
export type TmdbMedium = 'movie' | 'tv';

/** A `{ id, name }` pair, which is how TMDB returns genres and networks. */
export interface TmdbNamed {
  id?: number;
  name?: string;
}

export interface TmdbGenre extends TmdbNamed {}

export interface TmdbCompany extends TmdbNamed {
  logo_path?: string | null;
  origin_country?: string;
}

export interface TmdbCollection {
  id?: number;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

/** One entry of `credits.cast`, ordered by `order`. */
export interface TmdbCastMember {
  id?: number;
  name?: string;
  original_name?: string;
  character?: string;
  profile_path?: string | null;
  /** TMDB's billing order. 0 is top billed. */
  order?: number;
}

/** One entry of `credits.crew`. Filtered on `job`, never on `department`. */
export interface TmdbCrewMember {
  id?: number;
  name?: string;
  job?: string;
  department?: string;
  profile_path?: string | null;
}

export interface TmdbCredits {
  cast?: TmdbCastMember[];
  crew?: TmdbCrewMember[];
}

/**
 * One role a series cast member played, inside `aggregate_credits.cast`.
 *
 * A cast member can hold several: a character who is recast, or an actor who
 * plays twins. The mapper takes the first, which is the one with the most
 * episodes because TMDB orders them that way.
 */
export interface TmdbAggregateRole {
  credit_id?: string;
  character?: string;
  episode_count?: number;
}

/** One entry of `aggregate_credits.cast`, ordered across the whole run. */
export interface TmdbAggregateCastMember {
  id?: number;
  name?: string;
  original_name?: string;
  profile_path?: string | null;
  roles?: TmdbAggregateRole[];
  /** Episodes this person appears in, summed over every role. */
  total_episode_count?: number;
  order?: number;
}

export interface TmdbAggregateCredits {
  cast?: TmdbAggregateCastMember[];
  crew?: unknown[];
}

/**
 * `append_to_response=external_ids`.
 *
 * `imdb_id` is also a top-level field on a movie detail and the two agree;
 * the mapper reads this one first and falls back to the top-level one.
 * `tvdb_id` exists only for series.
 */
export interface TmdbExternalIds {
  imdb_id?: string | null;
  wikidata_id?: string | null;
  tvdb_id?: number | null;
  facebook_id?: string | null;
  instagram_id?: string | null;
  twitter_id?: string | null;
}

/**
 * One dated release of a film in one country.
 *
 * `release_date` is a full ISO instant (`1999-11-04T00:00:00.000Z`), not a
 * plain date, so the mapper takes the first ten characters rather than
 * parsing it. `type` is 1 premiere, 2 theatrical (limited), 3 theatrical,
 * 4 digital, 5 physical, 6 TV.
 */
export interface TmdbReleaseDate {
  certification?: string;
  descriptors?: string[];
  iso_639_1?: string;
  note?: string;
  release_date?: string;
  type?: number;
}

export interface TmdbReleaseDatesResult {
  iso_3166_1?: string;
  release_dates?: TmdbReleaseDate[];
}

export interface TmdbReleaseDates {
  results?: TmdbReleaseDatesResult[];
}

/** One country's rating for a series, from `append_to_response=content_ratings`. */
export interface TmdbContentRating {
  iso_3166_1?: string;
  rating?: string;
  descriptors?: string[];
}

export interface TmdbContentRatings {
  results?: TmdbContentRating[];
}

/** One provider as it appears on a title, inside a country's offer arrays. */
export interface TmdbTitleProvider {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
  /** JustWatch's suggested ordering within that country. */
  display_priority?: number;
}

/**
 * One country's offers for a title.
 *
 * The five arrays are the five `offer_type` values `watch_availability`
 * accepts. `link` is TMDB's watch page for the title and locale, which is
 * what the JustWatch attribution has to point at (research 3.1); the mirror
 * stores nothing for it because the app can build it from the tmdb id.
 */
export interface TmdbCountryOffers {
  link?: string;
  flatrate?: TmdbTitleProvider[];
  free?: TmdbTitleProvider[];
  ads?: TmdbTitleProvider[];
  rent?: TmdbTitleProvider[];
  buy?: TmdbTitleProvider[];
}

/**
 * `append_to_response=watch/providers`.
 *
 * The key TMDB nests this under is the literal `watch/providers`, slash
 * included. That is the one field name here not confirmed against a rendered
 * example response: the append-to-response documentation page says only that
 * each sub-request "appends as a new JSON object" and does not name the keys,
 * and the watch providers reference page renders its example as prose. It is
 * the key every open-source client reads, and the first live run is what
 * confirms it. The mapper reads both `watch/providers` and a `watch_providers`
 * spelling so a surprise costs nothing.
 */
export interface TmdbWatchProviders {
  id?: number;
  results?: Record<string, TmdbCountryOffers | undefined>;
}

/** `GET /3/movie/{id}` with the mirror's `append_to_response` list. */
export interface TmdbMovieDetail {
  id: number;
  adult?: boolean;
  backdrop_path?: string | null;
  belongs_to_collection?: TmdbCollection | null;
  budget?: number;
  genres?: TmdbGenre[];
  homepage?: string | null;
  imdb_id?: string | null;
  origin_country?: string[];
  original_language?: string;
  original_title?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  production_companies?: TmdbCompany[];
  production_countries?: Array<{ iso_3166_1?: string; name?: string }>;
  /** TMDB's primary date, `YYYY-MM-DD` or the empty string. */
  release_date?: string;
  revenue?: number;
  /** Minutes. TMDB sends 0 rather than null for a film it has no runtime for. */
  runtime?: number | null;
  spoken_languages?: Array<{ english_name?: string; iso_639_1?: string; name?: string }>;
  status?: string;
  tagline?: string;
  title?: string;
  /** True for a record that is a trailer or an extra rather than a film. */
  video?: boolean;
  vote_average?: number;
  vote_count?: number;

  credits?: TmdbCredits;
  external_ids?: TmdbExternalIds;
  release_dates?: TmdbReleaseDates;
  'watch/providers'?: TmdbWatchProviders;
  watch_providers?: TmdbWatchProviders;
}

/** One entry of a series' `seasons` array. Season 0 is specials. */
export interface TmdbSeason {
  air_date?: string | null;
  episode_count?: number;
  id?: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  season_number?: number;
  vote_average?: number;
}

/** The episode stub `next_episode_to_air` and `last_episode_to_air` carry. */
export interface TmdbEpisodeStub {
  id?: number;
  name?: string;
  overview?: string;
  air_date?: string | null;
  episode_number?: number;
  season_number?: number;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
  vote_count?: number;
}

/** `GET /3/tv/{id}` with the mirror's `append_to_response` list. */
export interface TmdbTvDetail {
  id: number;
  adult?: boolean;
  backdrop_path?: string | null;
  created_by?: Array<{ id?: number; name?: string; profile_path?: string | null }>;
  /** Often empty, often a single value that describes only some episodes. */
  episode_run_time?: number[];
  first_air_date?: string;
  genres?: TmdbGenre[];
  homepage?: string | null;
  in_production?: boolean;
  languages?: string[];
  last_air_date?: string | null;
  last_episode_to_air?: TmdbEpisodeStub | null;
  name?: string;
  next_episode_to_air?: TmdbEpisodeStub | null;
  networks?: TmdbCompany[];
  /** Seasons 1 and up, TMDB's convention: season 0 is not counted. */
  number_of_episodes?: number;
  number_of_seasons?: number;
  origin_country?: string[];
  original_language?: string;
  original_name?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  production_companies?: TmdbCompany[];
  seasons?: TmdbSeason[];
  /** Returning Series, Ended, Canceled, In Production, Planned, Pilot. */
  status?: string;
  tagline?: string;
  /** Scripted, Miniseries, Documentary, Reality, Talk Show, News, Video. */
  type?: string;
  vote_average?: number;
  vote_count?: number;

  aggregate_credits?: TmdbAggregateCredits;
  external_ids?: TmdbExternalIds;
  content_ratings?: TmdbContentRatings;
  'watch/providers'?: TmdbWatchProviders;
  watch_providers?: TmdbWatchProviders;
}

/** One page of `GET /3/movie/changes` or `/3/tv/changes`. */
export interface TmdbChangesPage {
  results?: Array<{ id?: number; adult?: boolean | null }>;
  page?: number;
  total_pages?: number;
  total_results?: number;
}

/** One provider in `GET /3/watch/providers/{movie,tv}`. */
export interface TmdbProviderDirectoryEntry {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
  /** Region to integer, JustWatch's ordering per country. */
  display_priorities?: Record<string, number>;
  /** The provider's priority in the region the request asked about. */
  display_priority?: number;
}

export interface TmdbProviderDirectory {
  results?: TmdbProviderDirectoryEntry[];
}

/**
 * One line of a daily id export.
 *
 * The files are newline-delimited JSON objects rather than a JSON array, one
 * object per title, which is what lets the client stream them. Measured
 * against the 2026-09-16 files: every movie line carries `adult` (always
 * false, so TMDB filters the adult titles out of the public export itself)
 * and `video`; no TV line carries `adult` at all, which is why the discovery
 * predicate treats a missing `adult` as false rather than requiring it.
 */
export interface TmdbExportLine {
  id: number;
  original_title?: string;
  original_name?: string;
  popularity?: number;
  adult?: boolean;
  /** Movies only. True for a record that is a trailer rather than a film. */
  video?: boolean;
}

// --- Rows destined for Postgres ---------------------------------------------
// Column names are exactly those in docs/design/film-tv-catalog.md's Schema
// section, which is the migration's contract too.

/** A row destined for `public.media_items` with `medium in ('movie','tv')`. */
export interface TmdbMediaItemRow {
  medium: TmdbMedium;
  title: string;
  year: number | null;
  /** `YYYY-MM-DD`, read in UTC. `release_date` for films, `first_air_date` for series. */
  release_date: string | null;
  /** `poster_path` verbatim, leading slash included. */
  cover_image_id: string | null;
  /** Merged with `||`, never replaced, so another pass's keys survive. */
  external_ids: Record<string, number | string>;
  /** Merged with `||` for the same reason. */
  metadata: Record<string, number | string | boolean | null>;
  refreshed_at: string;
}

/** A row destined for `public.movie_details`, minus the uuid it hangs off. */
export interface MovieDetailsRow {
  tmdb_id: number;
  runtime_minutes: number | null;
  genres: string[];
  directors: string[];
  writers: string[];
  top_cast: TmdbCastCredit[];
  studio: string | null;
  collection_tmdb_id: number | null;
  collection_name: string | null;
  tagline: string | null;
  overview: string | null;
  backdrop_image_id: string | null;
}

/** One entry of `movie_details.top_cast` or `tv_details.top_cast`. */
export interface TmdbCastCredit {
  tmdb_person_id: number | null;
  name: string;
  character: string | null;
  profile_path: string | null;
  /** Series only: episodes this person appears in across the run. */
  episode_count?: number | null;
}

/** A row destined for `public.tv_details`, minus the uuid it hangs off. */
export interface TvDetailsRow {
  tmdb_id: number;
  status: string | null;
  show_type: string | null;
  in_production: boolean | null;
  first_air_date: string | null;
  last_air_date: string | null;
  networks: string[];
  creators: string[];
  genres: string[];
  origin_country: string[];
  season_count: number | null;
  episode_count: number | null;
  episode_runtime_minutes: number | null;
  next_episode_air_date: string | null;
  next_episode_season: number | null;
  next_episode_number: number | null;
  next_episode_name: string | null;
  last_episode_air_date: string | null;
  last_episode_season: number | null;
  last_episode_number: number | null;
  top_cast: TmdbCastCredit[];
  overview: string | null;
  backdrop_image_id: string | null;
}

/** A row destined for `public.tv_seasons`. Season 0 included. */
export interface TvSeasonRow {
  season_number: number;
  tmdb_season_id: number | null;
  name: string | null;
  episode_count: number | null;
  air_date: string | null;
  poster_image_id: string | null;
  overview: string | null;
}

/** A row destined for `public.media_release_dates`. Films only. */
export interface MediaReleaseDateRow {
  region: string;
  /** 1 premiere, 2 theatrical limited, 3 theatrical, 4 digital, 5 physical, 6 TV. */
  release_type: number;
  released_on: string;
  certification: string | null;
  note: string | null;
}

/** A row destined for `public.media_certifications`. One per region. */
export interface MediaCertificationRow {
  region: string;
  certification: string;
}

/** A row destined for `public.watch_providers`. */
export interface WatchProviderRow {
  provider_id: number;
  name: string;
  logo_image_id: string | null;
  display_priorities: Record<string, number>;
}

/** Which array of a country's offers a provider sat in. */
export type WatchOfferType = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';

export const WATCH_OFFER_TYPES: readonly WatchOfferType[] = [
  'flatrate',
  'free',
  'ads',
  'rent',
  'buy',
];

/**
 * A row destined for `public.watch_availability`, minus the uuid and the three
 * timestamps, which the reconciliation owns.
 */
export interface WatchAvailabilityRow {
  region: string;
  provider_id: number;
  offer_type: WatchOfferType;
}

/**
 * Everything one film becomes, ready for one transaction.
 *
 * The `media_item_id` is deliberately absent from every row but is what they
 * all need: it is only known once the `media_items` statement has run, which
 * is why the store takes this whole object rather than a list per table.
 */
export interface MappedMovie {
  mediaItem: TmdbMediaItemRow;
  details: MovieDetailsRow;
  /** The `tmdb` score, present only when `vote_count >= 1`. */
  score: TmdbScoreInput | null;
  releaseDates: MediaReleaseDateRow[];
  certifications: MediaCertificationRow[];
  availability: WatchAvailabilityRow[];
  /**
   * Providers this title's offers reference, as the title itself describes
   * them. Inserted before the availability rows so the foreign key holds even
   * when the directory has not caught up.
   */
  providerStubs: WatchProviderRow[];
  /** The regions this mapping asked about, which the reconciliation is scoped to. */
  regions: string[];
}

/** Everything one series becomes. The same shape, plus its seasons. */
export interface MappedTv {
  mediaItem: TmdbMediaItemRow;
  details: TvDetailsRow;
  score: TmdbScoreInput | null;
  seasons: TvSeasonRow[];
  certifications: MediaCertificationRow[];
  availability: WatchAvailabilityRow[];
  providerStubs: WatchProviderRow[];
  regions: string[];
}

/**
 * The `external_scores` row TMDB gives us, minus the uuid.
 *
 * `score` is `vote_average * 10` so every source in the table shares the
 * 0-100 scale, and `score_count` is `vote_count`.
 */
export interface TmdbScoreInput {
  source: 'tmdb';
  score: number;
  score_count: number;
}

/** One title the staleness pass should re-fetch. */
export interface TmdbStaleTarget {
  media_item_id: string;
  tmdb_id: number;
}

/** What one batch of titles wrote, per table. */
export interface TmdbUpsertCounts {
  mediaItems: number;
  details: number;
  scores: number;
  seasons: number;
  releaseDates: number;
  certifications: number;
  providerStubs: number;
  availabilityWritten: number;
  availabilityClosed: number;
}
