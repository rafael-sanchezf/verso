/**
 * The diary: one row each time the caller watched a film
 * (supabase/migrations/20261008200000_watch_log.sql;
 * docs/design/movies-brief.md, "The log sheet").
 *
 * Logging a watch is the film's "I finished this". The database does the
 * rest in the same statement: the first row creates or moves the caller's
 * entry to played, and `finished_at` on the entry mirrors the latest
 * `watchedOn`, so every read that already shows a finished date stays right.
 * Watched is not ranked (rule 35): nothing here touches the ranked list, and
 * "Save and rank" is the tier sheet's job after `logWatch` returns.
 *
 * Like `entries.ts`, no function takes a user id: Row Level Security on
 * `watch_log` is owner-only, and `user_id` comes from the token's default, not
 * from the client. They throw the PostgrestError, because a failure is a bug
 * or a dead network: a game or a series (22023, the diary is for films while TV
 * is held), an unknown film (23503), an expired session.
 */

import type { Client } from './client';
import type { Database, Json } from './database.types';
import { getEntry, removeEntry, todayLocal, type Entry } from './entries';

type WatchLogRow = Database['public']['Tables']['watch_log']['Row'];

/**
 * How a diary row was written (20261013100000_movie_screens.sql): `log` from
 * the log sheet, always dated; `bulk` from the bulk deck's seen check ("Seen
 * before Verso"), with no day; `import` from a Letterboxd export, dated when
 * the export has one. Profile reads "Watched X" for a dated `log` row and
 * "Ranked X" for the rest (profile-brief, round two).
 */
export type WatchSource = 'log' | 'bulk' | 'import';

/** The two places that are not a streaming service. Anything else is the service's name as the sheet showed it. */
export const WATCH_PLACE_THEATER = 'theater';
export const WATCH_PLACE_OTHER = 'other';

/** One diary row. */
export interface DiaryRow {
  id: string;
  mediaItemId: string;
  /** `YYYY-MM-DD`, the day where the user was; null only on a `bulk` or `import` row with no day. */
  watchedOn: string | null;
  /** How the row was written; see `WatchSource`. */
  source: WatchSource;
  /**
   * A streaming service's name as the log sheet's chip showed it ("Netflix"),
   * `'theater'`, `'other'`, or null when the user did not say.
   */
  place: string | null;
  /** "What stood out?", or null. Never blank: the database trims and stores blank as null. */
  note: string | null;
  /** When the row was written, an ISO timestamp; the tie-break after `watchedOn`. */
  createdAt: string;
}

/** One row of the diary as a list, with the film beside it. */
export interface DiaryListRow extends DiaryRow {
  title: string;
  year: number | null;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the row to `coverCandidates`; see covers.ts. */
  externalIds: Json;
}

export interface LogWatchOptions {
  /** `YYYY-MM-DD`. Defaults to today where the user is (`todayLocal`), never the server's UTC date. */
  watchedOn?: string;
  /** See `DiaryRow.place`. Blank is stored as null. */
  place?: string | null;
  /** Blank is stored as null. */
  note?: string | null;
}

/** What the log sheet needs after Save. */
export interface LogWatchResult {
  watch: DiaryRow;
  /** The caller's entry as the trigger left it: played, `finishedAt` on the latest watch. */
  entry: Entry;
  /**
   * Whether the film is already in the ranked list. "Save and rank" opens the
   * tier sheet when false; a rewatch of a ranked film skips it.
   */
  alreadyRanked: boolean;
}

