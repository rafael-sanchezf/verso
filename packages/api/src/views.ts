/**
 * The read models behind the screens: Home's three blocks, the Next tab's two
 * segments, and the game page.
 *
 * Named for what they are rather than for one screen, because two of them feed
 * two screens each: `backlog()` is the Next tab's first segment and `upNext()`
 * is the first three rows of the same list on Home, and `upcoming()` and
 * `comingUp()` are the same pair for unreleased games.
 *
 * Each returns plain objects with the entry already joined to its catalog row.
 * No caller should ever have to reach into `row.media_items.game_details[0]`;
 * that unpicking happens once, here, where it can be got right.
 *
 * Three decisions worth knowing before reading the queries:
 *
 * **Upcoming is derived, not stored.** There is no wishlist status. A backlog
 * game whose `release_date` is in the future is upcoming, and on its release
 * day it becomes an ordinary backlog game with no write from anyone. Which is
 * why every query here that splits the backlog compares against today's date
 * rather than reading a column. See the head of
 * supabase/migrations/20260915235900_ownership_release_dates.sql.
 *
 * **A missing release date means "released".** IGDB omits the date for
 * announced games, but it also omits it for plenty of old ones, and a game with
 * no date cannot be ordered in a list that is ordered by date. Undated games
 * therefore sit in the backlog, where the user can see and act on them, rather
 * than in an Upcoming list that claims they are unreleased.
 *
 * **Every list is scoped to one medium.** The app is always in exactly one
 * medium with hard walls between media (ROADMAP.md, decision 8), so each list
 * here takes `options.medium` and defaults to `'game'`, which is the only
 * medium V0 exposes. The filter rides on the `media_items!inner` join that is
 * already there rather than on `user_entries.medium`, which
 * supabase/migrations/20260916230000_per_medium_backlog_and_rpcs.sql added:
 * the join is needed for the title and the cover either way, so filtering
 * through it costs nothing and the column stays what it was added to be, the
 * key the backlog is numbered and indexed by. `profile.ts` counts the same rows
 * the same way, and the two have to move together or the Profile stats row
 * would count a film above a list of games.
 */

import { scoreForPosition, type Medium, type Tier } from '@verso/core';
import type { Client } from './client';
import type { Database, Json } from './database.types';
import { todayLocal, toEntry, type Entry } from './entries';

type UserEntryRow = Database['public']['Tables']['user_entries']['Row'];

/**
 * IGDB's three averages for finishing a game, in seconds. Always present, with
 * nulls inside: the game page shows one figure with the other two behind a tap
 * (`normallySeconds` is the one it shows), and a game the catalog has no
 * figures for still has the shape, so a screen writes one null check.
 */
export interface TimeToBeat {
  /** To the credits, skipping the extras. */
  hastilySeconds: number | null;
  /** To the credits with some extras. The single figure the game page shows. */
  normallySeconds: number | null;
  /** To 100%. */
  completelySeconds: number | null;
}

