/**
 * Everything a screen does to one `user_entries` row: status, where it was
 * played, the hand-entered personal fields, and removal.
 *
 * Three things hold for every function here.
 *
 * 1. **No user id, ever.** Row Level Security is the boundary: the policy on
 *    `user_entries` is `auth.uid() = user_id` for all operations, so a read
 *    needs no `user_id` filter and a write cannot name someone else's row. The
 *    one place a user id appears is the insert half of an upsert, where the
 *    column is NOT NULL and has no default; it is read from the session, and
 *    the policy's `with check` rejects it if it is ever wrong.
 *
 * 2. **Every writer upserts.** A screen never has to add the game first.
 *    Touching any fact about a game you do not yet track creates the entry with
 *    the table's default status, `backlog`. That is what makes the add-to sheet
 *    ("writes status without opening the page") and the game page's played-on
 *    chips one call each rather than two.
 *
 * 3. **They throw.** Unlike `auth.ts`, which returns a result because a wrong
 *    password is a normal outcome of a form, a failure here means a bug or a
 *    dead network: the media item does not exist, the session expired, the
 *    platform name is not one the catalog knows. There is no per-case copy for
 *    a screen to write, so the PostgrestError goes up.
 *
 * Ownership is not here. Decision 26 (2026-10-06) took it out of the product:
 * `setOwnedPlatforms` and `Entry.ownedPlatforms` went with the column in
 * 20261007100000_drop_ownership.sql, and where a game was played is the one
 * platform fact an entry keeps.
 *
 * Schema: supabase/migrations/20260909000000_core_schema.sql,
 * 20260915235900_ownership_release_dates.sql (the personal dates),
 * 20260923100000_played_platforms.sql, and 20261007100000_drop_ownership.sql.
 */

import type { EntryStatus } from '@verso/core';
import type { Client } from './client';
import type { Database } from './database.types';

type UserEntryRow = Database['public']['Tables']['user_entries']['Row'];
type UserEntryInsert = Database['public']['Tables']['user_entries']['Insert'];

/**
 * The fields of an entry a writer here may set. `user_id` and `media_item_id`
 * are not among them, and neither is `backlog_position`: adding to and leaving
 * the backlog is a one-column write on `status`, and the trigger does the rest.
 */
type EntryPatch = Omit<
  UserEntryInsert,
  'user_id' | 'media_item_id' | 'id' | 'added_at' | 'backlog_position'
>;

/**
 * One tracked game, as the screens see it.
 *
 * No `userId`: RLS means every row that reaches here is the caller's, and
 * carrying the id would only invite a screen to filter on something the
 * database has already decided.
 *
 * Dates come back as the database spells them: `addedAt` and `startedAt` are
 * ISO timestamps, `finishedAt` and `purchasedAt` are `YYYY-MM-DD`, because
 * nobody remembers the hour they bought a game.
 */
export interface Entry {
  id: string;
  mediaItemId: string;
  status: EntryStatus;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  purchasedAt: string | null;
  notes: string | null;
  playtimeMinutes: number | null;
  /**
   * Where the number came from. Read as free text, because the column is free
   * text and a row may have been written by an importer this package does not
   * know about; written only as a `PlaytimeSource`.
   */
  playtimeSource: string | null;
  /**
   * Where the caller played it, spelled and ordered like `game_details.platforms`.
   * Empty means not recorded, which is every entry written before the question
   * was asked and every one where it was skipped; it never means "not played".
   * Decision 19: a ranked game was played, and on these platforms. A Steam
   * import adds PC for a game with Steam playtime.
   */
  playedPlatforms: string[];
  /**
   * The user's own place for this game in their backlog, 0 first, or null when
   * the status is not `backlog`. Maintained by trigger and by
   * `moveBacklogEntry`; nothing here ever writes it.
   */
  backlogPosition: number | null;
  /**
   * The day the caller is going to see this film, `YYYY-MM-DD`, or null: the
   * ticketed date on the movies Calendar ("Going Fri Oct 24"). A date, not a
   * status. Written by `setPlannedOn`; cleared by the database when a diary row
   * lands on or after it (`logWatch` in diary.ts).
   */
  plannedOn: string | null;
}

