import pg from 'pg';
import type {
  AvailabilityRow,
  CatalogTitleRow,
  CrossLinkCandidate,
  CrossLinkRow,
  ExternalScoreRow,
  ItadTarget,
  MappedGame,
  OpenCriticScoreTarget,
  SteamAppIdRow,
  SteamScoreTarget,
  TimeToBeatRow,
} from './types';
import type {
  MappedMovie,
  MappedTv,
  MediaCertificationRow,
  TmdbMediaItemRow,
  TmdbMedium,
  TmdbScoreInput,
  TmdbStaleTarget,
  TmdbUpsertCounts,
  WatchAvailabilityRow,
  WatchProviderRow,
} from './tmdb-types';
import { CROSS_LINK_PROPERTIES } from './wikidata';

/** Rows sent to Postgres per statement. */
export const BATCH_SIZE = 500;

/**
 * The `media_items.metadata` key the TMDB mirror stamps when TMDB answers 404
 * for an id the catalog holds.
 *
 * The row is left exactly as it is: somebody may have ranked the title, and
 * `media_items` cascades into rankings and comparisons, so a 404 is a fact
 * about TMDB rather than permission to delete. What the stamp buys is that the
 * staleness pass stops paying a request a night for an id that is not coming
 * back, while still trying once more after
 * {@link TMDB_MISSING_RETRY_DAYS}: TMDB merges duplicate records and the
 * surviving id is sometimes the one we hold.
 */
export const TMDB_MISSING_KEY = 'tmdb_missing_at';

/** How long a `tmdb_missing_at` stamp keeps a title out of the staleness pass. */
export const TMDB_MISSING_RETRY_DAYS = 90;

/**
 * How many games the Steam scores phase considers on popularity alone, on top
 * of every game some user actually tracks.
 *
 * 300, from ROADMAP V1's "OpenCritic ... for the top few hundred current
 * titles": enough that a game page opened out of curiosity usually already has
 * its scores, small enough that the storefront budget covers the whole set in
 * a couple of nights.
 */
export const STEAM_POPULAR_LIMIT = 300;

/**
 * How many games the IsThereAnyDeal pass considers on popularity alone, on top
 * of every game some user actually tracks.
 *
 * 1,000, larger than the Steam scores phase's 300 because the cost shape is
 * different: this is two requests per 200 games rather than two per game, so
 * the whole set fits in a dozen calls a night either way and a wider net simply
 * means more game pages already know the answer.
 */
export const ITAD_POPULAR_LIMIT = 1000;

/** The hard cap on games one IsThereAnyDeal run asks about. */
export const ITAD_RUN_LIMIT = 2000;

/**
 * How many games the OpenCritic scores pass considers on popularity alone, on
 * top of every game some user actually tracks.
 *
 * The same 300 as {@link STEAM_POPULAR_LIMIT}, and from the same sentence in
 * ROADMAP V1 ("OpenCritic ... for the top few hundred current titles"). It
 * bites far less often here, because having an OpenCritic id at all is already
 * a filter: Wikidata's P2864 covers a few thousand games, not sixty thousand.
 */
export const OPENCRITIC_POPULAR_LIMIT = 300;

/**
 * The `media_items.metadata` key the cross-link pass stamps: when Wikidata was
 * last asked about this game.
 *
 * One key for the whole pass rather than one per identifier, because the pass
 * asks one question ("what does Wikidata know about this IGDB id") in one
 * query and gets every answer at once. A per-identifier stamp would cost six
 * keys and six selection queries to express the same thing.
 *
 * It exists because "nothing new" is the common answer, not the rare one:
 * Wikidata knows a Metacritic slug for 11% of the games it has an IGDB id for
 * and an Epic id for under 2%, so without a record of the asking every run
 * would re-ask the same tens of thousands of games and never reach the rest.
 * `external_ids` records the hits; this records the question.
 */
export const WIKIDATA_IDS_CHECKED_KEY = 'wikidata_ids_checked_at';

/**
 * The key {@link WIKIDATA_IDS_CHECKED_KEY} replaces, still read when selecting
 * candidates and never written again.
 *
 * PR #27's pass stamped this after asking Wikidata for an OpenCritic id. It
 * asked about exactly the same games through exactly the same query shape, so
 * a row carrying it has been asked about and must not be asked about again
 * tonight just because the key was renamed. Reading both keys makes the rename
 * cost nothing; writing only the new one means the old key stops moving and
 * ages out of the re-check window on its own.
 */
export const OPENCRITIC_ID_CHECKED_KEY = 'opencritic_id_checked_at';

/**
 * The `media_items.metadata` key the scores pass stamps: when OpenCritic was
 * last asked about this game, whatever it answered.
 *
 * Deliberately not `external_scores.fetched_at`, which is what the Steam pass
 * reads. Three answers have to suppress a re-ask tomorrow - a score, a game
 * with no Top Critic reviews yet, and a 404 for an id Wikidata got wrong - and
 * only the first of those writes an `external_scores` row. Recording the
 * question separately from the answer keeps `external_scores` holding nothing
 * but real numbers, so the game page never has a null score row to render,
 * while still costing a fruitless id one request per staleness window instead
 * of one per run.
 */
export const OPENCRITIC_SCORE_CHECKED_KEY = 'opencritic_score_checked_at';

export interface UpsertCounts {
  mediaItems: number;
  gameDetails: number;
  externalScores: number;
  /** `media_aliases` rows with source `igdb` newly written. Unchanged names cost nothing. */
  aliases: number;
}

/**
 * Upsert one batch of mapped games.
 *
 * Two statements, in this order, inside one transaction:
 *
 *   1. One `INSERT ... ON CONFLICT (medium, (external_ids->>'igdb')) DO
 *      UPDATE` into `media_items`, expanding the batch with
 *      `jsonb_to_recordset` so the whole page is a single statement. The
 *      conflict target matches the expression index added in
 *      `<timestamp>_catalog_indexes.sql`; without that index Postgres cannot
 *      infer it and the statement fails outright. `RETURNING` hands back the
 *      row ids, which is the only way to learn the generated uuid of a row
 *      that already existed.
 *   2. One `INSERT ... ON CONFLICT (igdb_id) DO UPDATE` into `game_details`,
 *      joined to those ids.
 *   3. One `INSERT ... ON CONFLICT (media_item_id, source) DO UPDATE` into
 *      `external_scores` for the IGDB critic and user ratings, joined to the
 *      same ids. In the transaction rather than a later pass because the uuid
 *      those rows need only exists in this statement's RETURNING.
 *   4. One statement that makes the batch's `media_aliases` rows with source
 *      `igdb` exactly IGDB's alternative names; see {@link replaceIgdbAliases}.
 *
 * Idempotent: running it twice with the same input leaves the same rows, with
 * only `refreshed_at` and `fetched_at` moving.
 */
async function upsertBatch(client: pg.PoolClient, batch: MappedGame[]): Promise<UpsertCounts> {
  const mediaItems = batch.map((entry) => entry.mediaItem);

  const inserted = await client.query<{ id: string; igdb_id: number }>(
    `insert into public.media_items
       (medium, title, year, release_date, cover_image_id, external_ids, metadata, refreshed_at)
     select 'game'::public.medium, r.title, r.year, r.release_date, r.cover_image_id,
            r.external_ids, r.metadata, r.refreshed_at
       from jsonb_to_recordset($1::jsonb) as r(
              title text,
              year smallint,
              release_date date,
              cover_image_id text,
              external_ids jsonb,
              metadata jsonb,
              refreshed_at timestamptz
            )
     on conflict (medium, (external_ids->>'igdb')) do update
       set title = excluded.title,
           year = excluded.year,
           release_date = excluded.release_date,
           cover_image_id = excluded.cover_image_id,
           -- Merge, not replace. Other phases write their own keys into this
           -- column (the Steam phase writes metacritic_url), and the nightly
           -- delta must not wipe them. The five keys IGDB owns are always
           -- present in excluded.metadata, so merging still overwrites those.
           metadata = public.media_items.metadata || excluded.metadata,
           refreshed_at = excluded.refreshed_at
     returning id, (external_ids->>'igdb')::integer as igdb_id`,
    [JSON.stringify(mediaItems)],
  );

  const idByIgdbId = new Map<number, string>();
  for (const row of inserted.rows) idByIgdbId.set(row.igdb_id, row.id);

  const details = batch.flatMap((entry) => {
    const mediaItemId = idByIgdbId.get(entry.gameDetails.igdb_id);
    return mediaItemId ? [{ media_item_id: mediaItemId, ...entry.gameDetails }] : [];
  });

  if (details.length > 0) {
    await client.query(
      `insert into public.game_details
         (media_item_id, igdb_id, platforms, genres, developer, summary)
       select r.media_item_id, r.igdb_id, r.platforms, r.genres, r.developer, r.summary
         from jsonb_to_recordset($1::jsonb) as r(
                media_item_id uuid,
                igdb_id integer,
                platforms text[],
                genres text[],
                developer text,
                summary text
              )
       on conflict (igdb_id) do update
         set media_item_id = excluded.media_item_id,
             platforms = excluded.platforms,
             genres = excluded.genres,
             developer = excluded.developer,
             summary = excluded.summary`,
      [JSON.stringify(details)],
    );
  }

  const scores = batch.flatMap((entry) => {
    const mediaItemId = idByIgdbId.get(entry.gameDetails.igdb_id);
    if (!mediaItemId) return [];
    return entry.scores.map((score) => ({ media_item_id: mediaItemId, ...score }));
  });

  if (scores.length > 0) await insertScores(client, scores);

  const aliases = batch.flatMap((entry) => {
    const mediaItemId = idByIgdbId.get(entry.gameDetails.igdb_id);
    if (!mediaItemId) return [];
    return entry.aliases.map((alias) => ({ media_item_id: mediaItemId, alias }));
  });

  const aliasCount = await replaceIgdbAliases(client, [...idByIgdbId.values()], aliases);

  return {
    mediaItems: inserted.rowCount ?? 0,
    gameDetails: details.length,
    externalScores: scores.length,
    aliases: aliasCount,
  };
}