/** One row of a list on Home or the Next tab: a tracked game and the catalog facts beside it. */
export interface EntryRow {
  mediaItemId: string;
  title: string;
  year: number | null;
  coverImageId: string | null;
  /** The full date, where the catalog has one. `year` is the display form of the same fact. */
  releaseDate: string | null;
  /** `media_items.external_ids`. Pass the row to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  genres: string[];
  platforms: string[];
  timeToBeat: TimeToBeat;
  entry: Entry;
}

/**
 * One platform the game is on, and whether the caller played it there
 * (decision 19). Ownership was the other flag here until decision 26 took it
 * out of the product; the type was `PlatformOwnership` then.
 */
export interface PlatformPlayed {
  name: string;
  played: boolean;
}

/** One published score, as `external_scores` stores it. */
export interface ExternalScore {
  source: string;
  /** For `steam` this is the percentage of reviews that are positive, not a rating out of 100. */
  score: number | null;
  /** How many reviews or critics are behind it. Null where the source does not say. */
  scoreCount: number | null;
  fetchedAt: string;
}

/**
 * The score sources `packages/catalog` writes. `steam`'s score is the percent
 * of positive reviews and its count is the total number of them; `metacritic`
 * carries a score and no count; `opencritic` is OpenCritic's Top Critic
 * average over `numTopCriticReviews` outlets, and `opencritic_recommended` is
 * the share of those same critics who recommend the game, over the same count.
 * `tmdb` is TMDB's 0-10 user average times ten, so that it shares the 0-100
 * scale the rest of this table uses, and its count is `vote_count`; a screen
 * divides it by ten again and labels it "TMDB".
 *
 * Rule 21, one scoreboard per source: a screen picks a source and labels it,
 * and never averages two of them into a number nobody published. That is why
 * OpenCritic's two figures are two sources and not one row with two columns:
 * "they averaged 94" and "97% of them recommend it" are different claims, and
 * a screen showing either has to say which.
 */
export type ScoreSource =
  | 'igdb_critics'
  | 'igdb_users'
  | 'steam'
  | 'metacritic'
  | 'opencritic'
  | 'opencritic_recommended'
  | 'tmdb';

/**
 * Scores keyed by source. `external_scores` is keyed by (media item, source),
 * so there is at most one of each. A source this package has not heard of still
 * appears under its own name rather than being dropped.
 */
export type ScoresBySource = Partial<Record<ScoreSource, ExternalScore>> & {
  [source: string]: ExternalScore | undefined;
};

/** The catalog's game-specific facts, with played-on already resolved against them. */
export interface GameFacts {
  igdbId: number;
  developer: string | null;
  summary: string | null;
  genres: string[];
  /**
   * Every platform the game is on, in catalog order, each marked with whether
   * the caller played it there. The same list is on `GamePage.entry` as
   * `playedPlatforms`.
   */
  platforms: PlatformPlayed[];
  timeToBeat: TimeToBeat;
}

/** Where the caller's own score comes from: the ranked list, not the entry. */
export interface RankingPlacement {
  tier: Tier;
  /** 0 is the best item in the tier. */
  position: number;
  /** How many items are in that tier, which is what turns a position into a score. */
  tierSize: number;
  /** The derived 0-10 score. Never stored; see `scoreForPosition` in @verso/core. */
  score: number;
}

/** Everything the game page renders, in one object. */
export interface GamePage {
  mediaItemId: string;
  medium: Medium;
  title: string;
  year: number | null;
  coverImageId: string | null;
  releaseDate: string | null;
  /** `media_items.external_ids`. Pass the page to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  /** Null for a media item with no `game_details` row, which for a game means the mirror has not reached it. */
  game: GameFacts | null;
  scores: ScoresBySource;
  /**
   * Null when the caller does not track this game. Carries `playedPlatforms` in
   * catalog order; `game.platforms` has the same fact as a flag per platform.
   */
  entry: Entry | null;
  /** Null until the caller has ranked it. Rule 21: the "You" score is hidden until then. */
  ranking: RankingPlacement | null;
}

/**
 * The entry columns plus the catalog row behind them.
 *
 * `media_items!inner` rather than a plain embed, because the filters below act
 * on `release_date`, and a filter on an embedded table only empties the embed
 * unless the join is inner, in which case it drops the parent row too. Which is
 * what "a backlog game that has not come out" has to mean.
 */
const ENTRY_ROW_SELECT = `
  *,
  media_items!inner (
    id, title, year, cover_image_id, release_date, external_ids,
    game_details (
      genres, platforms,
      time_to_beat_hastily_seconds, time_to_beat_normally_seconds, time_to_beat_completely_seconds
    )
  )
` as const;

interface JoinedRow extends UserEntryRow {
  media_items: {
    id: string;
    title: string;
    year: number | null;
    cover_image_id: string | null;
    release_date: string | null;
    external_ids: Json;
    game_details: {
      genres: string[];
      platforms: string[];
      time_to_beat_hastily_seconds: number | null;
      time_to_beat_normally_seconds: number | null;
      time_to_beat_completely_seconds: number | null;
    } | null;
  };
}

function toTimeToBeat(details: {
  time_to_beat_hastily_seconds: number | null;
  time_to_beat_normally_seconds: number | null;
  time_to_beat_completely_seconds: number | null;
} | null): TimeToBeat {
  return {
    hastilySeconds: details?.time_to_beat_hastily_seconds ?? null,
    normallySeconds: details?.time_to_beat_normally_seconds ?? null,
    completelySeconds: details?.time_to_beat_completely_seconds ?? null,
  };
}

function toEntryRow(row: JoinedRow): EntryRow {
  const item = row.media_items;
  return {
    mediaItemId: item.id,
    title: item.title,
    year: item.year,
    coverImageId: item.cover_image_id,
    releaseDate: item.release_date,
    externalIds: item.external_ids,
    genres: item.game_details?.genres ?? [],
    platforms: item.game_details?.platforms ?? [],
    timeToBeat: toTimeToBeat(item.game_details ?? null),
    entry: toEntry(row),
  };
}

export interface ListOptions {
  /** Cap the list. Omitted means everything the caller has. */
  limit?: number;
  /** Which medium to list. Defaults to `'game'`, the only one V0 exposes. */
  medium?: Medium;
  /**
   * Treat this `YYYY-MM-DD` as today when splitting released from unreleased.
   * For tests; the default is the device's own date.
   */
  today?: string;
}

/**
 * Games the caller is playing now, most recently started first.
 *
 * Home's first block: one hero plus smaller tiles. Ties, and the entries whose
 * started date has been cleared by hand, fall back to most recently added, so
 * the hero is stable rather than arbitrary.
 */
export async function playing(client: Client, options: ListOptions = {}): Promise<EntryRow[]> {
  let query = client
    .from('user_entries')
    .select(ENTRY_ROW_SELECT)
    .eq('status', 'playing')
    .eq('media_items.medium', options.medium ?? 'game')
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('added_at', { ascending: false });
  if (options.limit !== undefined) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as JoinedRow[]).map(toEntryRow);
}