/** The patch `editWatch` takes. An absent key is left alone. */
export interface WatchPatch {
  watchedOn?: string;
  place?: string | null;
  note?: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, field: string): void {
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new RangeError(`${field} must be a calendar date as YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
}

function toDiaryRow(row: WatchLogRow): DiaryRow {
  return {
    id: row.id,
    mediaItemId: row.media_item_id,
    watchedOn: row.watched_on,
    source: row.source as WatchSource,
    place: row.place,
    note: row.note,
    createdAt: row.created_at,
  };
}

/**
 * "I watched this": write a diary row, which makes the film played (creating
 * the entry if the caller did not track it) with `finishedAt` on the latest
 * watch. A second call for the same film is a rewatch, a second row.
 *
 * The ranked check runs alongside the write, since the diary never changes
 * the ranked list; the entry is read after it, because the trigger writes it.
 */
export async function logWatch(
  client: Client,
  mediaItemId: string,
  options: LogWatchOptions = {},
): Promise<LogWatchResult> {
  const watchedOn = options.watchedOn ?? todayLocal();
  assertDate(watchedOn, 'watchedOn');

  const insert = client
    .from('watch_log')
    .insert({
      media_item_id: mediaItemId,
      watched_on: watchedOn,
      source: 'log',
      place: options.place ?? null,
      note: options.note ?? null,
    })
    .select('*')
    .single();
  const ranked = client.from('ranking_entries').select('media_item_id').eq('media_item_id', mediaItemId).maybeSingle();

  const [written, rankedResult] = await Promise.all([insert, ranked]);
  if (written.error) throw written.error;
  if (rankedResult.error) throw rankedResult.error;

  const entry = await getEntry(client, mediaItemId);
  // The trigger wrote it in the same statement as the row, so an entry that is
  // not there is a broken database, not a case for a screen.
  if (!entry) throw new Error(`no entry for ${mediaItemId} after logging a watch`);

  return { watch: toDiaryRow(written.data), entry, alreadyRanked: rankedResult.data !== null };
}

/**
 * "Seen before Verso": the bulk deck's seen check. Writes a `bulk` diary row
 * with no day, which makes the film played (creating the entry if the caller
 * did not track it) and leaves `finishedAt` as it was, because nothing says
 * when it was watched. Nothing is ranked (rule 35); the deck's session ranks
 * it. Returns the same shape as `logWatch`.
 *
 * Idempotent: a film has at most one bulk row (`watch_log_one_bulk_row`), so
 * a second tick, a retry or a double tap returns the row already there and
 * writes nothing.
 */
export async function logSeen(client: Client, mediaItemId: string): Promise<LogWatchResult> {
  const ranked = client.from('ranking_entries').select('media_item_id').eq('media_item_id', mediaItemId).maybeSingle();

  let watch: WatchLogRow;
  const written = await client
    .from('watch_log')
    .insert({ media_item_id: mediaItemId, watched_on: null, source: 'bulk' })
    .select('*')
    .single();
  if (written.error) {
    // 23505 is the partial unique index: already seen. Read the row back
    // rather than upserting, because PostgREST's on_conflict cannot name a
    // partial index's predicate.
    if (written.error.code !== '23505') throw written.error;
    const existing = await client
      .from('watch_log')
      .select('*')
      .eq('media_item_id', mediaItemId)
      .eq('source', 'bulk')
      .single();
    if (existing.error) throw existing.error;
    watch = existing.data;
  } else {
    watch = written.data;
  }

  const rankedResult = await ranked;
  if (rankedResult.error) throw rankedResult.error;

  const entry = await getEntry(client, mediaItemId);
  if (!entry) throw new Error(`no entry for ${mediaItemId} after marking it seen`);

  return { watch: toDiaryRow(watch), entry, alreadyRanked: rankedResult.data !== null };
}

/**
 * Change a diary row's day, place or note ("Watched Sep 2 · Netflix ·
 * Change"). A new day moves the entry's `finishedAt` with it when this is the
 * latest watch. Throws when the row is not the caller's or does not exist,
 * because the screen that offered the edit drew it a moment ago.
 */
export async function editWatch(client: Client, watchId: string, patch: WatchPatch): Promise<DiaryRow> {
  const update: Database['public']['Tables']['watch_log']['Update'] = {};
  if (patch.watchedOn !== undefined) {
    assertDate(patch.watchedOn, 'watchedOn');
    update.watched_on = patch.watchedOn;
  }
  if ('place' in patch) update.place = patch.place ?? null;
  if ('note' in patch) update.note = patch.note ?? null;

  if (Object.keys(update).length === 0) {
    const { data, error } = await client.from('watch_log').select('*').eq('id', watchId).single();
    if (error) throw error;
    return toDiaryRow(data);
  }

  const { data, error } = await client.from('watch_log').update(update).eq('id', watchId).select('*').single();
  if (error) throw error;
  return toDiaryRow(data);
}

/**
 * Delete one diary row. Idempotent, like `removeEntry`. The entry's
 * `finishedAt` falls back to the latest watch that remains, or null; the film
 * stays watched, because a film can be watched with no row at all.
 */
export async function removeWatch(client: Client, watchId: string): Promise<void> {
  const { error } = await client.from('watch_log').delete().eq('id', watchId);
  if (error) throw error;
}

/**
 * Stop tracking a film, diary and all: the movie page's "Remove from library".
 *
 * `removeEntry` alone leaves the `watch_log` rows, and a film with a diary
 * row still reads "Watched Sep 2" on its page, so the rows go first (owner
 * only, under the table's delete policy), then the entry. Two statements, not
 * a transaction: if the second fails the film is untracked of its diary but
 * still listed, and a retry finishes the job, since both deletes are
 * idempotent. The ranking, if there is one, survives, as with `removeEntry`.
 */
export async function removeMovieEntry(client: Client, mediaItemId: string): Promise<void> {
  const { error } = await client.from('watch_log').delete().eq('media_item_id', mediaItemId);
  if (error) throw error;
  await removeEntry(client, mediaItemId);
}

/**
 * One film's diary, newest first, undated rows last: the movie page's
 * "Watched 2× · last Sep 2 ›" and the rows behind it, and the log sheet's
 * "2nd watch" line (the length of this plus one).
 */
export async function diaryFor(client: Client, mediaItemId: string): Promise<DiaryRow[]> {
  const { data, error } = await client
    .from('watch_log')
    .select('*')
    .eq('media_item_id', mediaItemId)
    .order('watched_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toDiaryRow);
}

export interface DiaryOptions {
  /** Cap the list: three for Profile's recent rows, nothing for "See all". */
  limit?: number;
}

/**
 * The caller's diary, newest first and undated rows last, each row with its
 * film: Profile's recent rows ("Dune · Sep 2 · Netflix") and the full diary
 * grouped by month.
 */
export async function diary(client: Client, options: DiaryOptions = {}): Promise<DiaryListRow[]> {
  let query = client
    .from('watch_log')
    .select('*, media_items!inner ( title, year, cover_image_id, external_ids )')
    .order('watched_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (options.limit !== undefined) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (
    data as unknown as (WatchLogRow & {
      media_items: { title: string; year: number | null; cover_image_id: string | null; external_ids: Json };
    })[]
  ).map((row) => ({
    ...toDiaryRow(row),
    title: row.media_items.title,
    year: row.media_items.year,
    coverImageId: row.media_items.cover_image_id,
    externalIds: row.media_items.external_ids,
  }));
}
