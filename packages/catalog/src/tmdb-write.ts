/**
 * The TMDB mirror's writes: one statement per table for a whole batch of
 * mapped titles, in the order docs/design/film-tv-catalog.md's "Writes" sets
 * out.
 *
 * Moved out of `db.ts` on 2026-10-13 (VER-158) so the search-miss Edge
 * Function (`supabase/functions/tmdb-lookup`) writes a film it fetched on
 * demand through exactly the statements the nightly `tmdb-sync` uses, rather
 * than a copy that drifts. The same rule as `tmdb-map.ts` therefore holds
 * here: no Node import, no `pg`, nothing but plain TypeScript, and relative
 * imports spelled with their `.ts` so Deno can follow them. Every function
 * takes a {@link SqlClient}, the one method of a `pg` client these statements
 * use; `db.ts` passes its pooled `pg` client, and the Edge Function passes an
 * adapter over its own Postgres connection.
 *
 * None of these opens or closes a transaction. The caller does, around a whole
 * batch, so a batch lands whole or not at all.
 */

import type {
  ExternalScoreRow,
} from './types.ts';
import type {
  MappedMovie,
  MappedTv,
  TmdbMedium,
  TmdbUpsertCounts,
  WatchProviderRow,
} from './tmdb-types.ts';

/** The one result shape these statements read: the rows, and how many were touched. */
export interface SqlResult {
  rows: unknown[];
  rowCount: number | null;
}

/**
 * The part of a Postgres client the TMDB writes need: one parameterised
 * statement at a time, `$1`-style placeholders, the values as `pg` takes them
 * (strings for jsonb, JavaScript arrays for `uuid[]` and `text[]`).
 */
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<SqlResult>;
}

/** The per-medium extension table a TMDB title's identity lives in. */
export function detailsTable(kind: TmdbMedium): string {
  return kind === 'movie' ? 'public.movie_details' : 'public.tv_details';
}

/**
 * De-duplicate mapped titles by TMDB id, last one wins.
 *
 * The same guard `dedupeByIgdbId` is, for the same reason: a batch that wrote
 * one title twice would hit "cannot affect row a second time" on the details
 * upsert, and the changes feed and the day's export really can both name an
 * id in one run.
 */
export function dedupeByTmdbId<T extends { details: { tmdb_id: number } }>(rows: T[]): T[] {
  const byId = new Map<number, T>();
  for (const row of rows) byId.set(row.details.tmdb_id, row);
  return [...byId.values()];
}

export function emptyTmdbCounts(): TmdbUpsertCounts {
  return {
    mediaItems: 0,
    details: 0,
    scores: 0,
    seasons: 0,
    releaseDates: 0,
    certifications: 0,
    providerStubs: 0,
    availabilityWritten: 0,
    availabilityClosed: 0,
  };
}

/**
 * Make sure every provider this title's offers name exists, before they do.
 *
 * `do nothing` rather than `do update`, which is the difference between this
 * and {@link CatalogStore.upsertWatchProviders}: the directory pass owns these
 * rows, and a stub built from one title's `provider_name` and `logo_path`
 * knows nothing about `display_priorities`. The stub exists so the foreign key
 * holds when the relay lags, and it is corrected on the next night's directory
 * refresh.
 */