/**
 * The backlog: every released game the caller means to play, plus the ones the
 * catalog has no date for.
 *
 * In the user's own order. "Order belongs to the user" (rule 11), so this reads
 * `backlog_position`, which the trigger in
 * supabase/migrations/20260916003100_backlog_ordering.sql appends to and
 * `move_backlog_entry` renumbers when the drag handle is used. That column
 * allows gaps, so its comment names the ordering to read it by:
 * `(backlog_position, added_at)`, which is what this is.
 *
 * **The order is per medium, and so is this list.** The unique index is
 * `(user_id, medium, backlog_position)` and `move_backlog_entry` renumbers only
 * the moved entry's own medium
 * (supabase/migrations/20260916230000_per_medium_backlog_and_rpcs.sql, which
 * replaced the per-user numbering this read used to have to work around). The
 * positions that come back are therefore a dense 0-based sequence of this
 * medium alone, and the index a drag sends is an index into exactly the list
 * the user is looking at.
 */
export async function backlog(client: Client, options: ListOptions = {}): Promise<EntryRow[]> {
  const today = options.today ?? todayLocal();
  let query = client
    .from('user_entries')
    .select(ENTRY_ROW_SELECT)
    .eq('status', 'backlog')
    .eq('media_items.medium', options.medium ?? 'game')
    .or(`release_date.is.null,release_date.lte.${today}`, { referencedTable: 'media_items' })
    .order('backlog_position', { ascending: true, nullsFirst: false })
    .order('added_at', { ascending: true });
  if (options.limit !== undefined) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as JoinedRow[]).map(toEntryRow);
}

/**
 * Unreleased backlog games, soonest first: the Next tab's second segment.
 *
 * Ordering happens in the database, on `media_items(release_date)`, which
 * PostgREST allows for a to-one embed and which the
 * `media_items_medium_release_date` index covers. Sorting here instead would
 * make any `limit` meaningless.
 */
export async function upcoming(client: Client, options: ListOptions = {}): Promise<EntryRow[]> {
  const today = options.today ?? todayLocal();
  let query = client
    .from('user_entries')
    .select(ENTRY_ROW_SELECT)
    .eq('status', 'backlog')
    .eq('media_items.medium', options.medium ?? 'game')
    .gt('media_items.release_date', today)
    .order('media_items(release_date)', { ascending: true });
  if (options.limit !== undefined) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as JoinedRow[]).map(toEntryRow);
}

/**
 * Home's second block: the first few backlog games. Three by default, per the
 * rule of three, with "see all" going to the Next tab and the same order.
 */
export async function upNext(client: Client, limit = 3, options: ListOptions = {}): Promise<EntryRow[]> {
  return backlog(client, { ...options, limit });
}

/**
 * Home's third block: the backlog games that have not come out, by release
 * date. Three by default, and the same list as the Next tab's Upcoming segment.
 */
export async function comingUp(client: Client, limit = 3, options: ListOptions = {}): Promise<EntryRow[]> {
  return upcoming(client, { ...options, limit });
}

/**
 * Which of these media items the caller already tracks.
 *
 * Search asks it, to draw a `check` instead of a plus on a game that is
 * already in the library (specs/search.md). Before this existed the screen
 * assembled the answer from `playing()`, `backlog()` and `upcoming()`, which
 * cost three full list reads and still could not see a game whose status is
 * `played` or `dropped` — a finished, unranked game showed the plus.
 *
 * No user id in the query, for the same reason `gamePage` has none: RLS on
 * `user_entries` exposes nothing but the caller's own rows, so "which of these
 * does anyone track" and "which of these do I track" are the same question
 * asked of the database.
 *
 * Every status counts, because the question is "is this in your library", not
 * "is it in one of the three lists a screen happens to draw". Removing an
 * entry removes the row, so there is nothing to exclude.
 *
 * No medium filter either, for the reason `gamePage` has none: the caller
 * passes the ids, and an id already names one media item of one medium. The
 * lists above filter because they choose their own rows; this one is asked
 * about rows somebody else chose.
 *
 * Returns an array rather than a `Set` so the value caches and compares like
 * every other read in this file; the caller makes a `Set` of it if it wants
 * one. Duplicates in the argument are collapsed before the query, and an empty
 * argument never reaches the network.
 */