/**
 * Make the `igdb` aliases of these catalog rows exactly the given names.
 *
 * One statement: a data-modifying CTE deletes the rows IGDB no longer lists,
 * and the insert adds the ones it lists now, `on conflict do nothing` for the
 * ones already there. So a nightly re-sync of a game whose names have not
 * moved writes no row and deletes no row, and a game IGDB now lists no names
 * for loses its old ones rather than keeping them forever.
 *
 * Scoped twice: to the rows of this batch (the `any($2)`, which the primary
 * key's leading `media_item_id` serves), and to source `igdb`, so the
 * initialisms the database derives from the title are never touched here.
 * The primary key is `(media_item_id, source, alias)`, which is what lets the
 * same text exist once from each source.
 *
 * Runs for every batch, even one with no names at all, because "no names" is
 * news too. Returns how many rows were inserted.
 */
async function replaceIgdbAliases(
  client: pg.PoolClient,
  mediaItemIds: string[],
  aliases: Array<{ media_item_id: string; alias: string }>,
): Promise<number> {
  if (mediaItemIds.length === 0) return 0;

  const result = await client.query(
    `with incoming as (
       select distinct r.media_item_id, r.alias
         from jsonb_to_recordset($1::jsonb) as r(media_item_id uuid, alias text)
     ),
     stale as (
       delete from public.media_aliases a
        where a.media_item_id = any($2::uuid[])
          and a.source = 'igdb'
          and not exists (
            select 1 from incoming i
             where i.media_item_id = a.media_item_id
               and i.alias = a.alias
          )
     )
     insert into public.media_aliases (media_item_id, alias, source)
     select i.media_item_id, i.alias, 'igdb'
       from incoming i
     on conflict (media_item_id, source, alias) do nothing`,
    [JSON.stringify(aliases), mediaItemIds],
  );
  return result.rowCount ?? 0;
}

/**
 * Upsert `external_scores` rows.
 *
 * `external_scores`' primary key is `(media_item_id, source)` (see
 * supabase/migrations/20260909000000_core_schema.sql), so this is a plain
 * `ON CONFLICT` upsert: one row per game per source, rewritten in place each
 * time, with no delete-then-insert dance and no window in which a game's score
 * is missing.
 *
 * `fetched_at` is set to `now()` on both paths on purpose, including when the
 * number has not moved. It means "we asked the source at this time", which is
 * what the Steam phase reads to decide what is stale, and it is the honest
 * answer to "how old is this figure" on the game page.
 */
async function insertScores(
  client: pg.PoolClient | pg.Pool,
  input: ExternalScoreRow[],
): Promise<number> {
  const rows = dedupeScores(input);
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
 * De-duplicate by IGDB id, last one wins.
 *
 * Postgres refuses an `ON CONFLICT DO UPDATE` whose statement would touch the
 * same row twice ("cannot affect row a second time"), and IGDB can repeat a
 * game across pages when a record is updated mid-walk.
 */
export function dedupeByIgdbId(games: MappedGame[]): MappedGame[] {
  const byId = new Map<number, MappedGame>();
  for (const game of games) byId.set(game.gameDetails.igdb_id, game);
  return [...byId.values()];
}

/**
 * De-duplicate time-to-beat rows by IGDB id, last one wins.
 *
 * The endpoint returns one row per game, so this only ever fires if IGDB
 * changes that. An UPDATE ... FROM with two source rows for one target picks
 * one of them arbitrarily, which would make the mirror's output depend on row
 * order; better to decide here.
 */
export function dedupeTimeToBeat(rows: TimeToBeatRow[]): TimeToBeatRow[] {
  const byId = new Map<number, TimeToBeatRow>();
  for (const row of rows) byId.set(row.igdb_id, row);
  return [...byId.values()];
}

/**
 * De-duplicate score rows by `(media_item_id, source)`, last one wins.
 *
 * The same guard as {@link dedupeByIgdbId}: an `ON CONFLICT DO UPDATE` whose
 * statement would touch one row twice aborts with "cannot affect row a second
 * time". Two IGDB records mapping to one catalog row is exactly the case
 * `dedupeByIgdbId` already exists for, and this keeps that from resurfacing one
 * statement later.
 */
export function dedupeScores(rows: ExternalScoreRow[]): ExternalScoreRow[] {
  const byKey = new Map<string, ExternalScoreRow>();
  for (const row of rows) byKey.set(`${row.media_item_id} ${row.source}`, row);
  return [...byKey.values()];
}

/**
 * De-duplicate Steam app ids by IGDB id, keeping the smallest.
 *
 * Smallest rather than last, so this agrees with `selectSteamAppId` in map.ts:
 * if two IGDB records for one catalog row disagree about the Steam app id, the
 * answer must not depend on which page of the walk arrived last.
 */
export function dedupeSteamAppIds(rows: SteamAppIdRow[]): SteamAppIdRow[] {
  const byId = new Map<number, SteamAppIdRow>();
  for (const row of rows) {
    const existing = byId.get(row.igdb_id);
    if (!existing || row.steam_app_id < existing.steam_app_id) byId.set(row.igdb_id, row);
  }
  return [...byId.values()];
}

/**
 * Collapse the cross-link rows for one chunk into one answer per IGDB id,
 * keeping the smallest value of each identifier.
 *
 * Same rule as {@link dedupeSteamAppIds} and for the same reason, and the case
 * is real rather than theoretical: two Wikidata items can carry the same P9043
 * qualifier (a game and its re-release), and each OPTIONAL column can itself
 * be multi-valued, so one game arrives as several rows that disagree column by
 * column. Observed live on 2026-09-16: IGDB 13197 (Redout) came back as eight
 * rows holding two OpenCritic ids, two Metacritic slugs and two Epic slugs;
 * IGDB 1942 (The Witcher 3) held the base game's GOG id and its expansion
 * pass's.
 *
 * Per identifier rather than per row, because the rows are a cross product and
 * no single row is "the" answer: a game can have its only Steam id on one row
 * and its only GOG id on another.
 *
 * "Smallest" is numeric for the integer identifiers and, for the slugs,
 * shorter first with a plain code-unit comparison to break ties. Shorter wins
 * because an edition or an expansion appends to the base game's slug
 * (`redout` before `redout-2016`, `the_witcher_3_wild_hunt` before
 * `..._expansion_pass`), so the shortest is the base game far more often than
 * not; the tie-break exists only so the answer can never depend on which row
 * the endpoint listed first.
 */
export function dedupeCrossLinks(rows: CrossLinkRow[]): CrossLinkRow[] {
  const byId = new Map<number, CrossLinkRow>();

  for (const row of rows) {
    const merged = byId.get(row.igdb_id) ?? { igdb_id: row.igdb_id };

    for (const property of CROSS_LINK_PROPERTIES) {
      const incoming = row[property.key];
      if (incoming === undefined) continue;

      const held = merged[property.key];
      if (held === undefined || smaller(incoming, held)) {
        (merged as Record<string, unknown>)[property.key] = incoming;
      }
    }

    byId.set(row.igdb_id, merged);
  }

  return [...byId.values()];
}

/** The "smallest wins" rule: numeric for ids, shorter then code-unit order for slugs. */
function smaller(a: number | string, b: number | string): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a < b;
  const left = String(a);
  const right = String(b);
  return left.length !== right.length ? left.length < right.length : left < right;
}

/** One game as the two statements below take it: its IGDB id and the keys to merge. */
export interface CrossLinkPatch {
  igdb_id: number;
  links: Record<string, number | string>;
}

/**
 * De-duplicate the chunk and turn each game into the jsonb object to merge.
 *
 * Built here rather than in SQL so the statement stays one `jsonb_to_recordset`
 * however many identifiers the property table grows: a column per identifier
 * would mean a new record definition and a new `jsonb_build_object` argument
 * pair for every property added, which is exactly the parallel pass this
 * change exists to avoid.
 *
 * A game whose every identifier failed its regex yields no patch at all, so an
 * empty object is never sent and never merged.
 */
