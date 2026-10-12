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