/**
 * Where a playtime figure came from. "Playtime, started date, and purchased
 * date are always enterable by hand. Imported values (Steam) fill them when
 * available and say so" (docs/design/ui-principles.md, "Data honesty"), so the
 * source is stored with the number and never guessed.
 */
export type PlaytimeSource = 'manual' | 'steam';

/** Thrown when a write needs the signed-in user's id and there is no session. */
export class NotSignedInError extends Error {
  constructor(action: string) {
    super(`${action} needs a signed-in user`);
    this.name = 'NotSignedInError';
  }
}

/**
 * Thrown by `setPlayedPlatforms` for a platform the catalog does not list for
 * this game. The game page marks the played-on platforms by intersecting two
 * `text[]` with no lookup table (see the migrations), so a name that is not in
 * `game_details.platforms` would be stored and then never displayed again.
 */
export class UnknownPlatformError extends Error {
  /** The names that were refused. */
  readonly unknown: string[];
  /** What the catalog does list for this game, for a screen that wants to offer them. */
  readonly known: string[];

  constructor(unknown: string[], known: string[]) {
    super(`not a platform this game is on: ${unknown.join(', ')}`);
    this.name = 'UnknownPlatformError';
    this.unknown = unknown;
    this.known = known;
  }
}

/**
 * Today as `YYYY-MM-DD` in the device's own timezone.
 *
 * Not `toISOString().slice(0, 10)`, which is UTC: for anyone west of Greenwich
 * that spells yesterday all evening, and "I finished this" stamping the wrong
 * day is the kind of quiet wrongness rule 9 is about. The `date` columns and
 * the Upcoming split both mean a calendar day where the user is standing.
 */
export function todayLocal(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Turn a `user_entries` row into the shape the screens use. */
export function toEntry(row: UserEntryRow): Entry {
  return {
    id: row.id,
    mediaItemId: row.media_item_id,
    status: row.status,
    addedAt: row.added_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    purchasedAt: row.purchased_at,
    notes: row.notes,
    playtimeMinutes: row.playtime_minutes,
    playtimeSource: row.playtime_source,
    playedPlatforms: row.played_platforms,
    backlogPosition: row.backlog_position,
    plannedOn: row.planned_on,
  };
}

/**
 * The signed-in user's id, for the insert half of an upsert.
 *
 * Reads the stored session rather than calling `auth.getUser()`, which is a
 * network round trip on every write. The usual warning about trusting a stored
 * session does not apply: this id is not an authorization decision, it is a
 * column value, and `with check (auth.uid() = user_id)` on the table rejects
 * the row if it disagrees with the token the request actually carries.
 */
async function currentUserId(client: Client, action: string): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  if (!id) throw new NotSignedInError(action);
  return id;
}

