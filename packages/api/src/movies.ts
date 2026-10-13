/**
 * The movies side's reads: the streaming-service directory the services
 * picker draws, the Watchlist (and the finder's pool, which is the same read
 * with the filters on), the Calendar, where one film sits, the count of
 * watched films not ranked yet, the movie page, and Home's rows by reason.
 *
 * The catalog facts come from the TMDB mirror (`packages/catalog`'s
 * `tmdb-sync`); the app never calls TMDB. Every availability surface credits
 * JustWatch ("Streaming data by JustWatch", docs/design/tmdb-setup.md); that
 * is the screen's job.
 *
 * No function takes a user id. The Watchlist and the Calendar are security
 * invoker functions on `auth.uid()`
 * (supabase/migrations/20261008203000_movie_reads.sql), so Row Level Security
 * decides the rows, and they read the region and the services from the
 * caller's profile (`setWatchSettings`), never from an argument. Today is an
 * argument, as it is for the games reads in views.ts: the device's date, so a
 * film opening tomorrow does not open tonight west of Greenwich.
 *
 * Like the RPC wrappers in onboarding.ts these return camelCase rows, and like
 * them they throw the PostgrestError: a failure is a bug or a dead network.
 */

import type { EntryStatus, Medium } from '@verso/core';
import type { Client } from './client';
import type { Json } from './database.types';
import { todayLocal } from './entries';
import { regionCode } from './profiles';
import type { ScoresBySource } from './views';

/** One streaming service as the directory lists it for a region. */
export interface WatchProvider {
  /** `watch_providers.provider_id`, the number `Profile.watchProviderIds` stores. */
  providerId: number;
  name: string;
  /** TMDB's `logo_path`, leading slash included; the URL is built at render time. Null when TMDB has none. */
  logoImageId: string | null;
  /** JustWatch's display priority in the region, lowest first. The picker's order. */
  priority: number;
}

/**
 * The services offered in a region, in JustWatch's display order: the grid of
 * logos on the services step and in Settings ("Where do you watch?"). A
 * provider the directory does not list for the region is left out, which is
 * how a picker for GB stops offering a US-only service.
 *
 * `region` is an ISO 3166-1 alpha-2 code (case and spaces forgiven); anything
 * else throws `RangeError` before the query, because it goes into a JSON path.
 * Empty until the mirror's first run, which is the normal state of a stack
 * with no TMDB token.
 */
export async function watchProviders(client: Client, region: string): Promise<WatchProvider[]> {
  const code = regionCode(region);
  const { data, error } = await client
    .from('watch_providers')
    .select('provider_id, name, logo_image_id, display_priorities')
    .not(`display_priorities->${code}`, 'is', null)
    .order(`display_priorities->${code}`, { ascending: true })
    .order('provider_id', { ascending: true });
  if (error) throw error;

  return data.map((row) => ({
    providerId: row.provider_id,
    name: row.name,
    logoImageId: row.logo_image_id,
    priority: Number((row.display_priorities as Record<string, unknown>)[code]),
  }));
}

/**
 * Where a want-to-watch film sits, by the one rule the Watchlist and the
 * Calendar share. `watchlist` is a film that streams now, or that is released
 * and streams nowhere; the rest are the Calendar's kinds.
 */
export type MoviePlacement = 'watchlist' | 'opening' | 'in_theaters' | 'streaming_soon' | 'release';

/** A Calendar row's kind: the user's own planned day, or the film's placement. */
export type CalendarKind = 'going' | Exclude<MoviePlacement, 'watchlist'>;

/** Where one film sits in a region on a day, and the dates behind it. */
export interface MovieReleaseState {
  placement: MoviePlacement;
  /**
   * The day the placement names, `YYYY-MM-DD`: the opening day for `opening`
   * and `in_theaters` ("In theaters since Nov 3"), the digital day for
   * `streaming_soon`, TMDB's primary date for `release`; null for `watchlist`.
   */
  placementOn: string | null;
  /** The earliest theatrical date in the region (limited or wide), or null. */
  theatricalOn: string | null;
  /** The earliest digital date in the region, or null. */
  digitalOn: string | null;
  /** Whether any offer in the region (subscription, free, ads, rent, buy) is current. */
  streamsNow: boolean;
}