export function crossLinkBatches(rows: CrossLinkRow[]): CrossLinkPatch[][] {
  const patches: CrossLinkPatch[] = [];

  for (const row of dedupeCrossLinks(rows)) {
    const links: Record<string, number | string> = {};
    for (const property of CROSS_LINK_PROPERTIES) {
      const value = row[property.key];
      if (value !== undefined) links[property.key] = value;
    }
    if (Object.keys(links).length > 0) patches.push({ igdb_id: row.igdb_id, links });
  }

  const batches: CrossLinkPatch[][] = [];
  for (let start = 0; start < patches.length; start += BATCH_SIZE) {
    batches.push(patches.slice(start, start + BATCH_SIZE));
  }
  return batches;
}

/**
 * De-duplicate availability rows by `(media_item_id, service, region)`, last
 * one wins.
 *
 * The same guard as {@link dedupeScores}: an `ON CONFLICT DO UPDATE` whose
 * statement would touch one row twice aborts with "cannot affect row a second
 * time". `matchUnique` already refuses a key two source entries share, but two
 * *different* keys can still reach one catalog row -- a Game Pass collection
 * that lists a game under two product ids whose titles differ only in
 * punctuation, say -- and that collision only becomes visible here.
 */
export function dedupeAvailability(rows: AvailabilityRow[]): AvailabilityRow[] {
  const byKey = new Map<string, AvailabilityRow>();
  for (const row of rows) byKey.set(`${row.media_item_id} ${row.service} ${row.region}`, row);
  return [...byKey.values()];
}

