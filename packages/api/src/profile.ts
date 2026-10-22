/**
 * The two reads behind the Profile tab: the stats row, and recent activity.
 *
 * Profile A was chosen in the structure round (docs/design/ui-brief.md,
 * "Structure round part 2"): avatar and name, a stats row that links to Ranking
 * and Next, then recent activity rows. Two decisions from that round shape this
 * file.
 *
 * **The stats row is counts, not lists.** It shows numbers and links away, so
 * every query here is `head: true` with an exact count: PostgREST answers with
 * a `Content-Range` header and no body, which means opening Profile does not
 * drag a user's whole library across the network to display six integers.
 *
 * **Recent activity shows rankings only**, "not backlog or wishlist changes".
 * So `recentRankings` reads `ranking_entries` and never `user_entries`: adding
 * a game to the backlog is not activity, placing one is.
 *
 * Neither function takes a user id, and neither filters by one. Row Level
 * Security does it: the policies on `user_entries` and `ranking_entries` are
 * `auth.uid() = user_id`, so a count is already the caller's count. Signed out,
 * every number is 0 and the activity list is empty rather than an error, which
 * is what a signed-out Profile should render anyway.
 *
 * **Everything here is scoped to one medium**, defaulting to `'game'`: the app
 * is always in exactly one medium with hard walls between media (ROADMAP.md,
 * decision 8), so the stats row and the activity list below it describe the
 * medium the user is looking at and nothing else. `ranking_entries` carries the
 * column, so those filter on it directly; `user_entries` reaches it only
 * through `media_items`, so those counts filter across the `media_items!inner`
 * join the release-date split already uses. The lists in `views.ts` are scoped
 * the same way and by the same default, which is what keeps a badge saying 3
 * above a list of 4 from happening across media.
 *
 * **The joint profile's reads come after them** (profile-brief, 2026-10-12,
 * and 20261014100000_profile_reads.sql): `recentActivity` and `activityMonth`
 * across media unless a medium is asked, with the verb by source ("Watched",
 * "Finished", "Ranked"); `rankerPercentile` for "Top N% of rankers"; and
 * `profileHours`. Those are RPCs and, unlike the counts above, throw signed
 * out (28000). The two above stay until the Profile screen moves to them.
 */

import { scoreForPosition, type Medium, type Tier } from '@verso/core';
import type { Client } from './client';
import type { Json } from './database.types';
import { todayLocal } from './entries';
import type { RankingPlacement } from './views';

/**
 * The stats row, and the honest shape of the four statuses behind it.
 *
 * `backlog` and `upcoming` are the Next tab's two segments rather than two
 * statuses: both are entries with status `backlog`, split on whether the
 * release date has arrived (see the head of `views.ts`). They partition that
 * status exactly, so `backlog + upcoming` is every backlog entry and no entry
 * is counted twice.
 */
export interface ProfileStats {
  /** Games in the caller's ranked list. The number the Ranking link shows. */
  ranked: number;
  /** Released and undated backlog games: the Next tab's first segment. */
  backlog: number;
  /** Backlog games that have not come out yet: the Next tab's second segment. */
  upcoming: number;
  playing: number;
  played: number;
  dropped: number;
}

export interface ProfileStatsOptions {
  /**
   * Treat this `YYYY-MM-DD` as today when splitting backlog from upcoming.
   * For tests; the default is the device's own date, as everywhere else.
   */
  today?: string;
  /** Which medium to count. Defaults to `'game'`, the only one V0 exposes. */
  medium?: Medium;
}

/**
 * Every number on the Profile stats row, in six parallel count queries.
 *
 * Six round trips rather than one, because PostgREST has no `group by` and the
 * alternative is fetching every entry to count it on the device. They are
 * head-only and they run together, so the screen waits for the slowest rather
 * than the sum.
 */
