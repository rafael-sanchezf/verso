/**
 * Typed wrappers around the ranking RPCs in
 * supabase/migrations/20260915130000_ranking_functions.sql, with the
 * provisional mark of 20261007120000_onboarding_backend.sql.
 *
 * They are deliberately thin: name the arguments, call rpc(), throw the
 * PostgrestError if there is one. Everything interesting (the position shuffle,
 * the ownership rules) lives in the database, where it is one transaction and
 * Row Level Security still applies. None of these take a user id; the database
 * works on auth.uid().
 */

import type { FinishInsertionArgs, Medium, PlacedBy, Tier } from '@verso/core';
import type { Client } from './client';
import type { Database, Json } from './database.types';

type Functions = Database['public']['Functions'];

/** Re-adds the nullability that `supabase gen types` drops for set-returning functions. */
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/**
 * One row of a tier, best first.
 *
 * Column names are the database's, not camelCase, because these come straight
 * off an RPC. `cover_image_id` and `external_ids` together satisfy
 * `CoverSourceRow`, so a Ranking row goes to `coverCandidates` as it is.
 *
 * Two platform lists, both spelled as the catalog spells them: `platforms` is
 * every platform the catalog lists the game on; `played_platforms` is the
 * caller's own, from their entry (decision 19: a ranked game was played). It is
 * empty when nothing is recorded, and for a ranked game whose entry was
 * removed. The third list, `owned_platforms`, left with ownership (decision 26).
 *
 * `placed_by` is the provisional mark: `'user'` when the user's answers, a
 * drag, or the log flow put the game there, `'prior'` when the batch session
 * left it at the engine's guess because the user stopped. The review draws a
 * `prior` row with "≈ {score}", and any move clears the mark
 * (docs/design/specs/batch-session.md).
 */
export type TierListRow = Omit<
  Nullable<Functions['tier_list']['Returns'][number], 'year' | 'cover_image_id'>,
  'placed_by'
> & { placed_by: PlacedBy };

export interface RankingEntryPlacement {
  mediaItemId: string;
  medium: Medium;
  tier: Tier;
  /** Position within the tier, 0 being best. Clamped by the database to the tier's length. */
  position: number;
  /**
   * Who decided the place. Omitted means `'user'`, the database's default, and
   * nothing is sent for it, so a call that never heard of the mark is the call
   * it always was.
   */
  placedBy?: PlacedBy;
}

/**
 * Place an item in a tier, shifting everything below it down one.
 * Returns the position it actually landed at.
 *
 * No screen calls this: the app places through `finishInsertion`, which also
 * writes the answers. The test suites use it to set up a list. Like
 * `finishInsertion`, it logs the engine's guess for the item to
 * `prediction_log` (the row `finishInsertion` writes for a call with no
 * comparisons; 20261028100000_insert_ranking_entry_prediction.sql).
 *
 * Throws with code 23505 if the item is already ranked, 22023 if the media item
 * is unknown or is not of that medium.
 */
export async function insertRankingEntry(client: Client, args: RankingEntryPlacement): Promise<number> {
  const { data, error } = await client.rpc('insert_ranking_entry', {
    p_media_item_id: args.mediaItemId,
    p_medium: args.medium,
    p_tier: args.tier,
    p_position: args.position,
    ...(args.placedBy === undefined ? {} : { p_placed_by: args.placedBy }),
  });
  if (error) throw error;
  return data;
}

/**
 * Move a ranked item to another tier or position: drag to reorder, and the
 * up/down nudges on the confirm step. Returns the position it landed at.
 *
 * The moved row becomes `placedBy: 'user'`, whatever it was: a drag in the
 * review is the user settling a provisional place. The rows it shifts keep
 * their marks.
 *
 * Throws with code P0002 if the caller has not ranked that item.
 */
export async function moveRankingEntry(
  client: Client,
  args: { mediaItemId: string; tier: Tier; position: number },
): Promise<number> {
  const { data, error } = await client.rpc('move_ranking_entry', {
    p_media_item_id: args.mediaItemId,
    p_tier: args.tier,
    p_position: args.position,
  });
  if (error) throw error;
  return data;
}

/**
 * Unrank an item and close the gap it leaves.
 *
 * Throws with code P0002 if the caller has not ranked that item.
 */
export async function removeRankingEntry(client: Client, mediaItemId: string): Promise<void> {
  const { error } = await client.rpc('remove_ranking_entry', { p_media_item_id: mediaItemId });
  if (error) throw error;
}

/**
 * Which path is placing a game, as `finishInsertion` tells the database for
 * the insertion prediction it logs (`prediction_log.components.source`):
 * `'user'` for the log flow, `'batch'` for the batch session. `'import'` is
 * the Letterboxd import's own and never comes through `finishInsertion`.
 */
export type InsertionSource = 'user' | 'batch';

/**
 * One RPC per ranked game: write the comparison log the insertion produced and
 * place the item, atomically. Build the arguments with `insertionToFinishArgs`
 * from @verso/core for one game, or with `batchFinishArgs` for a batch
 * session, whose arguments carry each game's `placedBy`. Returns the position
 * the item landed at.
 *
 * `placedBy` omitted means `'user'`, and nothing is sent for it, so the log
 * flow's call is unchanged. A `'prior'` game still carries its own answers:
 * the mark says the answers did not fix its place, not that there were none.
 *
 * `source` is the same kind of option: omitted means `'user'` and nothing is
 * sent. The batch session sends `'batch'` for every game it writes, so the
 * insertion prediction the database logs for it reads source batch whether
 * its answers or the prior placed it (20261028110000_batch_insertion_source.sql).
 */
export async function finishInsertion(
  client: Client,
  args: FinishInsertionArgs & { placedBy?: PlacedBy; source?: InsertionSource },
): Promise<number> {
  const { data, error } = await client.rpc('finish_insertion', {
    p_media_item_id: args.mediaItemId,
    p_medium: args.medium,
    p_tier: args.tier,
    p_position: args.position,
    // The generated Args type says Json; the payload is a plain array of plain
    // objects, which TypeScript will not structurally match to that recursive type.
    p_comparisons: args.comparisons as unknown as Json,
    ...(args.placedBy === undefined ? {} : { p_placed_by: args.placedBy }),
    ...(args.source === undefined ? {} : { p_source: args.source }),
  });
  if (error) throw error;
  return data;
}

/**
 * The caller's ordered tier, joined with the catalog. `genres` is what the
 * genre-preferring pivot in @verso/core needs; `cover_image_id` and
 * `external_ids` are what `coverCandidates` needs, so a Ranking row draws the
 * same cover as a Home row, Steam fallback included. `played_platforms` is what
 * a platform filter over the ranked list reads; `placed_by` is the provisional
 * mark.
 */
export async function tierList(client: Client, medium: Medium, tier: Tier): Promise<TierListRow[]> {
  const { data, error } = await client.rpc('tier_list', { p_medium: medium, p_tier: tier });
  if (error) throw error;
  return (data ?? []) as TierListRow[];
}