/** True for a connection string pointing at the local Supabase stack. */
export function isLocal(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

// --- The TMDB mirror's statements -------------------------------------------

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

function emptyTmdbCounts(): TmdbUpsertCounts {
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
 * Insert or update one title's `media_items` row, and hand back its uuid.
 *
 * The identity is looked up through the details table's `tmdb_id`, never
 * through `external_ids`: the film and series id spaces overlap at TMDB, so
 * `external_ids->>'tmdb'` alone names two different titles and would let a
 * series quietly overwrite a film.
 *
 * One statement rather than a select and then a write, so the two cannot
 * disagree: the `existing` CTE is evaluated once and both branches key off it,
 * and exactly one of them produces a row.
 *
 * `external_ids` and `metadata` are merged with `||` rather than replaced, the
 * way the games mirror merges them, so a key another pass owns survives the
 * night. The keys TMDB owns are always present in the incoming object, so
 * merging still overwrites those.
 */
async function upsertTmdbMediaItem(
  client: pg.PoolClient,
  medium: TmdbMedium,
  row: TmdbMediaItemRow,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `with existing as (
       select d.media_item_id as id from ${detailsTable(medium)} d where d.tmdb_id = $1
     ),
     updated as (
       update public.media_items m
          set title = $2,
              year = $3,
              release_date = $4,
              cover_image_id = $5,
              external_ids = m.external_ids || $6::jsonb,
              metadata = m.metadata || $7::jsonb,
              refreshed_at = $8::timestamptz
        where m.id = (select id from existing)
       returning m.id
     ),
     inserted as (
       insert into public.media_items
         (medium, title, year, release_date, cover_image_id, external_ids, metadata, refreshed_at)
       select '${medium}'::public.medium, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz
        where not exists (select 1 from existing)
       returning id
     )
     select id from updated union all select id from inserted`,
    [
      row.external_ids.tmdb,
      row.title,
      row.year,
      row.release_date,
      row.cover_image_id,
      JSON.stringify(row.external_ids),
      JSON.stringify(row.metadata),
      row.refreshed_at,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) throw new Error(`media_items upsert returned no id for tmdb ${row.external_ids.tmdb}`);
  return id;
}

/**
 * The `tmdb` row in `external_scores`, when there is one.
 *
 * In the title's own transaction because `external_scores` is keyed by the
 * uuid the statement above just produced. No row at all when nobody has voted:
 * "we do not know" is the absence of the row, not a zero.
 */
async function upsertTmdbScore(
  client: pg.PoolClient,
  mediaItemId: string,
  score: TmdbScoreInput | null,
): Promise<number> {
  if (!score) return 0;

  const result = await client.query(
    `insert into public.external_scores (media_item_id, source, score, score_count, fetched_at)
     values ($1::uuid, $2, $3, $4, now())
     on conflict (media_item_id, source) do update
       set score = excluded.score,
           score_count = excluded.score_count,
           fetched_at = excluded.fetched_at`,
    [mediaItemId, score.source, score.score, score.score_count],
  );
  return result.rowCount ?? 0;
}

/** Replace one title's certifications for the regions this run asked about. */
async function replaceCertifications(
  client: pg.PoolClient,
  mediaItemId: string,
  regions: string[],
  rows: MediaCertificationRow[],
): Promise<number> {
  await client.query(
    `delete from public.media_certifications
      where media_item_id = $1::uuid and region = any($2::text[])`,
    [mediaItemId, regions],
  );
  if (rows.length === 0) return 0;

  const result = await client.query(
    `insert into public.media_certifications (media_item_id, region, certification)
     select $1::uuid, r.region, r.certification
       from jsonb_to_recordset($2::jsonb) as r(region text, certification text)`,
    [mediaItemId, JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
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
async function insertProviderStubs(
  client: pg.PoolClient,
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

/**
 * Reconcile one title's availability, region by region.
 *
 * The same history rules `game_availability` follows: the row is the
 * relationship, `removed_at is null` means "on the service right now", rows
 * are never deleted, and a title that comes back keeps its original
 * `first_seen_at` because that column is absent from the update list.
 *
 * Writes first, then the close-out, so every offer the fetch still saw carries
 * this run's `last_seen_at` before the statement that closes everything older
 * runs. `seenAt` is the run's single instant, passed as a parameter rather
 * than called as `now()` inside the statement, which is what makes
 * `last_seen_at < $seenAt` an exact separation of "seen this run" from "not
 * seen this run" rather than a race.
 *
 * The close-out runs for every region the fetch asked about, including the
 * ones with no offers at all. That is deliberate and is the opposite of the
 * guard `availability.ts` puts on the games sources: there, an empty answer
 * usually means the source failed, so closing on it would announce that every
 * game had left Game Pass. Here the answer came back inside the title's own
 * response, so "no offers in this region" is a fact about the title, and a
 * film that has left every service has to be able to say so.
 *
 * Scoped to the one title and the one region on purpose. A title's
 * availability is only as fresh as its last fetch -- TMDB's changes feed does
 * not track provider moves (research 3.1) -- so a statement any broader would
 * close out titles this run never asked about.
 */
async function reconcileAvailability(
  client: pg.PoolClient,
  mediaItemId: string,
  regions: string[],
  rows: WatchAvailabilityRow[],
  seenAt: Date,
): Promise<{ written: number; closed: number }> {
  let written = 0;
  let closed = 0;
  const at = seenAt.toISOString();

  if (rows.length > 0) {
    const result = await client.query(
      `insert into public.watch_availability
         (media_item_id, region, provider_id, offer_type, first_seen_at, last_seen_at, removed_at)
       select $1::uuid, r.region, r.provider_id, r.offer_type,
              $3::timestamptz, $3::timestamptz, null
         from jsonb_to_recordset($2::jsonb) as r(
                region text,
                provider_id integer,
                offer_type text
              )
       on conflict (media_item_id, region, provider_id, offer_type) do update
         set last_seen_at = excluded.last_seen_at,
             removed_at = null`,
      [mediaItemId, JSON.stringify(rows), at],
    );
    written += result.rowCount ?? 0;
  }

  for (const region of regions) {
    const result = await client.query(
      `update public.watch_availability
          set removed_at = $3::timestamptz
        where media_item_id = $1::uuid
          and region = $2
          and removed_at is null
          and last_seen_at < $3::timestamptz`,
      [mediaItemId, region, at],
    );
    closed += result.rowCount ?? 0;
  }

  return { written, closed };
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
interface PlacedTitle<T> {
  id: string;
  title: T;
}

/** The fields every mapped title shares, whatever its medium. */
type MappedTitle = MappedMovie | MappedTv;

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
  client: pg.PoolClient,
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

  const result = await client.query<{ id: string; tmdb_id: number | string }>(
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
  for (const row of result.rows) idByTmdbId.set(Number(row.tmdb_id), row.id);

  return batch.map((entry) => {
    const id = idByTmdbId.get(entry.details.tmdb_id);
    if (!id) throw new Error(`media_items upsert returned no id for tmdb ${entry.details.tmdb_id}`);
    return { id, title: entry };
  });
}

/** Upsert a batch's `movie_details` rows on `tmdb_id`, as the per-title statement does. */
async function upsertMovieDetailsBatch(
  client: pg.PoolClient,
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
  client: pg.PoolClient,
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
  client: pg.PoolClient,
  placed: Array<PlacedTitle<MappedTitle>>,
): Promise<number> {
  const rows: ExternalScoreRow[] = placed.flatMap(({ id, title }) =>
    title.score ? [{ media_item_id: id, ...title.score }] : [],
  );
  if (rows.length === 0) return 0;
  return insertScores(client, rows);
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
  client: pg.PoolClient,
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
  client: pg.PoolClient,
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
  client: pg.PoolClient,
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
  client: pg.PoolClient,
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
  client: pg.PoolClient,
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
  client: pg.PoolClient,
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

/** One batch of films: at most ten statements, in the design doc's table order. */
async function writeMovieBatch(
  client: pg.PoolClient,
  batch: MappedMovie[],
  seenAt: Date,
  totals: TmdbUpsertCounts,
): Promise<void> {
  const placed = await upsertTmdbMediaItems(client, 'movie', batch);
  totals.mediaItems += placed.length;
  totals.details += await upsertMovieDetailsBatch(client, placed);
  totals.scores += await upsertTmdbScoresBatch(client, placed);
  totals.releaseDates += await replaceReleaseDatesBatch(client, placed);
  await writeSharedTail(client, placed, seenAt, totals);
}

/** One batch of series: the same, with seasons in place of release dates. */
async function writeShowBatch(
  client: pg.PoolClient,
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

export class CatalogStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 4,
      // Supabase requires TLS, but `pg` has no Supabase CA bundle and the
      // pooler hostname does not match the certificate, so TLS is required
      // without verification. The local stack speaks no TLS at all, so it is
      // exempt.
      ssl: isLocal(connectionString) ? false : { rejectUnauthorized: false },
    });
  }

  /** Upsert any number of games, chunked into {@link BATCH_SIZE} statements. */
  async upsert(games: MappedGame[]): Promise<UpsertCounts> {
    const rows = dedupeByIgdbId(games);
    const totals: UpsertCounts = { mediaItems: 0, gameDetails: 0, externalScores: 0, aliases: 0 };

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        const counts = await upsertBatch(client, batch);
        await client.query('commit');
        totals.mediaItems += counts.mediaItems;
        totals.gameDetails += counts.gameDetails;
        totals.externalScores += counts.externalScores;
        totals.aliases += counts.aliases;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    return totals;
  }

  /** Upsert score rows that already know their `media_item_id`. */
  async upsertExternalScores(rows: ExternalScoreRow[]): Promise<number> {
    let written = 0;
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      written += await insertScores(this.pool, rows.slice(start, start + BATCH_SIZE));
    }
    return written;
  }

  /**
   * Write Steam app ids into `media_items.external_ids`.
   *
   * A jsonb merge (`||`) rather than a replacement, so the IGDB id already in
   * the column survives: that key is what the catalog's unique index and every
   * upsert in this file match on, and clobbering it would orphan the row from
   * its own mirror. The merge adds or replaces only `steam`.
   *
   * The join is on the *text* form of the IGDB id, matching the expression in
   * `media_items_igdb_uniq` exactly, so the update uses that index; casting the
   * column to integer instead would both lose the index and risk evaluating
   * the cast on a future TMDB row that has no IGDB id.
   *
   * The `is distinct from` guard makes an unchanged id write nothing at all, so
   * the returned count is app ids newly set or actually changed, and a nightly
   * re-run of a settled catalog costs no row versions.
   */
  async upsertSteamAppIds(rows: SteamAppIdRow[]): Promise<number> {
    const deduped = dedupeSteamAppIds(rows);
    let updated = 0;

    for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
      const batch = deduped.slice(start, start + BATCH_SIZE);
      const result = await this.pool.query(
        `update public.media_items m
            set external_ids = m.external_ids || jsonb_build_object('steam', r.steam_app_id)
           from jsonb_to_recordset($1::jsonb) as r(
                  igdb_id integer,
                  steam_app_id integer
                )
          where m.medium = 'game'
            and m.external_ids->>'igdb' = r.igdb_id::text
            and m.external_ids->'steam' is distinct from to_jsonb(r.steam_app_id)`,
        [JSON.stringify(batch)],
      );
      updated += result.rowCount ?? 0;
    }

    return updated;
  }

  /**
   * Record Metacritic's page for a game in `media_items.metadata`.
   *
   * A merge for the same reason as the app ids: `metadata` already carries
   * IGDB's rating figures and `game_type`, and this phase owns exactly one key
   * in it. The URL is the one Valve hands us alongside the licensed score, so
   * the link out and the number always point at the same page.
   */
  async setMetacriticUrls(rows: Array<{ media_item_id: string; url: string }>): Promise<number> {
    let updated = 0;

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const result = await this.pool.query(
        `update public.media_items m
            set metadata = m.metadata || jsonb_build_object('metacritic_url', r.url)
           from jsonb_to_recordset($1::jsonb) as r(media_item_id uuid, url text)
          where m.id = r.media_item_id
            and m.metadata->>'metacritic_url' is distinct from r.url`,
        [JSON.stringify(batch)],
      );
      updated += result.rowCount ?? 0;
    }

    return updated;
  }

  /**
   * The games the Steam scores phase should fetch tonight, in the order it
   * should fetch them.
   *
   * Who is eligible: every game with a Steam app id that somebody tracks (a
   * `user_entries` row or a `ranking_entries` row, any user), plus the top
   * {@link STEAM_POPULAR_LIMIT} by IGDB's `total_rating_count`. The first set
   * is "a score somebody will actually look at"; the second is "a score
   * somebody is about to look at", because the popular games are what a search
   * lands on.
   *
   * Only the two `exists` clauses touch user tables, and they ask whether *any*
   * row exists, never whose. No user id is read, and nothing per-user is
   * stored: the scores are a property of the game.
   *
   * What it skips: anything whose `steam` score was fetched since `staleBefore`.
   * That is the whole of the catch-up story. The run stops when its request
   * budget is spent, the rows it reached have a fresh `fetched_at`, and the
   * next run therefore starts with the ones it did not reach. Ordering by
   * `fetched_at` ascending with nulls first means never-fetched games go first
   * and no game can starve.
   *
   * Tracked games sort ahead of merely popular ones, so a budget too small for
   * the whole list always spends itself on the games users care about.
   */
  async steamScoreTargets(options: {
    staleBefore: Date;
    limit: number;
    popularLimit?: number;
  }): Promise<SteamScoreTarget[]> {
    const result = await this.pool.query<{
      media_item_id: string;
      steam_app_id: string;
      tracked: boolean;
    }>(
      `with steam_games as (
         select m.id,
                (m.external_ids->>'steam')::integer as steam_app_id,
                nullif(m.metadata->>'total_rating_count', '')::numeric as rating_count
           from public.media_items m
          where m.medium = 'game'
            and jsonb_typeof(m.external_ids->'steam') = 'number'
       ),
       tracked as (
         select g.id
           from steam_games g
          where exists (select 1 from public.user_entries e where e.media_item_id = g.id)
             or exists (select 1 from public.ranking_entries r where r.media_item_id = g.id)
       ),
       popular as (
         select g.id
           from steam_games g
          order by g.rating_count desc nulls last, g.id
          limit $2
       ),
       targets as (
         select g.id,
                g.steam_app_id,
                g.rating_count,
                (g.id in (select id from tracked)) as tracked
           from steam_games g
          where g.id in (select id from tracked)
             or g.id in (select id from popular)
       )
       select t.id as media_item_id, t.steam_app_id, t.tracked, s.fetched_at
         from targets t
         left join public.external_scores s
                on s.media_item_id = t.id and s.source = 'steam'
        where s.fetched_at is null or s.fetched_at < $1
        order by t.tracked desc,
                 s.fetched_at asc nulls first,
                 t.rating_count desc nulls last,
                 t.id
        limit $3`,
      [options.staleBefore.toISOString(), options.popularLimit ?? STEAM_POPULAR_LIMIT, options.limit],
    );

    return result.rows.map((row) => ({
      media_item_id: row.media_item_id,
      // `pg` hands back numerics and bigints as strings; app ids are integers
      // and come back as numbers, but Number() costs nothing and settles it.
      steam_app_id: Number(row.steam_app_id),
      tracked: row.tracked,
    }));
  }

  /**
   * Write the cross-links into `media_items.external_ids`, adding keys and
   * never taking one away.
   *
   * The same jsonb merge as {@link upsertSteamAppIds} and with the same join,
   * but the operands are the other way round on purpose. `a || b` lets `b`'s
   * keys win, so `r.links || m.external_ids` means **the row we already hold
   * wins every key it already has** and Wikidata only fills the gaps. That is
   * the whole policy in one operator:
   *
   *   * `igdb` - the key the catalog's unique index and every upsert in this
   *     file match on - cannot be touched, so the row can never be orphaned
   *     from its own mirror.
   *   * `steam` is filled where the mirror has none and left alone where it
   *     has one, which is the documented fill: IGDB stays authoritative.
   *     A disagreement is not an error and is not written; it is counted
   *     beforehand by {@link countSteamDisagreements}.
   *   * Every other key is likewise written once and then left alone, so a
   *     later hand correction in the database survives the nightly pass.
   *
   * The join is on the *text* form of the IGDB id, matching the expression in
   * `media_items_igdb_uniq` exactly, so the update uses that index.
   *
   * The guard compares the merged value against the stored one, so a game with
   * nothing new writes no row version at all and the returned count is games
   * whose `external_ids` actually gained something. A re-run of a settled
   * catalog costs nothing.
   */
  async upsertCrossLinks(rows: CrossLinkRow[]): Promise<number> {
    const batches = crossLinkBatches(rows);
    let updated = 0;

    for (const batch of batches) {
      const result = await this.pool.query(
        `update public.media_items m
            set external_ids = r.links || m.external_ids
           from jsonb_to_recordset($1::jsonb) as r(
                  igdb_id integer,
                  links jsonb
                )
          where m.medium = 'game'
            and m.external_ids->>'igdb' = r.igdb_id::text
            and (r.links || m.external_ids) is distinct from m.external_ids`,
        [JSON.stringify(batch)],
      );
      updated += result.rowCount ?? 0;
    }

    return updated;
  }

  /**
   * How many games in this batch already hold a Steam app id that disagrees
   * with Wikidata's, and how many have none for Wikidata to fill.
   *
   * Read before the write, never after: the write fills the empty ones, so
   * afterwards the counts would both be zero and the run would report that it
   * had never seen a disagreement.
   *
   * A disagreement changes nothing - IGDB's value stays, because that is what
   * the merge in {@link upsertCrossLinks} does - so this exists to be looked
   * at rather than acted on. Two sources naming different Steam apps for one
   * game is usually a real fact about the catalog (a remaster, a regional
   * SKU, an IGDB record covering a bundle), and the number moving sharply is
   * the signal that the join itself has gone wrong.
   */
  async countSteamDisagreements(
    rows: CrossLinkRow[],
  ): Promise<{ filled: number; disagreed: number }> {
    const totals = { filled: 0, disagreed: 0 };

    for (const batch of crossLinkBatches(rows)) {
      const result = await this.pool.query<{ filled: string; disagreed: string }>(
        `select
            count(*) filter (where m.external_ids->'steam' is null)::text as filled,
            count(*) filter (
              where m.external_ids->'steam' is not null
                and m.external_ids->'steam' is distinct from r.links->'steam'
            )::text as disagreed
           from jsonb_to_recordset($1::jsonb) as r(igdb_id integer, links jsonb)
           join public.media_items m
             on m.medium = 'game'
            and m.external_ids->>'igdb' = r.igdb_id::text
          where r.links ? 'steam'`,
        [JSON.stringify(batch)],
      );

      totals.filled += Number(result.rows[0]?.filled ?? 0);
      totals.disagreed += Number(result.rows[0]?.disagreed ?? 0);
    }

    return totals;
  }

  /**
   * Stamp `metadata` with the instant a pass asked about these games.
   *
   * One helper for both keys ({@link WIKIDATA_IDS_CHECKED_KEY} and
   * {@link OPENCRITIC_SCORE_CHECKED_KEY}) because the statement is identical
   * and only the key differs. A merge, like every other write to this column:
   * `metadata` already carries IGDB's rating figures, `game_type` and the
   * Steam pass's `metacritic_url`, and each pass owns exactly one key in it.
   *
   * No `is distinct from` guard here, unlike the id writes: the whole point of
   * the column is that the timestamp moves on every ask, including the asks
   * that changed nothing. That is what makes the next run skip it.
   */
  async setCheckedAt(
    key: typeof WIKIDATA_IDS_CHECKED_KEY | typeof OPENCRITIC_SCORE_CHECKED_KEY,
    mediaItemIds: string[],
    at: Date,
  ): Promise<number> {
    let updated = 0;

    for (let start = 0; start < mediaItemIds.length; start += BATCH_SIZE) {
      const batch = mediaItemIds.slice(start, start + BATCH_SIZE);
      const result = await this.pool.query(
        `update public.media_items m
            set metadata = m.metadata || jsonb_build_object($2::text, $3::text)
          where m.id = any($1::uuid[])`,
        [batch, key, at.toISOString()],
      );
      updated += result.rowCount ?? 0;
    }

    return updated;
  }

  /**
   * The games the cross-link pass should ask Wikidata about, in the order it
   * should ask.
   *
   * Who is eligible: every game with an IGDB id that was either never asked
   * about or asked about before `recheckBefore`. The re-ask window is why this
   * is a sweep rather than a one-off: Wikidata gains identifiers over time, so
   * a game that had none in September may have one in October.
   *
   * There is deliberately no "already has what we want" filter, unlike PR
   * #27's version, which skipped anything already carrying an `opencritic`
   * key. With six identifiers on one query there is no such state: a game can
   * hold an OpenCritic id and still be missing the HowLongToBeat id its page
   * wants, and a game holding all six can gain a seventh when the property
   * table grows. The stamp alone decides, which also means the pass has one
   * pacing story rather than one per identifier.
   *
   * The stamp is read from {@link WIKIDATA_IDS_CHECKED_KEY} falling back to
   * {@link OPENCRITIC_ID_CHECKED_KEY}, so the rows PR #27's pass already
   * stamped count as asked about and the rename costs no re-fetch.
   *
   * Only the two `exists` clauses touch user tables, and they ask whether
   * *any* row exists, never whose, exactly as {@link steamScoreTargets} does.
   * No user id is read.
   *
   * They sit in a `tracked` CTE's `where` clause rather than in the outer
   * select list, which is the same shape {@link steamScoreTargets} uses and
   * the reason it is worth the extra CTE. An `exists` in a target list is a
   * correlated subplan the planner re-runs for every candidate row before the
   * `limit` applies; in a `where` clause it can be pulled up into a semi-join
   * or hashed once. That matters here because neither `user_entries` nor
   * `ranking_entries` has an index leading with `media_item_id` - both lead
   * with `user_id` - so the per-row form is a scan of both user tables per
   * candidate, tens of thousands of times a night.
   *
   * Tracked games sort first, then the never-asked, then the most-rated, so a
   * cap too small for the catalog always spends itself on the games somebody
   * will actually open. There is no popularity *filter* here, unlike the score
   * passes: a Wikidata query costs one five-hundredth of a request per game,
   * so the whole catalog is reachable over the weeks a sweep takes and there
   * is no reason to fence any of it off. What paces that sweep is the cost of
   * the stamp, not the cost of the query - see `DEFAULT_ID_LIMIT`.
   */
  async crossLinkCandidates(options: {
    recheckBefore: Date;
    limit: number;
  }): Promise<CrossLinkCandidate[]> {
    const result = await this.pool.query<{
      media_item_id: string;
      igdb_id: string;
      tracked: boolean;
    }>(
      `with igdb_games as (
         select m.id,
                (m.external_ids->>'igdb')::integer as igdb_id,
                nullif(m.metadata->>'total_rating_count', '')::numeric as rating_count,
                coalesce(
                  m.metadata->>'${WIKIDATA_IDS_CHECKED_KEY}',
                  m.metadata->>'${OPENCRITIC_ID_CHECKED_KEY}'
                )::timestamptz as checked_at
           from public.media_items m
          where m.medium = 'game'
            and jsonb_typeof(m.external_ids->'igdb') = 'number'
       ),
       candidates as (
         select g.id, g.igdb_id, g.rating_count, g.checked_at
           from igdb_games g
          where g.checked_at is null or g.checked_at < $1
       ),
       tracked as (
         select c.id
           from candidates c
          where exists (select 1 from public.user_entries e where e.media_item_id = c.id)
             or exists (select 1 from public.ranking_entries r where r.media_item_id = c.id)
       )
       select c.id as media_item_id,
              c.igdb_id,
              (c.id in (select id from tracked)) as tracked
         from candidates c
        order by tracked desc,
                 c.checked_at asc nulls first,
                 c.rating_count desc nulls last,
                 c.id
        limit $2`,
      [options.recheckBefore.toISOString(), options.limit],
    );

    return result.rows.map((row) => ({
      media_item_id: row.media_item_id,
      igdb_id: Number(row.igdb_id),
      tracked: row.tracked,
    }));
  }

  /**
   * The games the OpenCritic scores pass should fetch, in the order it should
   * fetch them.
   *
   * The same shape as {@link steamScoreTargets} - tracked games plus the top
   * {@link OPENCRITIC_POPULAR_LIMIT}, stalest first, capped at the run's
   * budget - with one difference: staleness is read from
   * {@link OPENCRITIC_SCORE_CHECKED_KEY} in `metadata` rather than from
   * `external_scores.fetched_at`, so a game OpenCritic has no reviews of and
   * an id OpenCritic 404s on are both suppressed for the window instead of
   * being re-asked every night forever. See that constant for why.
   *
   * Ordering by the check timestamp ascending with nulls first means
   * never-fetched games go first and no game can starve; a run that stops on
   * its budget leaves the rest untouched, so the next run starts exactly where
   * this one left off. There is no cursor to lose.
   */
  async openCriticScoreTargets(options: {
    staleBefore: Date;
    limit: number;
    popularLimit?: number;
  }): Promise<OpenCriticScoreTarget[]> {
    const result = await this.pool.query<{
      media_item_id: string;
      opencritic_id: string;
      tracked: boolean;
    }>(
      `with opencritic_games as (
         select m.id,
                (m.external_ids->>'opencritic')::integer as opencritic_id,
                nullif(m.metadata->>'total_rating_count', '')::numeric as rating_count,
                (m.metadata->>'${OPENCRITIC_SCORE_CHECKED_KEY}')::timestamptz as checked_at
           from public.media_items m
          where m.medium = 'game'
            and jsonb_typeof(m.external_ids->'opencritic') = 'number'
       ),
       tracked as (
         select g.id
           from opencritic_games g
          where exists (select 1 from public.user_entries e where e.media_item_id = g.id)
             or exists (select 1 from public.ranking_entries r where r.media_item_id = g.id)
       ),
       popular as (
         select g.id
           from opencritic_games g
          order by g.rating_count desc nulls last, g.id
          limit $2
       )
       select g.id as media_item_id,
              g.opencritic_id,
              (g.id in (select id from tracked)) as tracked
         from opencritic_games g
        where (g.id in (select id from tracked) or g.id in (select id from popular))
          and (g.checked_at is null or g.checked_at < $1)
        order by tracked desc,
                 g.checked_at asc nulls first,
                 g.rating_count desc nulls last,
                 g.id
        limit $3`,
      [
        options.staleBefore.toISOString(),
        options.popularLimit ?? OPENCRITIC_POPULAR_LIMIT,
        options.limit,
      ],
    );

    return result.rows.map((row) => ({
      media_item_id: row.media_item_id,
      opencritic_id: Number(row.opencritic_id),
      tracked: row.tracked,
    }));
  }

  /**
   * Write the time-to-beat triple onto existing `game_details` rows.
   *
   * An UPDATE ... FROM rather than an upsert, because the time-to-beat
   * endpoint knows nothing about our `media_item_id` and `game_details` cannot
   * be inserted without one. Joining on `igdb_id` also gives the behaviour we
   * want for free: figures for a game the trim rule excluded match nothing and
   * are silently dropped.
   *
   * Returns the number of catalog rows actually touched, which is normally
   * lower than `rows.length` because IGDB has time-to-beat data for games we
   * do not mirror.
   */
  async upsertTimeToBeat(rows: TimeToBeatRow[]): Promise<number> {
    const deduped = dedupeTimeToBeat(rows);
    let updated = 0;

    for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
      const batch = deduped.slice(start, start + BATCH_SIZE);
      const result = await this.pool.query(
        `update public.game_details g
            set time_to_beat_hastily_seconds = r.hastily_seconds,
                time_to_beat_normally_seconds = r.normally_seconds,
                time_to_beat_completely_seconds = r.completely_seconds
           from jsonb_to_recordset($1::jsonb) as r(
                  igdb_id integer,
                  hastily_seconds integer,
                  normally_seconds integer,
                  completely_seconds integer
                )
          where g.igdb_id = r.igdb_id`,
        [JSON.stringify(batch)],
      );
      updated += result.rowCount ?? 0;
    }

    return updated;
  }

  /**
   * Every mirrored game's title, for the normalized-title match.
   *
   * One query rather than a per-title lookup, and normalization in
   * TypeScript rather than in SQL, on purpose: both sides of a title match must
   * normalize identically, and the only way to be sure of that is for both
   * sides to call the same function (`normalizeTitle` in match.ts). A SQL
   * expression that agreed with it today would drift the first time either one
   * learned about a new kind of punctuation.
   *
   * It costs a few megabytes for the ~70,000-row catalog, once a night, which
   * is well under what the mirror's own upsert moves in a single page.
   */
  async gameTitles(): Promise<CatalogTitleRow[]> {
    const result = await this.pool.query<{ media_item_id: string; title: string }>(
      `select m.id as media_item_id, m.title
         from public.media_items m
        where m.medium = 'game'`,
    );
    return result.rows;
  }

  /**
   * Catalog rows for a set of Steam app ids, keyed the way `matchUnique` wants
   * them.
   *
   * The comparison is on the *text* form of the id, matching how the mirror
   * stores it and how `media_items_igdb_uniq` spells its own expression;
   * casting the column to integer instead would risk evaluating the cast on a
   * future TMDB row that has no Steam id at all.
   *
   * `jsonb_typeof(...) = 'number'` is the same guard `steamScoreTargets` uses,
   * so a row whose `steam` key was ever written as a string cannot slip in with
   * a different meaning.
   */
  async gamesBySteamAppId(
    appIds: readonly number[],
  ): Promise<Array<{ media_item_id: string; key: string }>> {
    if (appIds.length === 0) return [];

    const result = await this.pool.query<{ media_item_id: string; key: string }>(
      `select m.id as media_item_id, m.external_ids->>'steam' as key
         from public.media_items m
        where m.medium = 'game'
          and jsonb_typeof(m.external_ids->'steam') = 'number'
          and m.external_ids->>'steam' = any($1::text[])`,
      [appIds.map((id) => String(id))],
    );
    return result.rows;
  }

  /**
   * Write what a run saw, in batches.
   *
   * `first_seen_at` is deliberately absent from the update list. It is set once
   * when the row is created and never touched again, so a game that leaves a
   * service and comes back still answers "since when" with the day it first
   * arrived rather than the day it returned. `removed_at` is cleared on every
   * sighting, which is what re-opening a closed row means.
   *
   * `seenAt` is the run's single instant, passed as a parameter rather than
   * called as `now()` inside the statement. Every row one run writes then
   * carries exactly the same timestamp, which is what makes
   * {@link closeMissingAvailability}'s `last_seen_at < $seenAt` an exact
   * separation of "seen tonight" from "not seen tonight" rather than a race.
   */
  async upsertAvailability(rows: AvailabilityRow[], seenAt: Date): Promise<number> {
    const deduped = dedupeAvailability(rows);
    let written = 0;

    for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
      const batch = deduped.slice(start, start + BATCH_SIZE);
      const result = await this.pool.query(
        `insert into public.game_availability
           (media_item_id, service, region, source_ref, first_seen_at, last_seen_at, removed_at)
         select r.media_item_id, r.service, r.region, r.source_ref, $2::timestamptz, $2::timestamptz, null
           from jsonb_to_recordset($1::jsonb) as r(
                  media_item_id uuid,
                  service text,
                  region text,
                  source_ref text
                )
         on conflict (media_item_id, service, region) do update
           set source_ref = excluded.source_ref,
               last_seen_at = excluded.last_seen_at,
               removed_at = null`,
        [JSON.stringify(batch), seenAt.toISOString()],
      );
      written += result.rowCount ?? 0;
    }

    return written;
  }

  /**
   * Close the rows this run did not see for one service in one region.
   *
   * Never a delete. The row stays with `removed_at` set, because "left Game
   * Pass on the 14th" is worth more than a missing row and because a game that
   * comes back should not lose its history.
   *
   * `removed_at is null` in the predicate means a row already closed on an
   * earlier night keeps its original date rather than being re-stamped every
   * night forever.
   *
   * The caller must not run this for a source that failed or returned nothing:
   * an empty answer would close the entire service. That guard lives in
   * availability.ts, where it can see whether the source succeeded.
   */
  async closeMissingAvailability(service: string, region: string, seenAt: Date): Promise<number> {
    const result = await this.pool.query(
      `update public.game_availability
          set removed_at = $3::timestamptz
        where service = $1
          and region = $2
          and removed_at is null
          and last_seen_at < $3::timestamptz`,
      [service, region, seenAt.toISOString()],
    );
    return result.rowCount ?? 0;
  }

  /**
   * The same close-out, restricted to the games this run actually asked about.
   *
   * IsThereAnyDeal answers only for the ids we send it, so the plain version
   * above would be wrong for it in the worst possible way: every `itad:` row
   * for a game outside tonight's selection would be marked removed, and the
   * next night's selection would re-open it. Scoping the update to the ids we
   * asked about makes "not in the answer" mean what it should.
   *
   * The service is matched by prefix because ITAD names its own subscriptions
   * and can add one on any night; `itad:%` is every service that came from it
   * and nothing this repository defines.
   */
  async closeMissingAvailabilityForItems(
    servicePattern: string,
    region: string,
    seenAt: Date,
    mediaItemIds: readonly string[],
  ): Promise<number> {
    if (mediaItemIds.length === 0) return 0;

    const result = await this.pool.query(
      `update public.game_availability
          set removed_at = $3::timestamptz
        where service like $1
          and region = $2
          and removed_at is null
          and last_seen_at < $3::timestamptz
          and media_item_id = any($4::uuid[])`,
      [servicePattern, region, seenAt.toISOString(), [...mediaItemIds]],
    );
    return result.rowCount ?? 0;
  }

  /**
   * The games the IsThereAnyDeal pass should ask about tonight.
   *
   * The same selection shape as {@link steamScoreTargets}, and for the same
   * reason: ITAD is keyed by Steam app id here, its allowance is finite, and
   * the catalog is far larger than the set anybody will look at. Every game
   * some user tracks comes first, then the most-rated games up to
   * `popularLimit`, then the whole thing is capped at `limit`.
   *
   * Only the two `exists` clauses touch user tables, and they ask whether *any*
   * row exists, never whose. Which services a game is on is a fact about the
   * game.
   *
   * Unlike the Steam scores selection there is no staleness filter: this is one
   * request per 200 games rather than two per game, so the pass asks about the
   * same set every night and the reconciliation gets a complete picture of that
   * set each time. A staleness window would make "not in tonight's answer"
   * ambiguous, which is the one thing {@link closeMissingAvailabilityForItems}
   * must not be.
   */
  async itadTargets(options: { limit: number; popularLimit?: number }): Promise<ItadTarget[]> {
    const result = await this.pool.query<{
      media_item_id: string;
      steam_app_id: string;
      tracked: boolean;
    }>(
      `with steam_games as (
         select m.id,
                (m.external_ids->>'steam')::integer as steam_app_id,
                nullif(m.metadata->>'total_rating_count', '')::numeric as rating_count
           from public.media_items m
          where m.medium = 'game'
            and jsonb_typeof(m.external_ids->'steam') = 'number'
       ),
       tracked as (
         select g.id
           from steam_games g
          where exists (select 1 from public.user_entries e where e.media_item_id = g.id)
             or exists (select 1 from public.ranking_entries r where r.media_item_id = g.id)
       ),
       popular as (
         select g.id
           from steam_games g
          order by g.rating_count desc nulls last, g.id
          limit $1
       )
       select g.id as media_item_id,
              g.steam_app_id,
              (g.id in (select id from tracked)) as tracked
         from steam_games g
        where g.id in (select id from tracked)
           or g.id in (select id from popular)
        order by (g.id in (select id from tracked)) desc,
                 g.rating_count desc nulls last,
                 g.id
        limit $2`,
      [options.popularLimit ?? ITAD_POPULAR_LIMIT, options.limit],
    );

    return result.rows.map((row) => ({
      media_item_id: row.media_item_id,
      steam_app_id: Number(row.steam_app_id),
      tracked: row.tracked,
    }));
  }

  // --- The TMDB mirror -----------------------------------------------------
  // Films and series, docs/design/film-tv-catalog.md. Nothing below touches
  // the game methods above: the two mirrors share `media_items`,
  // `external_scores` and nothing else, and they are keyed differently on
  // purpose. A game's identity lives in `game_details.igdb_id`; a title's
  // lives in `movie_details.tmdb_id` or `tv_details.tmdb_id`, and never in
  // `external_ids`, because the two TMDB id spaces overlap -- a film and a
  // series can share a number -- and one `external_ids->>'tmdb'` would then
  // match two different titles.

  /**
   * Every TMDB id of one medium the catalog already holds.
   *
   * Read through the details table rather than `external_ids` for the reason
   * above. A Set rather than a list because the caller's question is always
   * "is this id one of ours", once per line of a million-line export.
   *
   * It costs a few hundred kilobytes for a catalog of tens of thousands of
   * titles, once a night, which is nothing next to what one batch of upserts
   * moves.
   */
  async tmdbIds(kind: TmdbMedium): Promise<Set<number>> {
    const result = await this.pool.query<{ tmdb_id: string }>(
      `select d.tmdb_id from ${detailsTable(kind)} d`,
    );
    return new Set(result.rows.map((row) => Number(row.tmdb_id)));
  }

  /**
   * The ids of one medium refreshed at or after an instant.
   *
   * What makes `--full` resumable. A full run is the whole discovery set minus
   * the titles this run already reached, so a run that dies at 30,000 titles
   * is resumed by starting it again rather than from a cursor there is nowhere
   * to keep.
   */
  async tmdbFreshIds(kind: TmdbMedium, refreshedSince: Date): Promise<Set<number>> {
    const result = await this.pool.query<{ tmdb_id: string }>(
      `select d.tmdb_id
         from ${detailsTable(kind)} d
         join public.media_items m on m.id = d.media_item_id
        where m.refreshed_at >= $1::timestamptz`,
      [refreshedSince.toISOString()],
    );
    return new Set(result.rows.map((row) => Number(row.tmdb_id)));
  }

  /**
   * The titles the staleness pass should re-fetch, stalest first.
   *
   * This pass is what meets TMDB's six-month cache ceiling (research 2.4):
   * nothing mirrored may go longer than six months without being re-fetched,
   * and refreshing everything older than the default 150 days keeps every row
   * inside that window with a month of slack for a job that fails for a few
   * weeks.
   *
   * Rows carrying {@link TMDB_MISSING_KEY} inside the last
   * {@link TMDB_MISSING_RETRY_DAYS} are skipped, so an id TMDB has deleted
   * costs one request a quarter rather than one a night, and is still tried
   * again eventually because TMDB merges duplicate records and the survivor is
   * sometimes the id we hold.
   *
   * Ordering by `refreshed_at` ascending is the whole of the catch-up story: a
   * run that stops on its budget leaves the rest untouched, so the next run
   * starts exactly where this one left off and nothing can starve.
   */
  async tmdbStaleTargets(options: {
    kind: TmdbMedium;
    staleBefore: Date;
    missingBefore: Date;
    limit: number;
  }): Promise<TmdbStaleTarget[]> {
    const result = await this.pool.query<{ media_item_id: string; tmdb_id: string }>(
      `select m.id as media_item_id, d.tmdb_id
         from ${detailsTable(options.kind)} d
         join public.media_items m on m.id = d.media_item_id
        where m.refreshed_at < $1::timestamptz
          and (m.metadata->>'${TMDB_MISSING_KEY}' is null
               or (m.metadata->>'${TMDB_MISSING_KEY}')::timestamptz < $2::timestamptz)
        order by m.refreshed_at asc, d.tmdb_id
        limit $3`,
      [options.staleBefore.toISOString(), options.missingBefore.toISOString(), options.limit],
    );

    return result.rows.map((row) => ({
      media_item_id: row.media_item_id,
      tmdb_id: Number(row.tmdb_id),
    }));
  }

  /**
   * Refresh `watch_providers` from the two directory responses.
   *
   * Always the first thing a run writes, so no availability row written later
   * can reference a provider the table lacks. A full `do update` here, unlike
   * the stubs a title carries: this is the authoritative copy, and
   * `display_priorities` in particular only ever arrives from here.
   *
   * An upsert and nothing else: a provider missing from today's directory is
   * never deleted. Two reasons, and either alone would settle it.
   * `watch_availability.provider_id` references this table `on delete no
   * action`, so a provider that still has offers cannot be removed and the
   * attempt would abort the run. And a provider vanishing from the directory
   * for a night is what a relay that lags looks like, not a service closing;
   * the offers that name it are closed out by the reconciliation on each
   * title, which is where that judgement belongs.
   */
  async upsertWatchProviders(rows: WatchProviderRow[]): Promise<number> {
    let written = 0;

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const result = await this.pool.query(
        `insert into public.watch_providers
           (provider_id, name, logo_image_id, display_priorities, refreshed_at)
         select r.provider_id, r.name, r.logo_image_id, r.display_priorities, now()
           from jsonb_to_recordset($1::jsonb) as r(
                  provider_id integer,
                  name text,
                  logo_image_id text,
                  display_priorities jsonb
                )
         on conflict (provider_id) do update
           set name = excluded.name,
               logo_image_id = excluded.logo_image_id,
               display_priorities = excluded.display_priorities,
               refreshed_at = excluded.refreshed_at`,
        [JSON.stringify(batch)],
      );
      written += result.rowCount ?? 0;
    }

    return written;
  }

  /**
   * Run `write` over `rows` in slices of {@link BATCH_SIZE}, each slice its
   * own transaction, so a run that dies has committed every batch before the
   * failure and re-running it is a continuation rather than a restart.
   */
  private async inBatchTransactions<T>(
    rows: T[],
    write: (client: pg.PoolClient, batch: T[]) => Promise<void>,
  ): Promise<void> {
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        await write(client, batch);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Write films, {@link BATCH_SIZE} titles to a transaction, one statement
   * per table per batch.
   *
   * What the sync calls. The tables run in the order
   * docs/design/film-tv-catalog.md's "Writes" section sets out, each one
   * covering the whole batch: `media_items`, `movie_details`,
   * `external_scores`, the release-date and certification replacements, the
   * provider stubs, then the availability upsert and close-out. At most ten
   * statements plus `begin` and `commit` per batch, against eight to ten per
   * title on {@link upsertMoviesPerTitle}, which is what the pooler's
   * per-round-trip latency made too slow for a full pull (VER-163).
   */
  async upsertMovies(rows: MappedMovie[], seenAt: Date): Promise<TmdbUpsertCounts> {
    const totals = emptyTmdbCounts();
    await this.inBatchTransactions(dedupeByTmdbId(rows), (client, batch) =>
      writeMovieBatch(client, batch, seenAt, totals),
    );
    return totals;
  }

  /** Write series the same way, with seasons in place of release dates. */
  async upsertShows(rows: MappedTv[], seenAt: Date): Promise<TmdbUpsertCounts> {
    const totals = emptyTmdbCounts();
    await this.inBatchTransactions(dedupeByTmdbId(rows), (client, batch) =>
      writeShowBatch(client, batch, seenAt, totals),
    );
    return totals;
  }

  /**
   * Write films one title at a time: the path the sync used before VER-163.
   *
   * Nothing in the sync calls it any more. It is kept as the reference the
   * batched {@link upsertMovies} is tested against, row for row: from the
   * statements each path sends in `tmdb-db-sql.test.ts`, and from what a real
   * database holds afterwards in `tmdb-live.test.ts`. It can go once the
   * batched path has run a full pull on the hosted project.
   *
   * Each title's statements run in the order docs/design/film-tv-catalog.md's
   * "Writes" section sets out, about eight a title, inside one transaction per
   * {@link BATCH_SIZE} titles.
   */
  async upsertMoviesPerTitle(rows: MappedMovie[], seenAt: Date): Promise<TmdbUpsertCounts> {
    const deduped = dedupeByTmdbId(rows);
    const totals = emptyTmdbCounts();

    for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
      const batch = deduped.slice(start, start + BATCH_SIZE);
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        for (const movie of batch) {
          const mediaItemId = await upsertTmdbMediaItem(client, 'movie', movie.mediaItem);
          totals.mediaItems += 1;

          await client.query(
            `insert into public.movie_details
               (media_item_id, tmdb_id, runtime_minutes, genres, directors, writers,
                top_cast, studio, collection_tmdb_id, collection_name, tagline,
                overview, backdrop_image_id)
             values ($1::uuid, $2, $3, $4::text[], $5::text[], $6::text[], $7::jsonb,
                     $8, $9, $10, $11, $12, $13)
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
            [
              mediaItemId,
              movie.details.tmdb_id,
              movie.details.runtime_minutes,
              movie.details.genres,
              movie.details.directors,
              movie.details.writers,
              JSON.stringify(movie.details.top_cast),
              movie.details.studio,
              movie.details.collection_tmdb_id,
              movie.details.collection_name,
              movie.details.tagline,
              movie.details.overview,
              movie.details.backdrop_image_id,
            ],
          );
          totals.details += 1;

          totals.scores += await upsertTmdbScore(client, mediaItemId, movie.score);

          // Delete then insert: a film's per-region dates and certifications
          // are derived data with no history worth keeping, and a whole
          // replacement is the only way a row TMDB has withdrawn goes away.
          // Scoped to the regions this run asked about, so running with
          // `--regions US` never discards what an earlier `--regions US,GB`
          // stored.
          await client.query(
            `delete from public.media_release_dates
              where media_item_id = $1::uuid and region = any($2::text[])`,
            [mediaItemId, movie.regions],
          );
          if (movie.releaseDates.length > 0) {
            const result = await client.query(
              `insert into public.media_release_dates
                 (media_item_id, region, release_type, released_on, certification, note)
               select $1::uuid, r.region, r.release_type, r.released_on, r.certification, r.note
                 from jsonb_to_recordset($2::jsonb) as r(
                        region text,
                        release_type smallint,
                        released_on date,
                        certification text,
                        note text
                      )`,
              [mediaItemId, JSON.stringify(movie.releaseDates)],
            );
            totals.releaseDates += result.rowCount ?? 0;
          }

          totals.certifications += await replaceCertifications(
            client,
            mediaItemId,
            movie.regions,
            movie.certifications,
          );

          totals.providerStubs += await insertProviderStubs(client, movie.providerStubs);

          const availability = await reconcileAvailability(
            client,
            mediaItemId,
            movie.regions,
            movie.availability,
            seenAt,
          );
          totals.availabilityWritten += availability.written;
          totals.availabilityClosed += availability.closed;
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    return totals;
  }

  /** Write series one title at a time: the reference {@link upsertShows} is tested against. */
  async upsertShowsPerTitle(rows: MappedTv[], seenAt: Date): Promise<TmdbUpsertCounts> {
    const deduped = dedupeByTmdbId(rows);
    const totals = emptyTmdbCounts();

    for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
      const batch = deduped.slice(start, start + BATCH_SIZE);
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        for (const show of batch) {
          const mediaItemId = await upsertTmdbMediaItem(client, 'tv', show.mediaItem);
          totals.mediaItems += 1;

          await client.query(
            `insert into public.tv_details
               (media_item_id, tmdb_id, status, show_type, in_production, first_air_date,
                last_air_date, networks, creators, genres, origin_country, season_count,
                episode_count, episode_runtime_minutes, next_episode_air_date,
                next_episode_season, next_episode_number, next_episode_name,
                last_episode_air_date, last_episode_season, last_episode_number,
                top_cast, overview, backdrop_image_id)
             values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], $10::text[],
                     $11::text[], $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                     $22::jsonb, $23, $24)
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
            [
              mediaItemId,
              show.details.tmdb_id,
              show.details.status,
              show.details.show_type,
              show.details.in_production,
              show.details.first_air_date,
              show.details.last_air_date,
              show.details.networks,
              show.details.creators,
              show.details.genres,
              show.details.origin_country,
              show.details.season_count,
              show.details.episode_count,
              show.details.episode_runtime_minutes,
              show.details.next_episode_air_date,
              show.details.next_episode_season,
              show.details.next_episode_number,
              show.details.next_episode_name,
              show.details.last_episode_air_date,
              show.details.last_episode_season,
              show.details.last_episode_number,
              JSON.stringify(show.details.top_cast),
              show.details.overview,
              show.details.backdrop_image_id,
            ],
          );
          totals.details += 1;

          totals.scores += await upsertTmdbScore(client, mediaItemId, show.score);

          // The whole season list, not a per-region slice: a season TMDB has
          // withdrawn has to disappear, and there is no history here worth
          // keeping.
          await client.query(`delete from public.tv_seasons where media_item_id = $1::uuid`, [
            mediaItemId,
          ]);
          if (show.seasons.length > 0) {
            const result = await client.query(
              `insert into public.tv_seasons
                 (media_item_id, season_number, tmdb_season_id, name, episode_count,
                  air_date, poster_image_id, overview)
               select $1::uuid, r.season_number, r.tmdb_season_id, r.name, r.episode_count,
                      r.air_date, r.poster_image_id, r.overview
                 from jsonb_to_recordset($2::jsonb) as r(
                        season_number integer,
                        tmdb_season_id integer,
                        name text,
                        episode_count integer,
                        air_date date,
                        poster_image_id text,
                        overview text
                      )`,
              [mediaItemId, JSON.stringify(show.seasons)],
            );
            totals.seasons += result.rowCount ?? 0;
          }

          totals.certifications += await replaceCertifications(
            client,
            mediaItemId,
            show.regions,
            show.certifications,
          );

          totals.providerStubs += await insertProviderStubs(client, show.providerStubs);

          const availability = await reconcileAvailability(
            client,
            mediaItemId,
            show.regions,
            show.availability,
            seenAt,
          );
          totals.availabilityWritten += availability.written;
          totals.availabilityClosed += availability.closed;
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    return totals;
  }

  /**
   * Record that TMDB answered 404 for an id the catalog holds.
   *
   * A merge into `metadata`, like every other write to that column, and
   * nothing else: the row keeps its title, its art and whatever a user has
   * done with it. See {@link TMDB_MISSING_KEY}.
   */
  async markTmdbMissing(kind: TmdbMedium, tmdbId: number, at: Date): Promise<number> {
    const result = await this.pool.query(
      `update public.media_items m
          set metadata = m.metadata || jsonb_build_object('${TMDB_MISSING_KEY}', $2::text)
         from ${detailsTable(kind)} d
        where d.tmdb_id = $1
          and m.id = d.media_item_id`,
      [tmdbId, at.toISOString()],
    );
    return result.rowCount ?? 0;
  }

  /**
   * {@link markTmdbMissing} for every id of a batch TMDB answered 404 for, in
   * one statement. What the sync calls, once per batch with any 404s, rather
   * than one round trip per id.
   */
  async markTmdbMissingMany(kind: TmdbMedium, tmdbIds: number[], at: Date): Promise<number> {
    if (tmdbIds.length === 0) return 0;
    const result = await this.pool.query(
      `update public.media_items m
          set metadata = m.metadata || jsonb_build_object('${TMDB_MISSING_KEY}', $2::text)
         from ${detailsTable(kind)} d
        where d.tmdb_id = any($1::integer[])
          and m.id = d.media_item_id`,
      [tmdbIds, at.toISOString()],
    );
    return result.rowCount ?? 0;
  }

  /** How many catalog rows one medium holds, for the run's summary. */
  async mediumRowCount(medium: TmdbMedium): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from public.media_items where medium = $1::public.medium`,
      [medium],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async gameRowCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from public.media_items where medium = 'game'`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async databaseSizeBytes(): Promise<number> {
    const result = await this.pool.query<{ size: string }>(
      'select pg_database_size(current_database())::text as size',
    );
    return Number(result.rows[0]?.size ?? 0);
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