/** One film on the Watchlist. */
export interface MovieWatchlistRow {
  mediaItemId: string;
  title: string;
  year: number | null;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the row to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  releaseDate: string | null;
  /** Null when TMDB has no runtime; the "Under 2 h" chip leaves such a film out. */
  runtimeMinutes: number | null;
  genres: string[];
  directors: string[];
  /** TMDB's 0-10 average times ten, as `external_scores` stores it; the screen divides by ten and labels it "TMDB". */
  tmdbScore: number | null;
  tmdbVoteCount: number | null;
  /** When it was added, an ISO timestamp. The list is newest first by this. */
  addedAt: string;
  /** Every service with a subscription, free or ads offer in the region now, as provider ids in display order. */
  streamsOn: number[];
  /** Those of `streamsOn` the caller has: the row's "Netflix" and the poster's service pill. */
  onMyServices: number[];
  /** Services that rent or sell it ("Rent · Apple TV"), in display order. All three empty is "Not streaming". */
  rentOrBuy: number[];
}

/** One row of the Calendar. */
export interface MovieCalendarRow {
  mediaItemId: string;
  title: string;
  year: number | null;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the row to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  runtimeMinutes: number | null;
  status: EntryStatus;
  /** `going` when the caller has a planned day from today on; otherwise the film's placement. */
  kind: CalendarKind;
  /** The day the row is about, `YYYY-MM-DD`: the planned day for `going`, otherwise the placement's. */
  onDate: string;
  plannedOn: string | null;
  theatricalOn: string | null;
  digitalOn: string | null;
}

export interface MovieListOptions {
  /** Treat this `YYYY-MM-DD` as today. For tests; the default is the device's own date. */
  today?: string;
}

export interface MovieWatchlistOptions extends MovieListOptions {
  /**
   * Only films on one of the caller's services now: the Watchlist's "On my
   * services" chip, and the finder's silent filter. With no services saved it
   * returns nothing, and the screen offers "Pick your services".
   */
  onMyServices?: boolean;
  /** At or under this runtime ("Under 2 h" is 120). A film with no runtime is left out. */
  maxMinutes?: number;
  /** Films sharing at least one of these genres, as `movie_details.genres` spells them. Empty is no filter. */
  genres?: readonly string[];
}

const PLACEMENTS: readonly MoviePlacement[] = ['watchlist', 'opening', 'in_theaters', 'streaming_soon', 'release'];

function toPlacement(value: string): MoviePlacement {
  if (!(PLACEMENTS as readonly string[]).includes(value)) throw new Error(`unknown placement ${value}`);
  return value as MoviePlacement;
}

/**
 * Where one film sits for the caller's region: the movie page's theatrical
 * line ("In theaters Oct 22 · Going? ›", "Streaming from Dec 3"). Pass the
 * profile's `watchRegion`. Null for an id that is not a film.
 */
export async function movieReleaseState(
  client: Client,
  mediaItemId: string,
  region: string,
  options: MovieListOptions = {},
): Promise<MovieReleaseState | null> {
  const { data, error } = await client
    .rpc('movie_release_state', {
      p_media_item_id: mediaItemId,
      p_region: regionCode(region),
      p_today: options.today ?? todayLocal(),
    })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    placement: toPlacement(data.placement),
    placementOn: data.placement_on ?? null,
    theatricalOn: data.theatrical_on ?? null,
    digitalOn: data.digital_on ?? null,
    streamsNow: data.streams_now,
  };
}

/**
 * The caller's Watchlist: the want-to-watch films you can stream, or that are
 * released and stream nowhere, newest added first (the tab's default sort;
 * Runtime, Year and Rating sort on the client from the fields here). A film
 * that is unreleased, in theaters, or streaming from a known future date is on
 * the Calendar instead, and moves here by itself the day it streams.
 *
 * With `onMyServices`, `maxMinutes` and `genres` it is also the finder's pool:
 * Home's first row (decision 28) and the answer to the question sheet, with
 * the services as the silent filter and "Show everything" as the same call
 * without it.
 */