export async function insertProviderStubs(
  client: SqlClient,
  rows: WatchProviderRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const result = await client.query(
    `insert into public.watch_providers
       (provider_id, name, logo_image_id, display_priorities)
     select r.provider_id, r.name, r.logo_image_id, r.display_priorities
       from jsonb_to_recordset($1::jsonb) as r(
              provider_id integer,
              name text,
              logo_image_id text,
              display_priorities jsonb
            )
     on conflict (provider_id) do nothing`,
    [JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
}

// --- The TMDB mirror's batch statements -------------------------------------
//
// What the sync writes through (VER-163, 2026-10-12). The first cloud run of
// the full pull wrote about 100 films a minute, because the per-title path
// below pays eight to ten round trips per title through the Supavisor pooler,
// each worth tens of milliseconds, and hit the job's two-hour timeout with the
// films unfinished. These statements do the same writes one table at a time
// for a whole batch: a {@link BATCH_SIZE} batch is at most ten statements plus
// `begin` and `commit`, however many titles, offers, dates or seasons it
// carries. Every statement expands the batch with `jsonb_to_recordset` (or two
// parallel arrays through `unnest`), the way the games mirror's `upsertBatch`
// does, and every conflict clause is the one the per-title statement used, so
// the rows that end up in the tables are the same.

/** One title of a batch, with the `media_items` uuid its rows hang off. */
export interface PlacedTitle<T> {
  id: string;
  title: T;
}

/** The fields every mapped title shares, whatever its medium. */
export type MappedTitle = MappedMovie | MappedTv;

/**
 * Insert or update a whole batch's `media_items` rows, and hand back each
 * title's uuid in the batch's order.
 *
 * The same identity rule as {@link upsertTmdbMediaItem}, for many titles in
 * one statement: the `existing` CTE left-joins the incoming rows to the
 * details table on `tmdb_id`, the rows that matched are updated by uuid, and
 * the rows that did not are inserted. No conflict target is involved, which is
 * why this works without a unique index on `media_items` that means "this
 * TMDB film". `external_ids` and `metadata` are merged with `||` exactly as
 * the per-title statement merges them.
 *
 * The update branch hands back the incoming `tmdb_id`; the insert branch can
 * only return the row it inserted, so it reads the id back out of the
 * `external_ids` it just wrote, which always carries the `tmdb` key. A title
 * the statement returns no uuid for is an error rather than a silent skip,
 * the same as the per-title path.
 */
async function upsertTmdbMediaItems<T extends MappedTitle>(
  client: SqlClient,
  medium: TmdbMedium,
  batch: T[],
): Promise<Array<PlacedTitle<T>>> {
  const rows = batch.map((entry) => ({
    tmdb_id: entry.details.tmdb_id,
    title: entry.mediaItem.title,
    year: entry.mediaItem.year,
    release_date: entry.mediaItem.release_date,
    cover_image_id: entry.mediaItem.cover_image_id,
    external_ids: entry.mediaItem.external_ids,
    metadata: entry.mediaItem.metadata,
    refreshed_at: entry.mediaItem.refreshed_at,
  }));

  const result = await client.query(
    `with incoming as (
       select r.tmdb_id, r.title, r.year, r.release_date, r.cover_image_id,
              r.external_ids, r.metadata, r.refreshed_at
         from jsonb_to_recordset($1::jsonb) as r(
                tmdb_id integer,
                title text,
                year smallint,
                release_date date,
                cover_image_id text,
                external_ids jsonb,
                metadata jsonb,
                refreshed_at timestamptz
              )
     ),
     existing as (
       select i.*, d.media_item_id as id
         from incoming i
         left join ${detailsTable(medium)} d on d.tmdb_id = i.tmdb_id
     ),
     updated as (
       update public.media_items m
          set title = e.title,
              year = e.year,
              release_date = e.release_date,
              cover_image_id = e.cover_image_id,
              external_ids = m.external_ids || e.external_ids,
              metadata = m.metadata || e.metadata,
              refreshed_at = e.refreshed_at
         from existing e
        where m.id = e.id
       returning m.id, e.tmdb_id
     ),
     inserted as (
       insert into public.media_items
         (medium, title, year, release_date, cover_image_id, external_ids, metadata, refreshed_at)
       select '${medium}'::public.medium, e.title, e.year, e.release_date, e.cover_image_id,
              e.external_ids, e.metadata, e.refreshed_at
         from existing e
        where e.id is null
       returning id, (external_ids->>'tmdb')::integer as tmdb_id
     )
     select id, tmdb_id from updated union all select id, tmdb_id from inserted`,
    [JSON.stringify(rows)],
  );

  const idByTmdbId = new Map<number, string>();
  for (const row of result.rows as Array<{ id: string; tmdb_id: number | string }>) {
    idByTmdbId.set(Number(row.tmdb_id), row.id);
  }

  return batch.map((entry) => {
    const id = idByTmdbId.get(entry.details.tmdb_id);
    if (!id) throw new Error(`media_items upsert returned no id for tmdb ${entry.details.tmdb_id}`);
    return { id, title: entry };
  });
}

/** Upsert a batch's `movie_details` rows on `tmdb_id`, as the per-title statement does. */
async function upsertMovieDetailsBatch(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedMovie>>,
): Promise<number> {
  const rows = placed.map(({ id, title }) => ({ media_item_id: id, ...title.details }));
  await client.query(
    `insert into public.movie_details
       (media_item_id, tmdb_id, runtime_minutes, genres, directors, writers,
        top_cast, studio, collection_tmdb_id, collection_name, tagline,
        overview, backdrop_image_id)
     select r.media_item_id, r.tmdb_id, r.runtime_minutes, r.genres, r.directors, r.writers,
            r.top_cast, r.studio, r.collection_tmdb_id, r.collection_name, r.tagline,
            r.overview, r.backdrop_image_id
       from jsonb_to_recordset($1::jsonb) as r(
              media_item_id uuid,
              tmdb_id integer,
              runtime_minutes integer,
              genres text[],
              directors text[],
              writers text[],
              top_cast jsonb,
              studio text,
              collection_tmdb_id integer,
              collection_name text,
              tagline text,
              overview text,
              backdrop_image_id text
            )
     on conflict (tmdb_id) do update
       set media_item_id = excluded.media_item_id,
           runtime_minutes = excluded.runtime_minutes,
           genres = excluded.genres,
           directors = excluded.directors,
           writers = excluded.writers,
           top_cast = excluded.top_cast,
           studio = excluded.studio,
           collection_tmdb_id = excluded.collection_tmdb_id,
           collection_name = excluded.collection_name,
           tagline = excluded.tagline,
           overview = excluded.overview,
           backdrop_image_id = excluded.backdrop_image_id`,
    [JSON.stringify(rows)],
  );
  return rows.length;
}

/** Upsert a batch's `tv_details` rows on `tmdb_id`, as the per-title statement does. */
async function upsertTvDetailsBatch(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedTv>>,
): Promise<number> {
  const rows = placed.map(({ id, title }) => ({ media_item_id: id, ...title.details }));
  await client.query(
    `insert into public.tv_details
       (media_item_id, tmdb_id, status, show_type, in_production, first_air_date,
        last_air_date, networks, creators, genres, origin_country, season_count,
        episode_count, episode_runtime_minutes, next_episode_air_date,
        next_episode_season, next_episode_number, next_episode_name,
        last_episode_air_date, last_episode_season, last_episode_number,
        top_cast, overview, backdrop_image_id)
     select r.media_item_id, r.tmdb_id, r.status, r.show_type, r.in_production, r.first_air_date,
            r.last_air_date, r.networks, r.creators, r.genres, r.origin_country, r.season_count,
            r.episode_count, r.episode_runtime_minutes, r.next_episode_air_date,
            r.next_episode_season, r.next_episode_number, r.next_episode_name,
            r.last_episode_air_date, r.last_episode_season, r.last_episode_number,
            r.top_cast, r.overview, r.backdrop_image_id
       from jsonb_to_recordset($1::jsonb) as r(
              media_item_id uuid,
              tmdb_id integer,
              status text,
              show_type text,
              in_production boolean,
              first_air_date date,
              last_air_date date,
              networks text[],
              creators text[],
              genres text[],
              origin_country text[],
              season_count integer,
              episode_count integer,
              episode_runtime_minutes integer,
              next_episode_air_date date,
              next_episode_season integer,
              next_episode_number integer,
              next_episode_name text,
              last_episode_air_date date,
              last_episode_season integer,
              last_episode_number integer,
              top_cast jsonb,
              overview text,
              backdrop_image_id text
            )
     on conflict (tmdb_id) do update
       set media_item_id = excluded.media_item_id,
           status = excluded.status,
           show_type = excluded.show_type,
           in_production = excluded.in_production,
           first_air_date = excluded.first_air_date,
           last_air_date = excluded.last_air_date,
           networks = excluded.networks,
           creators = excluded.creators,
           genres = excluded.genres,
           origin_country = excluded.origin_country,
           season_count = excluded.season_count,
           episode_count = excluded.episode_count,
           episode_runtime_minutes = excluded.episode_runtime_minutes,
           next_episode_air_date = excluded.next_episode_air_date,
           next_episode_season = excluded.next_episode_season,
           next_episode_number = excluded.next_episode_number,
           next_episode_name = excluded.next_episode_name,
           last_episode_air_date = excluded.last_episode_air_date,
           last_episode_season = excluded.last_episode_season,
           last_episode_number = excluded.last_episode_number,
           top_cast = excluded.top_cast,
           overview = excluded.overview,
           backdrop_image_id = excluded.backdrop_image_id`,
    [JSON.stringify(rows)],
  );
  return rows.length;
}

/**
 * The batch's `tmdb` scores, through the games mirror's own `external_scores`
 * upsert, whose conflict clause is the one the per-title statement spells out.
 * Titles nobody has voted on contribute no row, as before.
 */
async function upsertTmdbScoresBatch(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedTitle>>,
): Promise<number> {
  const rows: ExternalScoreRow[] = placed.flatMap(({ id, title }) =>
    title.score ? [{ media_item_id: id, ...title.score }] : [],
  );
  if (rows.length === 0) return 0;

  // The statement `insertScores` in db.ts sends for every other source,
  // spelled out here so this module needs nothing from db.ts. The batch is
  // already one title per TMDB id, so it carries one `tmdb` row per uuid and
  // needs none of `dedupeScores`' de-duplication.
  const result = await client.query(
    `insert into public.external_scores (media_item_id, source, score, score_count, fetched_at)
     select r.media_item_id, r.source, r.score, r.score_count, now()
       from jsonb_to_recordset($1::jsonb) as r(
              media_item_id uuid,
              source text,
              score numeric(5, 2),
              score_count integer
            )
     on conflict (media_item_id, source) do update
       set score = excluded.score,
           score_count = excluded.score_count,
           fetched_at = excluded.fetched_at`,
    [JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
}

/**
 * Every (title, region) pair the batch asked about, as two parallel arrays
 * for `unnest($1::uuid[], $2::text[])`.
 *
 * What keeps each replacement and the availability close-out scoped exactly as
 * the per-title statements scoped them: to a title and the regions its own
 * mapping asked about, never to every region of every title in the batch.
 */
function regionPairs(placed: Array<PlacedTitle<MappedTitle>>): {
  ids: string[];
  regions: string[];
} {
  const ids: string[] = [];
  const regions: string[] = [];
  for (const { id, title } of placed) {
    for (const region of title.regions) {
      ids.push(id);
      regions.push(region);
    }
  }
  return { ids, regions };
}

/** The delete half of a region-scoped replacement, for every title of the batch at once. */
async function deleteForRegionPairs(
  client: SqlClient,
  table: 'public.media_release_dates' | 'public.media_certifications',
  pairs: { ids: string[]; regions: string[] },
): Promise<void> {
  if (pairs.ids.length === 0) return;
  await client.query(
    `delete from ${table} t
      using unnest($1::uuid[], $2::text[]) as s(media_item_id, region)
      where t.media_item_id = s.media_item_id
        and t.region = s.region`,
    [pairs.ids, pairs.regions],
  );
}

/** Replace a batch's release dates, scoped to each title's regions. */
async function replaceReleaseDatesBatch(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedMovie>>,
): Promise<number> {
  await deleteForRegionPairs(client, 'public.media_release_dates', regionPairs(placed));

  const rows = placed.flatMap(({ id, title }) =>
    title.releaseDates.map((row) => ({ media_item_id: id, ...row })),
  );
  if (rows.length === 0) return 0;

  const result = await client.query(
    `insert into public.media_release_dates
       (media_item_id, region, release_type, released_on, certification, note)
     select r.media_item_id, r.region, r.release_type, r.released_on, r.certification, r.note
       from jsonb_to_recordset($1::jsonb) as r(
              media_item_id uuid,
              region text,
              release_type smallint,
              released_on date,
              certification text,
              note text
            )`,
    [JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
}

/** Replace a batch's whole season lists. Not region-scoped, as before. */
async function replaceSeasonsBatch(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedTv>>,
): Promise<number> {
  await client.query(`delete from public.tv_seasons where media_item_id = any($1::uuid[])`, [
    placed.map(({ id }) => id),
  ]);

  const rows = placed.flatMap(({ id, title }) =>
    title.seasons.map((row) => ({ media_item_id: id, ...row })),
  );
  if (rows.length === 0) return 0;

  const result = await client.query(
    `insert into public.tv_seasons
       (media_item_id, season_number, tmdb_season_id, name, episode_count,
        air_date, poster_image_id, overview)
     select r.media_item_id, r.season_number, r.tmdb_season_id, r.name, r.episode_count,
            r.air_date, r.poster_image_id, r.overview
       from jsonb_to_recordset($1::jsonb) as r(
              media_item_id uuid,
              season_number integer,
              tmdb_season_id integer,
              name text,
              episode_count integer,
              air_date date,
              poster_image_id text,
              overview text
            )`,
    [JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
}

/** Replace a batch's certifications, scoped to each title's regions. */
async function replaceCertificationsBatch(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedTitle>>,
): Promise<number> {
  await deleteForRegionPairs(client, 'public.media_certifications', regionPairs(placed));

  const rows = placed.flatMap(({ id, title }) =>
    title.certifications.map((row) => ({ media_item_id: id, ...row })),
  );
  if (rows.length === 0) return 0;

  const result = await client.query(
    `insert into public.media_certifications (media_item_id, region, certification)
     select r.media_item_id, r.region, r.certification
       from jsonb_to_recordset($1::jsonb) as r(media_item_id uuid, region text, certification text)`,
    [JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
}

/**
 * De-duplicate provider stubs by provider id, first one wins.
 *
 * First rather than last, because that is what the per-title path ended up
 * storing: the first title to name a provider inserted its stub and every
 * later `do nothing` left it alone.
 */
export function dedupeProviderStubs(rows: WatchProviderRow[]): WatchProviderRow[] {
  const byId = new Map<number, WatchProviderRow>();
  for (const row of rows) if (!byId.has(row.provider_id)) byId.set(row.provider_id, row);
  return [...byId.values()];
}

/**
 * Reconcile a batch's availability: one upsert for every offer the batch saw,
 * then one close-out over every (title, region) pair it asked about.
 *
 * The same two statements {@link reconcileAvailability} runs per title, and
 * the same order, so every offer still seen carries this run's `last_seen_at`
 * before the close-out runs. The close-out is still scoped to a title and a
 * region the fetch asked about, through the pairs, never to the table at
 * large, and it still runs for a pair with no offers at all.
 */
async function reconcileAvailabilityBatch(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedTitle>>,
  seenAt: Date,
): Promise<{ written: number; closed: number }> {
  let written = 0;
  let closed = 0;
  const at = seenAt.toISOString();

  const rows = placed.flatMap(({ id, title }) =>
    title.availability.map((row) => ({ media_item_id: id, ...row })),
  );
  if (rows.length > 0) {
    const result = await client.query(
      `insert into public.watch_availability
         (media_item_id, region, provider_id, offer_type, first_seen_at, last_seen_at, removed_at)
       select r.media_item_id, r.region, r.provider_id, r.offer_type,
              $2::timestamptz, $2::timestamptz, null
         from jsonb_to_recordset($1::jsonb) as r(
                media_item_id uuid,
                region text,
                provider_id integer,
                offer_type text
              )
       on conflict (media_item_id, region, provider_id, offer_type) do update
         set last_seen_at = excluded.last_seen_at,
             removed_at = null`,
      [JSON.stringify(rows), at],
    );
    written += result.rowCount ?? 0;
  }

  const pairs = regionPairs(placed);
  if (pairs.ids.length > 0) {
    const result = await client.query(
      `update public.watch_availability w
          set removed_at = $3::timestamptz
         from unnest($1::uuid[], $2::text[]) as s(media_item_id, region)
        where w.media_item_id = s.media_item_id
          and w.region = s.region
          and w.removed_at is null
          and w.last_seen_at < $3::timestamptz`,
      [pairs.ids, pairs.regions, at],
    );
    closed += result.rowCount ?? 0;
  }

  return { written, closed };
}

/**
 * The tail every medium shares: certifications, provider stubs, availability.
 * In that order, so every provider an offer names exists before the offer.
 */
async function writeSharedTail(
  client: SqlClient,
  placed: Array<PlacedTitle<MappedTitle>>,
  seenAt: Date,
  totals: TmdbUpsertCounts,
): Promise<void> {
  totals.certifications += await replaceCertificationsBatch(client, placed);
  totals.providerStubs += await insertProviderStubs(
    client,
    dedupeProviderStubs(placed.flatMap(({ title }) => title.providerStubs)),
  );
  const availability = await reconcileAvailabilityBatch(client, placed, seenAt);
  totals.availabilityWritten += availability.written;
  totals.availabilityClosed += availability.closed;
}

/**
 * One batch of films: at most ten statements, in the design doc's table order.
 * Hands back each film's `media_items` uuid, in the batch's order.
 */
export async function writeMovieBatch(
  client: SqlClient,
  batch: MappedMovie[],
  seenAt: Date,
  totals: TmdbUpsertCounts,
): Promise<Array<PlacedTitle<MappedMovie>>> {
  const placed = await upsertTmdbMediaItems(client, 'movie', batch);
  totals.mediaItems += placed.length;
  totals.details += await upsertMovieDetailsBatch(client, placed);
  totals.scores += await upsertTmdbScoresBatch(client, placed);
  totals.releaseDates += await replaceReleaseDatesBatch(client, placed);
  await writeSharedTail(client, placed, seenAt, totals);
  return placed;
}

/** One batch of series: the same, with seasons in place of release dates. */
export async function writeShowBatch(
  client: SqlClient,
  batch: MappedTv[],
  seenAt: Date,
  totals: TmdbUpsertCounts,
): Promise<void> {
  const placed = await upsertTmdbMediaItems(client, 'tv', batch);
  totals.mediaItems += placed.length;
  totals.details += await upsertTvDetailsBatch(client, placed);
  totals.scores += await upsertTmdbScoresBatch(client, placed);
  totals.seasons += await replaceSeasonsBatch(client, placed);
  await writeSharedTail(client, placed, seenAt, totals);
}
