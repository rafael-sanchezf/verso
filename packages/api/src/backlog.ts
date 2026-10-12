/**
 * Typed wrapper around the backlog ordering RPC in
 * supabase/migrations/20260916003100_backlog_ordering.sql, as rewritten by
 * 20260916230000_per_medium_backlog_and_rpcs.sql to work one medium at a time.
 *
 * Thin, like the ranking wrappers: name the arguments, call rpc(), throw the
 * PostgrestError if there is one. The renumbering is one transaction in the
 * database, so a drag is one round trip and the list is never observably
 * half-reordered. There is no user id parameter; the database works on
 * auth.uid().
 *
 * Adding to and removing from the backlog need no wrapper at all: the trigger
 * on user_entries appends a new backlog entry and clears the position of one
 * that leaves, so writing `status` is the whole operation.
 */

import type { Client } from './client';

export interface BacklogMove {
  /** The `user_entries.id` of the row the finger moved. */
  entryId: string;
  /**
   * Where it lands, 0 first. Clamped by the database to the backlog's length,
   * so a stale list cannot fail on an off-by-one. A drag always knows its
   * index, so the null-appends form the RPC also accepts is not exposed here.
   */
  position: number;
}

/**
 * Move one of the caller's backlog entries, renumbering that medium's backlog
 * densely. Returns the position it actually landed at.
 *
 * Throws with code P0002 if the entry is not the caller's or is not in their
 * backlog (it was finished or dropped on another device, say).
 *
 * `position` is an index into the caller's backlog *in the entry's own medium*,
 * which is the list `backlog()` in views.ts returns, so the two agree whatever
 * media the user tracks. Which medium is not a parameter: the entry names a
 * catalog row and the catalog row names the medium, so the database reads it
 * from the entry being moved. A drag in the films never renumbers the games.
 */
export async function moveBacklogEntry(client: Client, args: BacklogMove): Promise<number> {
  const { data, error } = await client.rpc('move_backlog_entry', {
    p_entry_id: args.entryId,
    p_new_position: args.position,
  });
  if (error) throw error;
  return data;
}