export async function movieWatchlist(
  client: Client,
  options: MovieWatchlistOptions = {},
): Promise<MovieWatchlistRow[]> {
  if (options.maxMinutes !== undefined && (!Number.isInteger(options.maxMinutes) || options.maxMinutes <= 0)) {
    throw new RangeError(`maxMinutes must be a whole number of minutes above 0, got ${options.maxMinutes}`);
  }
  const { data, error } = await client.rpc('movie_watchlist', {
    p_today: options.today ?? todayLocal(),
    p_on_my_services: options.onMyServices ?? false,
    ...(options.maxMinutes === undefined ? {} : { p_max_minutes: options.maxMinutes }),
    ...(options.genres === undefined ? {} : { p_genres: [...options.genres] }),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    mediaItemId: row.media_item_id,
    title: row.title,
    year: row.year ?? null,
    coverImageId: row.cover_image_id ?? null,
    externalIds: row.external_ids,
    releaseDate: row.release_date ?? null,
    runtimeMinutes: row.runtime_minutes ?? null,
    genres: row.genres,
    directors: row.directors,
    tmdbScore: row.tmdb_score === null || row.tmdb_score === undefined ? null : Number(row.tmdb_score),
    tmdbVoteCount: row.tmdb_vote_count ?? null,
    addedAt: row.added_at,
    streamsOn: row.streams_on,
    onMyServices: row.on_my_services,
    rentOrBuy: row.rent_or_buy,
  }));
}

/**
 * The caller's Calendar: every film with a planned day from today on
 * ("GOING · FRI OCT 24"), and every want-to-watch film that is opening, in
 * theaters, streaming soon, or unreleased with only a date. One row per film;
 * the films in theaters now first (the "Now" group), then every row by its
 * day, soonest first, so the screen draws month headers by walking the list.
 */
export async function movieCalendar(client: Client, options: MovieListOptions = {}): Promise<MovieCalendarRow[]> {
  const { data, error } = await client.rpc('movie_calendar', { p_today: options.today ?? todayLocal() });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    mediaItemId: row.media_item_id,
    title: row.title,
    year: row.year ?? null,
    coverImageId: row.cover_image_id ?? null,
    externalIds: row.external_ids,
    runtimeMinutes: row.runtime_minutes ?? null,
    status: row.status,
    kind: row.kind as CalendarKind,
    onDate: row.on_date,
    plannedOn: row.planned_on ?? null,
    theatricalOn: row.theatrical_on ?? null,
    digitalOn: row.digital_on ?? null,
  }));
}

/**
 * How many of the caller's finished entries in one medium have no ranking
 * yet: the Ranking banner's "{n} watched films to rank ›" and "{n} played
 * games to rank". The count of `playedNotRanked` (onboarding.ts), the drain
 * bulk entry built, asked for without the rows: one HEAD request that
 * PostgREST answers with a count.
 */
export async function unrankedCount(client: Client, medium: Medium): Promise<number> {
  const { count, error } = await client.rpc(
    'played_not_ranked',
    { p_medium: medium },
    { head: true, count: 'exact' },
  );
  if (error) throw error;
  return count ?? 0;
}

/** One current offer on the movie page's "Where to watch". */
export interface MovieOffer {
  /** `watch_providers.provider_id`. */
  providerId: number;
  name: string;
  /** TMDB's `logo_path`, leading slash included; null when TMDB has none. */
  logoImageId: string | null;
  offerType: 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';
  /**
   * A subscription, free or ads offer on one of the caller's services: the
   * outlined chip with the check. Renting from a service you subscribe to is
   * not "on your services", the rule `onMyServices` follows on the Watchlist.
   */
  mine: boolean;
}

