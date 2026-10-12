/**
 * TMDB responses to Postgres rows, and the two rules that decide what is
 * carried at all.
 *
 * Deliberately free of every Node import: no `node:*`, no `pg`, nothing but
 * plain TypeScript. The search-miss Edge Function in the roadmap fetches one
 * title on demand and writes it into the same tables, and it runs on Deno, so
 * the mapping has to be shareable as it stands rather than forked. Everything
 * that needs a socket or a file handle lives in `tmdb.ts`, `tmdb-sync.ts` or
 * `db.ts`.
 *
 * Pure in the other sense too: no clock and no network. `now` is passed in, so
 * a whole batch shares one instant and a test is deterministic.
 *
 * The contract for every column name here is docs/design/film-tv-catalog.md.
 */

import type {
  MappedMovie,
  MappedTv,
  MediaCertificationRow,
  MediaReleaseDateRow,
  MovieDetailsRow,
  TmdbAggregateCastMember,
  TmdbCastCredit,
  TmdbCastMember,
  TmdbCountryOffers,
  TmdbExportLine,
  TmdbMediaItemRow,
  TmdbMedium,
  TmdbMovieDetail,
  TmdbScoreInput,
  TmdbTvDetail,
  TmdbWatchProviders,
  TvDetailsRow,
  TvSeasonRow,
  WatchAvailabilityRow,
  WatchProviderRow,
} from './tmdb-types';
import { WATCH_OFFER_TYPES } from './tmdb-types';

/**
 * The popularity a film needs before the mirror will fetch it at all.
 *
 * Measured against the movie export of 2026-09-16 (1,245,173 lines, of which
 * none is flagged adult: TMDB filters those out of the public export itself).
 * Non-adult ids with `video` false at or above each threshold:
 *
 *   >= 1   383,819     >= 8    2,987     >= 30    229
 *   >= 2    78,556     >= 10   1,956     >= 50     85
 *   >= 3    25,156     >= 15     894
 *   >= 5     7,754     >= 20     497
 *
 * The target is about 40,000 films. Three is the nearest of those: 25,156,
 * against 78,556 at a threshold of two. The distribution is steep enough here
 * that no round number lands on 40,000 -- the 40,000th film by popularity sits
 * at 2.53 -- and three is the side to miss on, because a title under the line
 * that anybody actually looks for still enters the mirror the moment a user
 * touches it (ROADMAP V3), while 78,000 films is most of a Supabase free tier
 * spent on records nobody opens.
 *
 * TMDB rescaled `popularity` downwards in 2024, so these numbers mean nothing
 * next to a figure quoted in an older writeup. The whole table is in
 * docs/design/tmdb-setup.md under "Sizing".
 */
export const MOVIE_POPULARITY_THRESHOLD = 3;

/**
 * The same for a series, measured against the TV export of 2026-09-16
 * (231,729 lines, none of which carries an `adult` field at all):
 *
 *   >= 1   130,726     >= 8   12,424     >= 30  1,752
 *   >= 2    74,343     >= 10   9,028     >= 50    742
 *   >= 3    46,603     >= 15   4,966
 *   >= 5    23,764     >= 20   3,284
 *
 * The target is about 15,000 series. Eight is the nearest: 12,424, against
 * 23,764 at five. The 15,000th series by popularity sits at 7.00.
 *
 * Higher than the film threshold on the same scale because the two
 * populations are not comparable: TMDB holds a fifth as many series as films
 * and its popularity figures for them run higher, so the same number would
 * carry three times the intended share of the TV catalogue.
 */
export const TV_POPULARITY_THRESHOLD = 8;

/**
 * How far back "recently released" reaches for the keep rule, in days.
 *
 * Two years, the same window `catalogTrim` uses for games, and for the same
 * reason: a new release has to be searchable before anybody has voted on it.
 * Spelled out here rather than imported from `trim.ts` so this module stays
 * importable by a Deno function with nothing else behind it.
 */
export const TMDB_RECENT_RELEASE_DAYS = 730;