export async function trackedMediaItemIds(
  client: Client,
  mediaItemIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(mediaItemIds)];
  if (unique.length === 0) return [];

  const { data, error } = await client
    .from('user_entries')
    .select('media_item_id')
    .in('media_item_id', unique);
  if (error) throw error;

  return data.map((row) => row.media_item_id);
}

/**
 * Everything the game page needs, in one round trip, plus a second one only
 * when the game is ranked.
 *
 * The one query embeds four tables. `game_details` and `external_scores` are
 * catalog rows anyone signed in can read. `user_entries` and `ranking_entries`
 * are embedded as to-many and come back as arrays of at most one element: not
 * because of a filter, but because RLS on those tables only ever exposes the
 * caller's own rows. That is the whole trick, and it is why there is no user id
 * anywhere in the query.
 *
 * The second round trip counts the tier, which is what turns a position into
 * the 0-10 score. It runs only for a ranked game, so the usual case of a game
 * you have not ranked stays at one.
 *
 * No medium filter, unlike the lists above: an id names exactly one media item
 * and therefore exactly one medium, which the page carries so a caller that
 * cares can see it. The tier count behind the score is scoped to that same
 * medium, so a film is never sized against the games list.
 *
 * Returns null when there is no such media item.
 */
export async function gamePage(client: Client, mediaItemId: string): Promise<GamePage | null> {
  const { data, error } = await client
    .from('media_items')
    .select(
      `
      id, medium, title, year, cover_image_id, release_date, external_ids,
      game_details (
        igdb_id, developer, summary, genres, platforms,
        time_to_beat_hastily_seconds, time_to_beat_normally_seconds, time_to_beat_completely_seconds
      ),
      external_scores ( source, score, score_count, fetched_at ),
      user_entries ( * ),
      ranking_entries ( tier, position )
    `,
    )
    .eq('id', mediaItemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    medium: Medium;
    title: string;
    year: number | null;
    cover_image_id: string | null;
    release_date: string | null;
    external_ids: Json;
    game_details: {
      igdb_id: number;
      developer: string | null;
      summary: string | null;
      genres: string[];
      platforms: string[];
      time_to_beat_hastily_seconds: number | null;
      time_to_beat_normally_seconds: number | null;
      time_to_beat_completely_seconds: number | null;
    } | null;
    external_scores: {
      source: string;
      score: number | null;
      score_count: number | null;
      fetched_at: string;
    }[];
    user_entries: UserEntryRow[];
    ranking_entries: { tier: Tier; position: number }[];
  };

  const entryRow = row.user_entries[0];
  const entry = entryRow ? toEntry(entryRow) : null;
  const playedPlatforms = new Set(entry?.playedPlatforms ?? []);

  const scores: ScoresBySource = {};
  for (const score of row.external_scores) {
    scores[score.source] = {
      source: score.source,
      score: score.score,
      scoreCount: score.score_count,
      fetchedAt: score.fetched_at,
    };
  }

  const placement = row.ranking_entries[0];

  return {
    mediaItemId: row.id,
    medium: row.medium,
    title: row.title,
    year: row.year,
    coverImageId: row.cover_image_id,
    releaseDate: row.release_date,
    externalIds: row.external_ids,
    game: row.game_details
      ? {
          igdbId: row.game_details.igdb_id,
          developer: row.game_details.developer,
          summary: row.game_details.summary,
          genres: row.game_details.genres,
          platforms: row.game_details.platforms.map((name) => ({
            name,
            played: playedPlatforms.has(name),
          })),
          timeToBeat: toTimeToBeat(row.game_details),
        }
      : null,
    scores,
    entry,
    ranking: placement ? await toPlacement(client, row.medium, placement) : null,
  };
}

async function toPlacement(
  client: Client,
  medium: Medium,
  placement: { tier: Tier; position: number },
): Promise<RankingPlacement> {
  const { count, error } = await client
    .from('ranking_entries')
    .select('media_item_id', { count: 'exact', head: true })
    .eq('medium', medium)
    .eq('tier', placement.tier);
  if (error) throw error;

  const tierSize = count ?? placement.position + 1;
  return {
    tier: placement.tier,
    position: placement.position,
    tierSize,
    score: scoreForPosition(placement.tier, placement.position, tierSize),
  };
}