/** One cast member, as `movie_details.top_cast` stores them, in billing order. */
export interface MovieCastMember {
  tmdbPersonId: number | null;
  name: string;
  character: string | null;
  /** TMDB's `profile_path`, leading slash included, or null; the URL is built at render time. */
  profilePath: string | null;
}

/** The movie page's catalog half: the film, its facts, its scores, where it sits, where to watch it. */
export interface MoviePage {
  mediaItemId: string;
  title: string;
  year: number | null;
  releaseDate: string | null;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the page to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  tmdbId: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  directors: string[];
  writers: string[];
  topCast: MovieCastMember[];
  studio: string | null;
  /** "Part of": the collection's TMDB id and name, or null. */
  collectionTmdbId: number | null;
  collectionName: string | null;
  tagline: string | null;
  overview: string | null;
  backdropImageId: string | null;
  /** The region's certification ("PG-13"), or null when the region has none: the header line omits it. */
  certification: string | null;
  /**
   * Every external score the film has, by source, as the game page has them:
   * `tmdb` (TMDB's average times ten, `scoreCount` the votes) today, and
   * `rotten_tomatoes` when the Wikidata pass writes it. Label the source; never
   * average two (rule 21).
   */
  scores: ScoresBySource;
  /** The awards line. Null until the catalog has a source; the page hides the line. */
  awards: string | null;
  /** Where it sits by the one rule the Watchlist and the Calendar share; see `movieReleaseState`. */
  releaseState: MovieReleaseState;
  /** The region's current offers, in JustWatch's display order, then subscription, free, ads, rent, buy. */
  availability: MovieOffer[];
}

export interface MoviePageOptions extends MovieListOptions {
  /** The region to read the certification, the dates and the offers in. Omitted, the database uses the caller's `watchRegion` (US when unset). */
  region?: string;
}

interface RawScore {
  score: number | string | null;
  score_count: number | null;
  fetched_at: string;
}

interface RawCastMember {
  tmdb_person_id?: number | null;
  name: string;
  character?: string | null;
  profile_path?: string | null;
}

interface RawOffer {
  provider_id: number;
  name: string;
  logo_image_id: string | null;
  offer_type: MovieOffer['offerType'];
  mine: boolean;
}

/**
 * The movie page's catalog half in one round trip
 * (supabase/migrations/20261013100000_movie_screens.sql, `movie_page`). The
 * diary line and the actions read the caller's own rows through `diaryFor`
 * and `getEntry`; this is everything else. Null for an id that is not a film.
 * `gamePage` is the games twin and is unchanged.
 */
export async function moviePage(
  client: Client,
  mediaItemId: string,
  options: MoviePageOptions = {},
): Promise<MoviePage | null> {
  const { data, error } = await client
    .rpc('movie_page', {
      p_media_item_id: mediaItemId,
      p_today: options.today ?? todayLocal(),
      ...(options.region === undefined ? {} : { p_region: regionCode(options.region) }),
    })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const scores: ScoresBySource = {};
  for (const [source, raw] of Object.entries((data.scores ?? {}) as unknown as Record<string, RawScore>)) {
    scores[source] = {
      source,
      score: raw.score === null ? null : Number(raw.score),
      scoreCount: raw.score_count,
      fetchedAt: raw.fetched_at,
    };
  }

  return {
    mediaItemId: data.media_item_id,
    title: data.title,
    year: data.year ?? null,
    releaseDate: data.release_date ?? null,
    coverImageId: data.cover_image_id ?? null,
    externalIds: data.external_ids,
    tmdbId: data.tmdb_id ?? null,
    runtimeMinutes: data.runtime_minutes ?? null,
    genres: data.genres ?? [],
    directors: data.directors ?? [],
    writers: data.writers ?? [],
    topCast: ((data.top_cast ?? []) as unknown as RawCastMember[]).map((member) => ({
      tmdbPersonId: member.tmdb_person_id ?? null,
      name: member.name,
      character: member.character ?? null,
      profilePath: member.profile_path ?? null,
    })),
    studio: data.studio ?? null,
    collectionTmdbId: data.collection_tmdb_id ?? null,
    collectionName: data.collection_name ?? null,
    tagline: data.tagline ?? null,
    overview: data.overview ?? null,
    backdropImageId: data.backdrop_image_id ?? null,
    certification: data.certification ?? null,
    scores,
    awards: data.awards ?? null,
    releaseState: {
      placement: toPlacement(data.placement),
      placementOn: data.placement_on ?? null,
      theatricalOn: data.theatrical_on ?? null,
      digitalOn: data.digital_on ?? null,
      streamsNow: data.streams_now,
    },
    availability: ((data.availability ?? []) as unknown as RawOffer[]).map((offer) => ({
      providerId: offer.provider_id,
      name: offer.name,
      logoImageId: offer.logo_image_id,
      offerType: offer.offer_type,
      mine: offer.mine,
    })),
  };
}