/** The crew jobs that count as a writing credit, in TMDB's own spelling. */
export const WRITER_JOBS: readonly string[] = ['Screenplay', 'Writer', 'Story'];

/** How many cast members a title's `top_cast` carries. */
export const TOP_CAST_SIZE = 10;

/**
 * TMDB's release type for a wide theatrical run, which is the certification a
 * film's header line shows when the region has one.
 */
export const THEATRICAL_RELEASE_TYPE = 3;

/** The lowest and highest `release_type` the column's check accepts. */
export const MIN_RELEASE_TYPE = 1;
export const MAX_RELEASE_TYPE = 6;

/** A trimmed string, or null. Empty strings from TMDB are never stored. */
function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * An image path exactly as TMDB returned it, leading slash included.
 *
 * Verbatim on purpose: a stored value is always precisely what the API said,
 * and the app's URL builder appends it to `https://image.tmdb.org/t/p/{size}`.
 * Trimming the slash here would mean every reader had to know whether it was
 * there, which is the sort of thing that is wrong in exactly one place.
 */
function imagePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return value.length > 0 ? value : null;
}

/** The date part of a TMDB date or instant, as `YYYY-MM-DD`. */
function datePart(value: string | null | undefined): string | null {
  const trimmed = text(value);
  if (trimmed === null) return null;
  const candidate = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

/**
 * The year of a `YYYY-MM-DD`, read in UTC.
 *
 * From the string rather than through a `Date`, so the answer cannot depend on
 * the machine's time zone: a film released on the first of January must not
 * become the previous year on a laptop in New York.
 */
function yearOf(date: string | null): number | null {
  if (date === null) return null;
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

/** A whole number at or above zero, or null. TMDB sends 0 for "no runtime". */
function positiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const whole = Math.trunc(value);
  return whole > 0 ? whole : null;
}

/** A whole number at or above zero, or null. Zero is a real episode count. */
function wholeNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

/** Names of a `{ name }` list, skipping the nameless and repeating none. */
function namesOf(items: Array<{ name?: string }> | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items ?? []) {
    const name = text(item.name);
    if (name === null || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * The oldest release date the keep rule still counts as recent, as
 * `YYYY-MM-DD` in UTC.
 *
 * Exported so a caller can say what the window currently reaches back to
 * without re-deriving the arithmetic.
 */
export function recentReleaseCutoff(now: Date): string {
  const cutoff = new Date(now.getTime() - TMDB_RECENT_RELEASE_DAYS * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * True when a date is inside the recent window or still in the future.
 *
 * Both halves matter. "In the future" is what makes an announced film
 * searchable the day TMDB gets a date for it, and the 730-day window is what
 * keeps a release from falling out of the mirror the week after it comes out
 * and before anybody has voted. One comparison covers both, because a date
 * ahead of today is trivially at or after a cutoff two years behind it.
 *
 * A string comparison rather than date arithmetic, which is exact rather than
 * merely close: `YYYY-MM-DD` sorts chronologically as text, TMDB's dates carry
 * no time of day, and comparing instants would make a title released exactly
 * 730 days ago fall in or out depending on the hour the job happened to run.
 */
function releasedRecentlyOrAhead(date: string | null, now: Date): boolean {
  if (date === null) return false;
  return date >= recentReleaseCutoff(now);
}

/**
 * Whether an id from the daily export is worth fetching.
 *
 * The discovery half of the scope rule (film-tv-catalog.md, "Scope"): not
 * adult, and popular enough for this medium. A line with no `adult` field at
 * all counts as not adult, which is the normal case for series -- the TV
 * export carries no such field, and TMDB keeps adult titles out of the public
 * export either way.
 *
 * Films additionally have to be films. `video: true` marks a record that is a
 * trailer, a concert recording or a making-of filed under the movie endpoint,
 * and the sizing above was measured over `video: false` rows, so the two have
 * to agree or the mirror would hold about 340 more records than the table
 * says at a threshold of three. The design doc names the field without
 * spending the rule on it; this is that rule.
 *
 * Ids the catalog already holds bypass this entirely and are refreshed
 * whatever their popularity today, which is the caller's job rather than
 * this predicate's: a title a user has ranked must not fall out of the mirror
 * because it stopped trending.
 */
export function isDiscoverable(line: TmdbExportLine, kind: TmdbMedium): boolean {
  if (line.adult === true) return false;
  if (kind === 'movie' && line.video === true) return false;

  const popularity = typeof line.popularity === 'number' ? line.popularity : 0;
  const threshold = kind === 'movie' ? MOVIE_POPULARITY_THRESHOLD : TV_POPULARITY_THRESHOLD;
  return popularity >= threshold;
}

/**
 * Whether a fetched film is written at all.
 *
 * The keep half of the scope rule, and the film analog of `catalogTrim`'s:
 * not adult; a poster, because a catalog row with no art is not showable; a
 * title; and either a vote or a release inside the recent window. A film that
 * stops matching is never deleted -- somebody may have ranked it -- so this
 * only ever decides whether a row is written, never whether one survives.
 */
export function keepMovie(detail: TmdbMovieDetail, now: Date): boolean {
  if (detail.adult === true) return false;
  if (imagePath(detail.poster_path) === null) return false;
  if (text(detail.title) === null) return false;

  const voted = (detail.vote_count ?? 0) >= 1;
  return voted || releasedRecentlyOrAhead(datePart(detail.release_date), now);
}

/** The same rule for a series, over `name` and `first_air_date`. */
export function keepTv(detail: TmdbTvDetail, now: Date): boolean {
  if (detail.adult === true) return false;
  if (imagePath(detail.poster_path) === null) return false;
  if (text(detail.name) === null) return false;

  const voted = (detail.vote_count ?? 0) >= 1;
  return voted || releasedRecentlyOrAhead(datePart(detail.first_air_date), now);
}

/**
 * The `tmdb` score row, or null.
 *
 * `vote_average` times ten, so every source in `external_scores` shares the
 * 0-100 scale the app divides back down (`igdb_*`, `steam`, `metacritic` and
 * `opencritic` all do). Written only when at least one person has voted:
 * TMDB answers 0 for a film nobody has rated, and a zero in that column would
 * read as "everybody hated it" rather than "nobody has said".
 */
export function mapTmdbScore(
  voteAverage: number | undefined,
  voteCount: number | undefined,
): TmdbScoreInput | null {
  const count = wholeNumber(voteCount);
  if (count === null || count < 1) return null;

  const average = typeof voteAverage === 'number' && Number.isFinite(voteAverage) ? voteAverage : 0;
  const score = Math.round(average * 10 * 100) / 100;
  if (score < 0 || score > 100) return null;

  return { source: 'tmdb', score, score_count: count };
}

/** The external ids a title carries, with the empty strings dropped. */
function externalIds(
  tmdbId: number,
  ids: { imdb?: string | null; wikidata?: string | null; tvdb?: number | null },
): Record<string, number | string> {
  const out: Record<string, number | string> = { tmdb: tmdbId };
  const imdb = text(ids.imdb);
  if (imdb !== null) out.imdb = imdb;
  const wikidata = text(ids.wikidata);
  if (wikidata !== null) out.wikidata = wikidata;
  if (typeof ids.tvdb === 'number' && Number.isInteger(ids.tvdb)) out.tvdb = ids.tvdb;
  return out;
}

/** The first ten cast members of a film, by TMDB's billing order. */
function movieTopCast(cast: TmdbCastMember[] | undefined): TmdbCastCredit[] {
  return [...(cast ?? [])]
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .flatMap((member) => {
      const name = text(member.name) ?? text(member.original_name);
      if (name === null) return [];
      return [
        {
          tmdb_person_id: wholeNumber(member.id),
          name,
          character: text(member.character),
          profile_path: imagePath(member.profile_path),
        },
      ];
    })
    .slice(0, TOP_CAST_SIZE);
}

/**
 * The first ten cast members of a series, in the order the aggregate returns.
 *
 * Response order rather than a sort, because `aggregate_credits` is already
 * ordered by episodes across the whole run, which is exactly what "top cast"
 * means for a show. `character` comes from the first role: a cast member with
 * several is somebody recast or playing twins, and TMDB lists the biggest
 * first.
 */
function tvTopCast(cast: TmdbAggregateCastMember[] | undefined): TmdbCastCredit[] {
  return (cast ?? [])
    .flatMap((member) => {
      const name = text(member.name) ?? text(member.original_name);
      if (name === null) return [];
      return [
        {
          tmdb_person_id: wholeNumber(member.id),
          name,
          character: text(member.roles?.[0]?.character),
          profile_path: imagePath(member.profile_path),
          episode_count: wholeNumber(member.total_episode_count),
        },
      ];
    })
    .slice(0, TOP_CAST_SIZE);
}

/** Crew names for one job, in response order, each named once. */
function crewNames(
  crew: Array<{ name?: string; job?: string }> | undefined,
  jobs: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const member of crew ?? []) {
    const job = text(member.job);
    if (job === null || !jobs.includes(job)) continue;
    const name = text(member.name);
    if (name === null || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** The watch providers block, under whichever of the two keys carries it. */
function watchProviders(
  detail: { 'watch/providers'?: TmdbWatchProviders; watch_providers?: TmdbWatchProviders },
): TmdbWatchProviders | undefined {
  return detail['watch/providers'] ?? detail.watch_providers;
}

/**
 * A region's offers turned into availability rows and the provider stubs they
 * need.
 *
 * Every provider a title mentions is stubbed, whether or not the directory
 * knows it, because the directory is a relay that lags (film-tv-catalog.md,
 * `watch_providers`) and a missing row would fail the foreign key rather than
 * lose one offer. The store inserts the stubs before the offers and leaves a
 * directory row that already exists alone.
 *
 * Offers are de-duplicated on `(region, provider_id, offer_type)`: the same
 * provider can appear twice in one array when JustWatch lists two editions,
 * and the primary key would refuse the second copy in the same statement.
 */
function mapRegionOffers(
  region: string,
  offers: TmdbCountryOffers | undefined,
): { availability: WatchAvailabilityRow[]; stubs: WatchProviderRow[] } {
  const availability: WatchAvailabilityRow[] = [];
  const stubs = new Map<number, WatchProviderRow>();
  const seen = new Set<string>();

  for (const offerType of WATCH_OFFER_TYPES) {
    for (const provider of offers?.[offerType] ?? []) {
      const providerId = wholeNumber(provider.provider_id);
      if (providerId === null || providerId <= 0) continue;

      const key = `${region} ${providerId} ${offerType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      availability.push({ region, provider_id: providerId, offer_type: offerType });

      if (!stubs.has(providerId)) {
        stubs.set(providerId, {
          provider_id: providerId,
          name: text(provider.provider_name) ?? `TMDB provider ${providerId}`,
          logo_image_id: imagePath(provider.logo_path),
          // Empty rather than the title's own `display_priority`, which is one
          // region's number and would read as the whole map. The directory
          // pass owns that column.
          display_priorities: {},
        });
      }
    }
  }

  return { availability, stubs: [...stubs.values()] };
}

/** Availability and stubs across every region the run asked about. */
function mapAvailability(
  providers: TmdbWatchProviders | undefined,
  regions: readonly string[],
): { availability: WatchAvailabilityRow[]; providerStubs: WatchProviderRow[] } {
  const availability: WatchAvailabilityRow[] = [];
  const stubs = new Map<number, WatchProviderRow>();

  for (const region of regions) {
    const mapped = mapRegionOffers(region, providers?.results?.[region]);
    availability.push(...mapped.availability);
    for (const stub of mapped.stubs) if (!stubs.has(stub.provider_id)) stubs.set(stub.provider_id, stub);
  }

  return { availability, providerStubs: [...stubs.values()] };
}

/**
 * Every dated release of a film in the regions the run asked about.
 *
 * `release_date` here is a full instant, not a plain date, so only the date
 * part is kept. A row with no usable date is dropped rather than stored with a
 * null, because `released_on` is part of the primary key.
 */
function mapReleaseDates(
  detail: TmdbMovieDetail,
  regions: readonly string[],
): MediaReleaseDateRow[] {
  const wanted = new Set(regions);
  const rows: MediaReleaseDateRow[] = [];
  const seen = new Set<string>();

  for (const result of detail.release_dates?.results ?? []) {
    const region = text(result.iso_3166_1);
    if (region === null || !wanted.has(region)) continue;

    for (const entry of result.release_dates ?? []) {
      const releaseType = wholeNumber(entry.type);
      const releasedOn = datePart(entry.release_date);
      if (releasedOn === null) continue;
      if (releaseType === null || releaseType < MIN_RELEASE_TYPE || releaseType > MAX_RELEASE_TYPE) {
        continue;
      }

      // The primary key is (title, region, type, date) and TMDB really does
      // repeat one. Fight Club's Swiss theatrical run is listed once per
      // language; a US premiere is listed once per festival, and a wide run
      // once for the standard prints and once for IMAX. The repeats differ
      // only in `note` and `iso_639_1`, so first-in-response-order wins and
      // the rest are dropped here rather than aborting the title's whole
      // transaction on a duplicate key.
      const key = `${region} ${releaseType} ${releasedOn}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        region,
        release_type: releaseType,
        released_on: releasedOn,
        certification: text(entry.certification),
        note: text(entry.note),
      });
    }
  }

  return rows;
}

/**
 * One certification per region for a film.
 *
 * Theatrical first, then the first non-empty certification the region lists in
 * response order. A single film can carry an R for its US theatrical run and
 * something else for the same country's TV release (research 8), and the
 * header line shows one string, so the rule has to pick rather than collect.
 * A region whose every entry is blank produces no row at all, which is how
 * "this country does not rate it" is stored.
 */
function mapMovieCertifications(
  detail: TmdbMovieDetail,
  regions: readonly string[],
): MediaCertificationRow[] {
  const wanted = new Set(regions);
  const rows: MediaCertificationRow[] = [];

  for (const result of detail.release_dates?.results ?? []) {
    const region = text(result.iso_3166_1);
    if (region === null || !wanted.has(region)) continue;

    const entries = result.release_dates ?? [];
    const theatrical = entries.find(
      (entry) => entry.type === THEATRICAL_RELEASE_TYPE && text(entry.certification) !== null,
    );
    const fallback = entries.find((entry) => text(entry.certification) !== null);
    const certification = text(theatrical?.certification) ?? text(fallback?.certification);

    if (certification !== null) rows.push({ region, certification });
  }

  return rows;
}

/** The same for a series, from `content_ratings`, which has one per region. */
function mapTvCertifications(detail: TmdbTvDetail, regions: readonly string[]): MediaCertificationRow[] {
  const wanted = new Set(regions);
  const rows: MediaCertificationRow[] = [];
  const seen = new Set<string>();

  for (const entry of detail.content_ratings?.results ?? []) {
    const region = text(entry.iso_3166_1);
    const certification = text(entry.rating);
    if (region === null || certification === null || !wanted.has(region) || seen.has(region)) {
      continue;
    }
    seen.add(region);
    rows.push({ region, certification });
  }

  return rows;
}

/** Every season TMDB lists, season 0 included. Replaced whole on each refresh. */
function mapSeasons(detail: TmdbTvDetail): TvSeasonRow[] {
  const rows: TvSeasonRow[] = [];
  const seen = new Set<number>();

  for (const season of detail.seasons ?? []) {
    const seasonNumber = wholeNumber(season.season_number);
    // The primary key is (title, season_number), so a number that is missing
    // or repeated has nowhere to go.
    if (seasonNumber === null || seasonNumber < 0 || seen.has(seasonNumber)) continue;
    seen.add(seasonNumber);

    rows.push({
      season_number: seasonNumber,
      tmdb_season_id: wholeNumber(season.id),
      name: text(season.name),
      episode_count: wholeNumber(season.episode_count),
      air_date: datePart(season.air_date),
      poster_image_id: imagePath(season.poster_path),
      overview: text(season.overview),
    });
  }

  return rows.sort((a, b) => a.season_number - b.season_number);
}

/**
 * One film, mapped onto every row it becomes.
 *
 * Returns null for a film with no title, which `media_items.title` could not
 * store anyway. The keep rule is the caller's, not this function's: mapping a
 * title it will then discard costs nothing and keeps the two decisions where a
 * reader can see them separately.
 */
export function mapMovie(
  detail: TmdbMovieDetail,
  now: Date,
  regions: readonly string[],
): MappedMovie | null {
  const title = text(detail.title);
  if (title === null) return null;

  const releaseDate = datePart(detail.release_date);
  const refreshedAt = now.toISOString();

  const mediaItem: TmdbMediaItemRow = {
    medium: 'movie',
    title,
    year: yearOf(releaseDate),
    release_date: releaseDate,
    cover_image_id: imagePath(detail.poster_path),
    external_ids: externalIds(detail.id, {
      imdb: detail.external_ids?.imdb_id ?? detail.imdb_id,
      wikidata: detail.external_ids?.wikidata_id,
    }),
    metadata: {
      popularity: typeof detail.popularity === 'number' ? detail.popularity : null,
      vote_average: typeof detail.vote_average === 'number' ? detail.vote_average : null,
      vote_count: wholeNumber(detail.vote_count),
      backdrop_path: imagePath(detail.backdrop_path),
      original_title: text(detail.original_title),
      original_language: text(detail.original_language),
      adult: detail.adult ?? false,
      tmdb_status: text(detail.status),
    },
    refreshed_at: refreshedAt,
  };

  const collection = detail.belongs_to_collection ?? null;

  const details: MovieDetailsRow = {
    tmdb_id: detail.id,
    runtime_minutes: positiveInteger(detail.runtime),
    genres: namesOf(detail.genres),
    directors: crewNames(detail.credits?.crew, ['Director']),
    writers: crewNames(detail.credits?.crew, WRITER_JOBS),
    top_cast: movieTopCast(detail.credits?.cast),
    studio: text(detail.production_companies?.[0]?.name),
    collection_tmdb_id: collection ? wholeNumber(collection.id) : null,
    collection_name: collection ? text(collection.name) : null,
    tagline: text(detail.tagline),
    overview: text(detail.overview),
    backdrop_image_id: imagePath(detail.backdrop_path),
  };

  const { availability, providerStubs } = mapAvailability(watchProviders(detail), regions);

  return {
    mediaItem,
    details,
    score: mapTmdbScore(detail.vote_average, detail.vote_count),
    releaseDates: mapReleaseDates(detail, regions),
    certifications: mapMovieCertifications(detail, regions),
    availability,
    providerStubs,
    regions: [...regions],
  };
}

/**
 * One series, mapped onto every row it becomes.
 *
 * The `next_episode_*` columns are all null together when
 * `next_episode_to_air` is null: "no date announced" on a show page is
 * `status = 'Returning Series'` with a null next date, and half a stale
 * episode stub would say something else entirely.
 */
export function mapTv(
  detail: TmdbTvDetail,
  now: Date,
  regions: readonly string[],
): MappedTv | null {
  const title = text(detail.name);
  if (title === null) return null;

  const firstAirDate = datePart(detail.first_air_date);
  const refreshedAt = now.toISOString();
  const next = detail.next_episode_to_air ?? null;
  const last = detail.last_episode_to_air ?? null;

  const mediaItem: TmdbMediaItemRow = {
    medium: 'tv',
    title,
    year: yearOf(firstAirDate),
    release_date: firstAirDate,
    cover_image_id: imagePath(detail.poster_path),
    external_ids: externalIds(detail.id, {
      imdb: detail.external_ids?.imdb_id,
      wikidata: detail.external_ids?.wikidata_id,
      tvdb: detail.external_ids?.tvdb_id,
    }),
    metadata: {
      popularity: typeof detail.popularity === 'number' ? detail.popularity : null,
      vote_average: typeof detail.vote_average === 'number' ? detail.vote_average : null,
      vote_count: wholeNumber(detail.vote_count),
      backdrop_path: imagePath(detail.backdrop_path),
      // `original_name` under the same key a film's `original_title` uses, so
      // a reader of `metadata` does not have to branch on medium for it.
      original_title: text(detail.original_name),
      original_language: text(detail.original_language),
      adult: detail.adult ?? false,
      tmdb_status: text(detail.status),
      tmdb_type: text(detail.type),
    },
    refreshed_at: refreshedAt,
  };

  const details: TvDetailsRow = {
    tmdb_id: detail.id,
    status: text(detail.status),
    show_type: text(detail.type),
    in_production: typeof detail.in_production === 'boolean' ? detail.in_production : null,
    first_air_date: firstAirDate,
    last_air_date: datePart(detail.last_air_date),
    networks: namesOf(detail.networks),
    creators: namesOf(detail.created_by),
    genres: namesOf(detail.genres),
    origin_country: (detail.origin_country ?? []).flatMap((code) => {
      const trimmed = text(code);
      return trimmed === null ? [] : [trimmed];
    }),
    season_count: wholeNumber(detail.number_of_seasons),
    episode_count: wholeNumber(detail.number_of_episodes),
    episode_runtime_minutes: positiveInteger(detail.episode_run_time?.[0]),
    next_episode_air_date: next ? datePart(next.air_date) : null,
    next_episode_season: next ? wholeNumber(next.season_number) : null,
    next_episode_number: next ? wholeNumber(next.episode_number) : null,
    next_episode_name: next ? text(next.name) : null,
    last_episode_air_date: last ? datePart(last.air_date) : null,
    last_episode_season: last ? wholeNumber(last.season_number) : null,
    last_episode_number: last ? wholeNumber(last.episode_number) : null,
    top_cast: tvTopCast(detail.aggregate_credits?.cast),
    overview: text(detail.overview),
    backdrop_image_id: imagePath(detail.backdrop_path),
  };

  const { availability, providerStubs } = mapAvailability(watchProviders(detail), regions);

  return {
    mediaItem,
    details,
    score: mapTmdbScore(detail.vote_average, detail.vote_count),
    seasons: mapSeasons(detail),
    certifications: mapTvCertifications(detail, regions),
    availability,
    providerStubs,
    regions: [...regions],
  };
}

/**
 * The provider directory as `watch_providers` rows.
 *
 * `display_priorities` is stored whole, region to integer, because it is the
 * ordering the app needs in whatever market a user is in; the top-level
 * `display_priority` is one region's number in disguise and is not stored.
 */
export function mapProviderDirectory(
  entries: Array<{
    provider_id?: number;
    provider_name?: string;
    logo_path?: string | null;
    display_priorities?: Record<string, number>;
  }>,
): WatchProviderRow[] {
  const byId = new Map<number, WatchProviderRow>();

  for (const entry of entries) {
    const providerId = wholeNumber(entry.provider_id);
    const name = text(entry.provider_name);
    if (providerId === null || providerId <= 0 || name === null) continue;

    const priorities: Record<string, number> = {};
    for (const [region, priority] of Object.entries(entry.display_priorities ?? {})) {
      const value = wholeNumber(priority);
      if (value !== null) priorities[region] = value;
    }

    // Last one wins, and the two directories overlap heavily: a provider that
    // carries both films and series is in both responses with the same id.
    byId.set(providerId, {
      provider_id: providerId,
      name,
      logo_image_id: imagePath(entry.logo_path),
      display_priorities: priorities,
    });
  }

  return [...byId.values()];
}