/** Create or update the caller's entry for one media item and return the whole row. */
async function writeEntry(
  client: Client,
  mediaItemId: string,
  patch: EntryPatch,
  action: string,
): Promise<Entry> {
  const userId = await currentUserId(client, action);
  const { data, error } = await client
    .from('user_entries')
    .upsert(
      { ...patch, user_id: userId, media_item_id: mediaItemId },
      { onConflict: 'user_id,media_item_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return toEntry(data);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, field: string): void {
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new RangeError(`${field} must be a calendar date as YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
}

/** The caller's entry for one media item, or null if they do not track it. */
export async function getEntry(client: Client, mediaItemId: string): Promise<Entry | null> {
  const { data, error } = await client
    .from('user_entries')
    .select('*')
    .eq('media_item_id', mediaItemId)
    .maybeSingle();
  if (error) throw error;
  return data ? toEntry(data) : null;
}

/**
 * Set the status, creating the entry if there is none.
 *
 * `started_at` is deliberately not in the payload: the
 * `user_entries_stamp_started_at` trigger stamps it on the first move to
 * `playing` and never overwrites a value that is already there. Sending one
 * here would take that decision away from the database and out of one tuple.
 */
export async function setStatus(
  client: Client,
  mediaItemId: string,
  status: EntryStatus,
): Promise<Entry> {
  return writeEntry(client, mediaItemId, { status }, 'setStatus');
}

/** What the tier sheet needs to know after "I finished this". */
export interface MarkFinishedResult {
  entry: Entry;
  /**
   * Whether this item is already in the caller's ranked list. The sheet opens
   * on "rank it" when false and on "already ranked" when true, and it is the
   * one fact it cannot get from the entry: status and ranking are separate
   * (you can finish a game and never rank it).
   */
  alreadyRanked: boolean;
}

export interface MarkFinishedOptions {
  /** The day it was finished, `YYYY-MM-DD`. Defaults to today where the user is. */
  finishedAt?: string;
}

/**
 * "I finished this", from the game page's primary button or Home's long press.
 *
 * The ranked check runs alongside the write rather than after it, so the sheet
 * pays one round trip of latency instead of two.
 */
export async function markFinished(
  client: Client,
  mediaItemId: string,
  options: MarkFinishedOptions = {},
): Promise<MarkFinishedResult> {
  const finishedAt = options.finishedAt ?? todayLocal();
  assertDate(finishedAt, 'finishedAt');

  const [entry, alreadyRanked] = await Promise.all([
    writeEntry(client, mediaItemId, { status: 'played', finished_at: finishedAt }, 'markFinished'),
    isRanked(client, mediaItemId),
  ]);

  return { entry, alreadyRanked };
}

/** Whether the caller has ranked this item. */
async function isRanked(client: Client, mediaItemId: string): Promise<boolean> {
  const { data, error } = await client
    .from('ranking_entries')
    .select('media_item_id')
    .eq('media_item_id', mediaItemId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Home's long press, third item.
 *
 * Only the status changes. A `finished_at` that is already there stays: it
 * records a day that really happened, and moving a game back to the backlog
 * does not unhappen it. Unranking, likewise, is `removeRankingEntry`'s job —
 * the backlog never touches ranking.
 */
export async function moveToBacklog(client: Client, mediaItemId: string): Promise<Entry> {
  return writeEntry(client, mediaItemId, { status: 'backlog' }, 'moveToBacklog');
}

/**
 * Set the platforms the caller played this game on (decision 19: a ranked game
 * was played, on these platforms). An empty array clears the list.
 *
 * The database applies the rules: names match `game_details.platforms` without
 * regard to case, because the game page marks the platforms by intersecting
 * the two arrays and "playstation 5" would never match "PlayStation 5"; they
 * are stored in the catalog's spelling and order, so the chips do not jump
 * around; and a name the catalog does not list for this game refuses the whole
 * write with `UnknownPlatformError` carrying both lists. Like every writer in
 * this file it creates the entry, as `backlog`, if the caller does not track
 * the game yet. It says nothing about status and does not change one.
 *
 * One round trip: `set_played_platforms` reads the catalog and writes the entry
 * in one call (supabase/migrations/20260923100000_played_platforms.sql).
 */
export async function setPlayedPlatforms(
  client: Client,
  mediaItemId: string,
  platforms: readonly string[],
): Promise<Entry> {
  const { data, error } = await client.rpc('set_played_platforms', {
    p_media_item_id: mediaItemId,
    p_platforms: [...platforms],
  });
  if (error) throw unknownPlatformFrom(error) ?? error;
  return toEntry(data);
}

/**
 * The database's refusal of a platform name, as `UnknownPlatformError`.
 * `set_played_platforms` raises 22023 with a DETAIL of
 * `{"unknown": [...], "known": [...]}`; anything else, including a 22023
 * without that detail, is not this error and is left alone.
 */
function unknownPlatformFrom(error: { code?: string; details?: string | null }): UnknownPlatformError | null {
  if (error.code !== '22023' || !error.details) return null;
  let detail: unknown;
  try {
    detail = JSON.parse(error.details);
  } catch {
    return null;
  }
  if (typeof detail !== 'object' || detail === null) return null;
  const { unknown, known } = detail as { unknown?: unknown; known?: unknown };
  if (!Array.isArray(unknown) || !Array.isArray(known)) return null;
  // A null name refused by the database comes back as JSON null; spell it the
  // way the message does rather than hand a screen a null in a string[].
  return new UnknownPlatformError(
    unknown.map((name) => (typeof name === 'string' ? name : '(null)')),
    known.filter((name): name is string => typeof name === 'string'),
  );
}

/**
 * Record hours played by hand, or clear them.
 *
 * `null` erases both the number and its source: a wrong figure has to be
 * removable, and a source with no number would be a claim about nothing.
 */
export async function logPlaytime(
  client: Client,
  mediaItemId: string,
  minutes: number | null,
  source: PlaytimeSource = 'manual',
): Promise<Entry> {
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0)) {
    throw new RangeError(`playtime must be a whole number of minutes, 0 or more, got ${minutes}`);
  }
  return writeEntry(
    client,
    mediaItemId,
    { playtime_minutes: minutes, playtime_source: minutes === null ? null : source },
    'logPlaytime',
  );
}

/** When the caller bought this, `YYYY-MM-DD`, or null to clear it. Hand-entered only. */
export async function setPurchasedAt(
  client: Client,
  mediaItemId: string,
  purchasedAt: string | null,
): Promise<Entry> {
  if (purchasedAt !== null) assertDate(purchasedAt, 'purchasedAt');
  return writeEntry(client, mediaItemId, { purchased_at: purchasedAt }, 'setPurchasedAt');
}

/**
 * "Going?" on the movie page and the Calendar: the day the caller is going to
 * see this film, `YYYY-MM-DD`, or null to clear it. Like every writer here it
 * creates the entry, as want to watch, if the caller does not track the film
 * yet, which is what puts an untracked film on the Calendar. The database
 * clears the day by itself when a diary row lands on or after it, so the
 * screen never has to after "I watched this".
 */
export async function setPlannedOn(
  client: Client,
  mediaItemId: string,
  plannedOn: string | null,
): Promise<Entry> {
  if (plannedOn !== null) assertDate(plannedOn, 'plannedOn');
  return writeEntry(client, mediaItemId, { planned_on: plannedOn }, 'setPlannedOn');
}

/**
 * Correct the started date, or clear it.
 *
 * The trigger stamps this on the first move to `playing` and then keeps its
 * hands off, including here: clearing the date on a game you are already
 * playing leaves it cleared, because the trigger only fires on the transition
 * into `playing`, not on every edit. Takes an ISO timestamp, since it is a
 * `timestamptz`.
 */
export async function setStartedAt(
  client: Client,
  mediaItemId: string,
  startedAt: string | null,
): Promise<Entry> {
  if (startedAt !== null && Number.isNaN(Date.parse(startedAt))) {
    throw new RangeError(`startedAt must be an ISO timestamp, got ${JSON.stringify(startedAt)}`);
  }
  return writeEntry(client, mediaItemId, { started_at: startedAt }, 'setStartedAt');
}

/**
 * Set or clear the note. Blank is stored as null, not as an empty string, so
 * "hide what is empty" (rule 20) is one null check everywhere rather than a
 * null check and a length check.
 */
export async function setNotes(
  client: Client,
  mediaItemId: string,
  notes: string | null,
): Promise<Entry> {
  const trimmed = notes?.trim();
  return writeEntry(client, mediaItemId, { notes: trimmed ? trimmed : null }, 'setNotes');
}

/**
 * Stop tracking this game. Idempotent: removing an entry that is not there is
 * not an error, because the screen that asked has already forgotten it.
 *
 * The ranking, if there is one, survives. Unranking is a separate, deliberate
 * act (`removeRankingEntry`), and the comparison log behind it is append-only.
 */
export async function removeEntry(client: Client, mediaItemId: string): Promise<void> {
  const { error } = await client.from('user_entries').delete().eq('media_item_id', mediaItemId);
  if (error) throw error;
}
