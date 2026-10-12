/**
 * The bridge between the pure insertion engine in ranking.ts and the
 * finish_insertion RPC in supabase/migrations/20260915130000_ranking_functions.sql.
 *
 * The engine ends with a position and a list of answers. The database wants
 * both in one call so the comparison log and the placement land in a single
 * transaction. This module does that translation and nothing else: no
 * network, no storage, no clock.
 */

import type { ComparisonOutcome, Medium, Tier } from './model';
import type { InsertionState } from './ranking';

/**
 * One comparison as the database reads it. Snake case on purpose: this is the
 * JSON payload `finish_insertion` parses, not a TypeScript-side model. Any
 * user_id here is ignored; the rows are always written for auth.uid().
 */
export interface ComparisonPayload {
  item_a: string;
  item_b: string;
  outcome: ComparisonOutcome;
  context: Record<string, unknown>;
}

/** Arguments for the finish_insertion RPC. */
export interface FinishInsertionArgs {
  mediaItemId: string;
  medium: Medium;
  tier: Tier;
  /** Insertion index within the tier, 0 being best. */
  position: number;
  comparisons: ComparisonPayload[];
}

export interface InsertionIds {
  /** The medium whose tier this insertion ran against. */
  medium: Medium;
  /**
   * Maps a RankableItem id to a media_items UUID. Omit it when the tier was
   * built straight from catalog ids, which is the normal case; pass it when the
   * UI drives the engine with ids of its own.
   */
  mediaItemId?: (rankableId: string) => string;
}

/**
 * Turn a finished InsertionState into the arguments for finish_insertion.
 * Throws if the insertion has not finished, because there is no position yet.
 */
export function insertionToFinishArgs(state: InsertionState, ids: InsertionIds): FinishInsertionArgs {
  if (!state.done || state.insertAt === null) {
    throw new Error('insertion not finished');
  }
  const toId = ids.mediaItemId ?? ((id: string) => id);
  return {
    mediaItemId: toId(state.item.id),
    medium: ids.medium,
    tier: state.tier,
    position: state.insertAt,
    comparisons: state.records.map((r) => ({
      item_a: toId(r.itemA),
      item_b: toId(r.itemB),
      outcome: r.outcome,
      context: { ...r.context },
    })),
  };
}