export async function profileStats(
  client: Client,
  options: ProfileStatsOptions = {},
): Promise<ProfileStats> {
  const today = options.today ?? todayLocal();
  const medium = options.medium ?? 'game';

  const [ranked, backlog, upcoming, playing, played, dropped] = await Promise.all([
    count(
      client
        .from('ranking_entries')
        .select('media_item_id', { count: 'exact', head: true })
        .eq('medium', medium),
    ),
    count(
      client
        .from('user_entries')
        .select('media_items!inner(id)', { count: 'exact', head: true })
        .eq('status', 'backlog')
        .eq('media_items.medium', medium)
        .or(`release_date.is.null,release_date.lte.${today}`, { referencedTable: 'media_items' }),
    ),
    count(
      client
        .from('user_entries')
        .select('media_items!inner(id)', { count: 'exact', head: true })
        .eq('status', 'backlog')
        .eq('media_items.medium', medium)
        .gt('media_items.release_date', today),
    ),
    countStatus(client, medium, 'playing'),
    countStatus(client, medium, 'played'),
    countStatus(client, medium, 'dropped'),
  ]);

  return { ranked, backlog, upcoming, playing, played, dropped };
}

/**
 * `media_items!inner(id)` rather than `id`, so the medium can be filtered
 * through the join, which is what the reads in views.ts do and what these
 * counts have to keep doing to agree with them. An inner join drops the entry
 * rather than emptying the embed. Same shape as the two counts above, and still
 * head-only, so it is still a number and no rows.
 */
function countStatus(
  client: Client,
  medium: Medium,
  status: 'playing' | 'played' | 'dropped',
): Promise<number> {
  return count(
    client
      .from('user_entries')
      .select('media_items!inner(id)', { count: 'exact', head: true })
      .eq('status', status)
      .eq('media_items.medium', medium),
  );
}

/** Run a head-only count query. A count of nothing comes back as null, which is 0. */
async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: value, error } = await query;
  if (error) throw error;
  return value ?? 0;
}

/** One row of Profile's recent activity: a game, where it landed, and when. */
export interface RecentRanking {
  mediaItemId: string;
  medium: Medium;
  title: string;
  year: number | null;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the row to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  /**
   * Where it sits now and the 0-10 score that follows from it. The same shape
   * `GamePage.ranking` carries, so a score badge is rendered the same way in
   * both places.
   */
  placement: RankingPlacement;
  /** When the user placed this game, as an ISO timestamp. The date to show. */
  placedAt: string;
  /**
   * When the row was last written, as an ISO timestamp: a placement, a move, or
   * a neighbour's insert shifting it down one. Not a date to show anyone.
   */
  updatedAt: string;
}

export interface RecentRankingsOptions {
  /** Which medium's activity to list. Defaults to `'game'`, the only one V0 exposes. */
  medium?: Medium;
}

/**
 * The caller's most recently placed ranked games, newest first.
 *
 * Ordered by `placed_at`, which only a placement writes: not a move, not a
 * change of tier, and not the position shift a neighbour's insert causes
 * (supabase/migrations/20260916140000_ranking_placed_at.sql). So this is what
 * the user did, and ranking one game near the top of a full tier no longer
 * pushes a week of real placements out of the list.
 *
 * The tie-break on tier and position stays. Games placed in the same
 * transaction share a timestamp to the microsecond, and an import or a
 * rebuild could write a batch of them; without it the order inside such a
 * group would be whatever the planner returned.
 *
 * The score costs one extra head count per distinct tier in the page (at most
 * four, usually one or two), because a position only becomes a score when you
 * know how many items the tier holds. Same trade as `gamePage`, and the counts
 * run alongside each other.
 *
 * One medium at a time, `'game'` unless asked otherwise: `ranking_entries`
 * carries the column, so this is a filter on the table itself and the tier
 * counts below are scoped by each row's own medium, which is now the one that
 * was asked for.
 */
