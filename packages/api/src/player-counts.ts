/**
 * Concurrent Steam players: the figure on the game page, and the week of
 * history behind it.
 *
 * Valve publishes the present only. The series is ours because a poll writes a
 * row every 30 minutes (supabase/functions/steam-player-counts, scheduled in
 * supabase/migrations/20260916084800_player_counts.sql), which is the one
 * legitimate way to have this data at all: SteamDB and Steam Charts have the
 * history and both forbid scraping.
 *
 * Two things a screen has to know before it draws either of these.
 *
 * 1. **Null and empty are the normal cases**, not errors. A game with no Steam
 *    id is never polled; a game that has one gets its first point at the next
 *    tick, not when you open the page; Valve has no figure at all for some
 *    apps. "Best-effort integrations, honest UI" (ROADMAP.md) means the page
 *    says it has no number rather than drawing a zero or a flat line.
 * 2. **These are readings, not a live feed.** Every point is up to half an hour
 *    old, and the newest one carries the time it was taken so a screen can say
 *    so.
 *
 * Neither function takes a user id and neither reads one: `player_counts` is
 * catalog-shaped data, readable by every signed-in user, and it records how
 * many people are playing a game, never which of them are.
 */

import type { Client } from './client';

/** One reading: how many people were in the game at that moment. */
export interface PlayerCount {
  /** When the poll took the figure. ISO timestamp, up to 30 minutes old. */
  observedAt: string;
  /** Valve's concurrent player count. Zero is a real answer. */
  players: number;
}

/**
 * The most recent reading for one game, or null when there is none.
 *
 * Reads the `latest_player_counts` view, which is one row per game and runs as
 * the caller, so the same RLS that governs the table governs this.
 *
 * `supabase gen types` types every column of a view as nullable, because
 * Postgres does not carry NOT NULL through one, while the columns behind this
 * view are both NOT NULL. Hence the check rather than a cast: it costs a line
 * and it means this file never asserts something the type system was told is
 * not guaranteed.
 */
export async function latestPlayerCount(
  client: Client,
  mediaItemId: string,
): Promise<PlayerCount | null> {
  const { data, error } = await client
    .from('latest_player_counts')
    .select('observed_at, players')
    .eq('media_item_id', mediaItemId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.observed_at === null || data.players === null) return null;

  return { observedAt: data.observed_at, players: data.players };
}

/**
 * One game's readings, oldest first, for the sparkline on the game page.
 *
 * The window defaults to the last seven days, which is the database's default
 * rather than this file's: omitting `since` sends no argument at all, so the
 * window is decided in one place (`player_count_history`) and a client whose
 * clock is wrong cannot ask for a week that is not this week.
 *
 * An empty array means no readings in the window, which is what a game nobody
 * has polled yet looks like. It is never an error.
 */
export async function playerCountHistory(
  client: Client,
  mediaItemId: string,
  since?: string | Date,
): Promise<PlayerCount[]> {
  const { data, error } = await client.rpc('player_count_history', {
    p_media_item_id: mediaItemId,
    ...(since === undefined
      ? {}
      : { p_since: since instanceof Date ? since.toISOString() : since }),
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({ observedAt: row.observed_at, players: row.players }));
}