/**
 * Why a Home row is there (decision 28): the watchlist, a genre the caller
 * ranks high, a Loved film, or, only when none of those has anything to say,
 * what is popular.
 */
export type HomeRowKind = 'watchlist' | 'genre' | 'because' | 'popular';

/** One poster in a Home row. */
export interface HomeRowCandidate {
  mediaItemId: string;
  title: string;
  year: number | null;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the candidate to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  runtimeMinutes: number | null;
  genres: string[];
  /** Every service with a subscription, free or ads offer in the region now, in display order. */
  streamsOn: number[];
  /** Those of `streamsOn` the caller has: the poster's service pill. */
  onMyServices: number[];
}

/** One row of movies Home. */
export interface HomeRow {
  kind: HomeRowKind;
  /**
   * The whole title in plain words: "You wanted to watch these", "Horror",
   * "Because you loved Past Lives", "Popular". The genre is the catalog's
   * word for it, as TMDB spells it.
   */
  title: string;
  /**
   * The part of `title` the screen sets in italics (the genre, the film), or
   * null when nothing in the title varies. Always a substring of `title`.
   */
  variablePart: string | null;
  /** The Loved film a `because` row is about; null for the other kinds. */
  aboutMediaItemId: string | null;
  /** One to twelve, best first (the watchlist keeps its newest-first order). */
  candidates: HomeRowCandidate[];
}

export interface MovieHomeRowsOptions extends MovieListOptions {
  /**
   * The region the candidates' services are read in. Omitted, the database
   * uses the caller's `watchRegion` (US when unset), the region the watchlist
   * row's membership is read in, so omit it unless the screen means another.
   */
  region?: string;
}

interface RawCandidate {
  media_item_id: string;
  title: string;
  year: number | null;
  cover_image_id: string | null;
  external_ids: Json;
  runtime_minutes: number | null;
  genres: string[];
  streams_on: number[];
  on_my_services: number[];
}

/**
 * Movies Home's rows by reason, in order
 * (supabase/migrations/20261013100000_movie_screens.sql, `movie_home_rows`):
 * "You wanted to watch these", up to three genres, up to three "Because you
 * loved", seven at most; one "Popular" row when none of them has anything to
 * say, so Home is never empty while the catalog is not.
 */
export async function movieHomeRows(client: Client, options: MovieHomeRowsOptions = {}): Promise<HomeRow[]> {
  const { data, error } = await client.rpc('movie_home_rows', {
    p_today: options.today ?? todayLocal(),
    ...(options.region === undefined ? {} : { p_region: regionCode(options.region) }),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: row.kind as HomeRowKind,
    title: row.title,
    variablePart: row.variable_part ?? null,
    aboutMediaItemId: row.about_media_item_id ?? null,
    candidates: ((row.candidates ?? []) as unknown as RawCandidate[]).map((candidate) => ({
      mediaItemId: candidate.media_item_id,
      title: candidate.title,
      year: candidate.year,
      coverImageId: candidate.cover_image_id,
      externalIds: candidate.external_ids,
      runtimeMinutes: candidate.runtime_minutes,
      genres: candidate.genres,
      streamsOn: candidate.streams_on,
      onMyServices: candidate.on_my_services,
    })),
  }));
}