export async function recentRankings(
  client: Client,
  limit = 10,
  options: RecentRankingsOptions = {},
): Promise<RecentRanking[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a whole number, 1 or more, got ${limit}`);
  }

  const { data, error } = await client
    .from('ranking_entries')
    .select(
      `
      medium, tier, position, placed_at, updated_at,
      media_items!inner ( id, title, year, cover_image_id, external_ids )
    `,
    )
    .eq('medium', options.medium ?? 'game')
    .order('placed_at', { ascending: false })
    .order('tier', { ascending: true })
    .order('position', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const rows = data as unknown as {
    medium: Medium;
    tier: Tier;
    position: number;
    placed_at: string;
    updated_at: string;
    media_items: {
      id: string;
      title: string;
      year: number | null;
      cover_image_id: string | null;
      external_ids: Json;
    };
  }[];

  const tierSizes = await countTiers(
    client,
    rows.map((row) => [row.medium, row.tier] as const),
  );

  return rows.map((row) => {
    const tierSize = tierSizes.get(tierKey(row.medium, row.tier)) ?? row.position + 1;
    const item = row.media_items;
    return {
      mediaItemId: item.id,
      medium: row.medium,
      title: item.title,
      year: item.year,
      coverImageId: item.cover_image_id,
      externalIds: item.external_ids,
      placement: {
        tier: row.tier,
        position: row.position,
        tierSize,
        score: scoreForPosition(row.tier, row.position, tierSize),
      },
      placedAt: row.placed_at,
      updatedAt: row.updated_at,
    };
  });
}

function tierKey(medium: Medium, tier: Tier): string {
  return `${medium}:${tier}`;
}

/** How many items the caller has in each of the given tiers, counted once per distinct tier. */
async function countTiers(
  client: Client,
  tiers: readonly (readonly [Medium, Tier])[],
): Promise<Map<string, number>> {
  const distinct = new Map<string, readonly [Medium, Tier]>();
  for (const pair of tiers) distinct.set(tierKey(pair[0], pair[1]), pair);

  const counted = await Promise.all(
    [...distinct.values()].map(async ([medium, tier]) => {
      const size = await count(
        client
          .from('ranking_entries')
          .select('media_item_id', { count: 'exact', head: true })
          .eq('medium', medium)
          .eq('tier', tier),
      );
      return [tierKey(medium, tier), size] as const;
    }),
  );

  return new Map(counted);
}

/**
 * What a line of activity says happened (profile-brief, round two, the verb by
 * source):
 *
 * - `ranked`: a placement, on the day it was placed. Every bulk-entry and
 *   import row reads this way, since nothing says when it was watched.
 * - `watched`: a film logged through the log sheet, on the day the person set.
 * - `finished`: a game someone said they finished while it was in Playing
 *   (`user_entries.finished_from`, written only by Home's "Done playing"
 *   through `markFinished`), on its finished day. Ranking never writes it
 *   (VER-224, 2026-10-22): a game ranked from Playing stays in Playing and
 *   reads `ranked` ("Ranked X · 9.4"). The read is unchanged; the condition
 *   on `finished_from` was already the explicit finish once ranking stopped
 *   calling `markFinished`.
 *
 * A placement on the same day as a watch or finish of the same item is folded
 * into that line, which then carries the score ("Finished X · 9.4").
 */
export type ActivityKind = 'ranked' | 'watched' | 'finished';

/** One line of activity: Recent on Profile, or a row of the Activity calendar's list. */
export interface ActivityEvent {
  kind: ActivityKind;
  /** The day it happened, `YYYY-MM-DD`, where the person is. */
  onDate: string;
  /**
   * The moment, an ISO timestamp, when one is stored: the placement's for
   * `ranked`, the diary row's writing for `watched`. Null for `finished`,
   * whose entry keeps a day only. For a relative time; `onDate` is the day.
   */
  occurredAt: string | null;
  mediaItemId: string;
  medium: Medium;
  title: string;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the row to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  /** The item's 0-10 score now, on every kind; null when it is not ranked. Never a rank number. */
  score: number | null;
  /** Where a `watched` film was seen ("Netflix", `'theater'`, `'other'`), else null. */
  place: string | null;
}

/** A row of `activityMonth`: an event and its day of the month, 1 to 31. */
export interface ActivityMonthEvent extends ActivityEvent {
  day: number;
}

export interface RecentActivityOptions {
  /** How many lines, newest first. Defaults to 10; Profile shows two or three. */
  limit?: number;
  /** One medium's lines (Profile's medium switcher); every medium when absent. */
  medium?: Medium;
  /**
   * The IANA time zone a placement's day is read in. Defaults to the
   * device's (`deviceTimeZone`), so a game ranked at 9 pm in New York is that
   * day's and not the next.
   */
  timeZone?: string;
}

export interface ActivityMonthOptions {
  year: number;
  /** 1 to 12. */
  month: number;
  medium?: Medium;
  /** As `RecentActivityOptions.timeZone`. */
  timeZone?: string;
}

/** The device's IANA time zone, or UTC where the runtime cannot say. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

type ActivityRow = {
  kind: string;
  on_date: string;
  occurred_at: string | null;
  media_item_id: string;
  medium: Medium;
  title: string;
  cover_image_id: string | null;
  external_ids: Json;
  score: number | null;
  place: string | null;
};

function toActivityEvent(row: ActivityRow): ActivityEvent {
  return {
    kind: row.kind as ActivityKind,
    onDate: row.on_date,
    occurredAt: row.occurred_at ?? null,
    mediaItemId: row.media_item_id,
    medium: row.medium,
    title: row.title,
    coverImageId: row.cover_image_id ?? null,
    externalIds: row.external_ids,
    score: row.score ?? null,
    place: row.place ?? null,
  };
}

/**
 * Profile's Recent: the caller's newest activity across media (or in one),
 * from `recent_activity`. Throws `RangeError` for a limit below one without a
 * round trip, and the PostgrestError signed out (28000).
 */
export async function recentActivity(
  client: Client,
  options: RecentActivityOptions = {},
): Promise<ActivityEvent[]> {
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a whole number, 1 or more, got ${limit}`);
  }
  const { data, error } = await client.rpc('recent_activity', {
    p_limit: limit,
    p_time_zone: options.timeZone ?? deviceTimeZone(),
    ...(options.medium === undefined ? {} : { p_medium: options.medium }),
  });
  if (error) throw error;
  return (data ?? []).map(toActivityEvent);
}

/**
 * The Activity calendar: every event of one month, newest first, each with its
 * day, from `activity_month`. The grid draws one poster per day and "+N" for
 * the rest; the list under it is these rows in order. Throws `RangeError` for
 * a month outside 1 to 12 without a round trip.
 */
export async function activityMonth(client: Client, options: ActivityMonthOptions): Promise<ActivityMonthEvent[]> {
  const { year, month } = options;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`a month is a whole year and a month from 1 to 12, got ${year}-${month}`);
  }
  const { data, error } = await client.rpc('activity_month', {
    p_year: year,
    p_month: month,
    p_time_zone: options.timeZone ?? deviceTimeZone(),
    ...(options.medium === undefined ? {} : { p_medium: options.medium }),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...toActivityEvent(row), day: row.day }));
}

/**
 * "Top N% of rankers": the caller's share of rankers who have ranked fewer
 * items than they have, 0 to 100 with one decimal, across media or in one.
 * Null while the cohort is under ten rankers or the caller has ranked nothing,
 * and the tile then hides. The tile's N is `100 - percentile`.
 */
export async function rankerPercentile(client: Client, options: { medium?: Medium } = {}): Promise<number | null> {
  const { data, error } = await client.rpc(
    'ranker_percentile',
    options.medium === undefined ? {} : { p_medium: options.medium },
  );
  if (error) throw error;
  return data ?? null;
}

/**
 * The Hours tile: games' recorded playtime plus one film runtime per diary
 * row (a rewatch twice), across media or in one, in hours with one decimal.
 */
export async function profileHours(client: Client, options: { medium?: Medium } = {}): Promise<number> {
  const { data, error } = await client.rpc(
    'profile_hours',
    options.medium === undefined ? {} : { p_medium: options.medium },
  );
  if (error) throw error;
  return data ?? 0;
}
