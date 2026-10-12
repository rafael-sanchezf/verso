/**
 * From a request and three reads to a running batch session, and the words
 * the session prints while it runs.
 *
 * The engine is `startBatch` and friends in `@verso/core` (PR #72): it decides
 * every question, every placement and the estimate. What this file adds is the
 * wiring the spec asks for (specs/batch-session.md, "Input"):
 *
 * - each new game carries the engine's guess, copied from the
 *   `batchPredictions` row with its id (none when the row is missing, when the
 *   read failed, or for the seeds, which start with no predictions);
 * - the tiers' stored order sits beside them, read fresh from `tier_list`;
 * - the tie-break is the order the games arrived in, which is the deck's
 *   popularity order;
 * - a game that is already ranked (placed from another device since the deck
 *   page drew it) is left out rather than handed to `startBatch`, which
 *   refuses a game that is both new and ranked.
 *
 * No `react-native` import: the unit suite runs in node
 * (`apps/mobile/test/session-start.test.ts`).
 */

import type { BatchPrediction, TierListRow } from '@verso/api';
import {
  remainingEstimate,
  scoreForPosition,
  startBatch,
  TIERS,
  type BatchItem,
  type BatchQuestion,
  type BatchState,
  type Tier,
} from '@verso/core';

import { scoreText } from '../../log/game';

/** The four `tier_list` reads, best tier first when iterated with `TIERS`. */
export type TierRows = Readonly<Record<Tier, readonly TierListRow[]>>;

/** Each tier's stored order, as media item ids, best first. */
export type TierIds = Readonly<Record<Tier, readonly string[]>>;

export interface PlaceableItem {
  readonly mediaItemId: string;
  readonly tier: Tier;
  readonly genres: readonly string[];
}

export interface StartedBatch {
  readonly state: BatchState;
  /** `remainingEstimate` before the first answer: what the progress bar fills against. */
  readonly firstEstimate: number;
  /** The stored order the session started from. */
  readonly existing: TierIds;
  /** Games left out because they were already ranked. */
  readonly skipped: readonly string[];
}

/** The first of each id, in order. A request with a game twice asks about it once. */
export function uniqueById<T extends { mediaItemId: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.mediaItemId)) continue;
    seen.add(item.mediaItemId);
    out.push(item);
  }
  return out;
}

export function tierIds(tiers: TierRows): TierIds {
  return {
    loved: tiers.loved.map((row) => row.media_item_id),
    liked: tiers.liked.map((row) => row.media_item_id),
    fine: tiers.fine.map((row) => row.media_item_id),
    disliked: tiers.disliked.map((row) => row.media_item_id),
  };
}

/**
 * Start the session, or null when there is nothing left to place (every game
 * was already ranked, or none came with a tier).
 */
export function beginBatch(args: {
  items: readonly PlaceableItem[];
  tiers: TierRows;
  /** Null for no guess at all: the seeds, or a read that failed. */
  predictions: readonly BatchPrediction[] | null;
}): StartedBatch | null {
  const existing = tierIds(args.tiers);
  const ranked = new Set(TIERS.flatMap((tier) => existing[tier]));
  const guesses = new Map((args.predictions ?? []).map((p) => [p.mediaItemId, p]));

  const items = uniqueById(args.items);
  const skipped = items.filter((item) => ranked.has(item.mediaItemId)).map((item) => item.mediaItemId);
  const placeable = items.filter((item) => !ranked.has(item.mediaItemId));
  if (placeable.length === 0) return null;

  const batchItems: BatchItem[] = placeable.map((item) => {
    const guess = guesses.get(item.mediaItemId);
    return {
      item: { id: item.mediaItemId, genres: item.genres },
      tier: item.tier,
      predictedScore: guess ? guess.predictedScore : null,
      confidence: guess ? guess.confidence : null,
    };
  });

  const state = startBatch({
    items: batchItems,
    tiers: {
      loved: args.tiers.loved.map((row) => ({ id: row.media_item_id, genres: row.genres ?? [] })),
      liked: args.tiers.liked.map((row) => ({ id: row.media_item_id, genres: row.genres ?? [] })),
      fine: args.tiers.fine.map((row) => ({ id: row.media_item_id, genres: row.genres ?? [] })),
      disliked: args.tiers.disliked.map((row) => ({ id: row.media_item_id, genres: row.genres ?? [] })),
    },
    tieBreak: placeable.map((item) => item.mediaItemId),
  });

  return { state, firstEstimate: remainingEstimate(state), existing, skipped };
}

/** Where a ranked game stands today: its tier, place, global rank and score. */
export interface ExistingPlace {
  readonly tier: Tier;
  readonly index: number;
  readonly rank: number;
  readonly score: number;
}

/**
 * A ranked game's place in the stored order, or null for a game of this
 * batch. The global rank counts the better tiers' games first
 * (specs/README.md, "Global rank").
 */
export function existingPlace(existing: TierIds, id: string): ExistingPlace | null {
  let above = 0;
  for (const tier of TIERS) {
    const list = existing[tier];
    const index = list.indexOf(id);
    if (index !== -1) {
      return { tier, index, rank: above + index + 1, score: scoreForPosition(tier, index, list.length) };
    }
    above += list.length;
  }
  return null;
}

/** The new game's card: every game in a batch was just played. */
export const NEW_GAME_SUBTITLE = 'just played';

/**
 * The opponent's card: "ranked #12 · 8.9" for a game already ranked, "just
 * played" for another game of this batch (it has no rank yet).
 */
export function pivotSubtitle(question: Pick<BatchQuestion, 'pivot' | 'pivotIsNew'>, existing: TierIds): string {
  if (question.pivotIsNew) return NEW_GAME_SUBTITLE;
  const place = existingPlace(existing, question.pivot.id);
  if (place === null) return NEW_GAME_SUBTITLE;
  return `ranked #${place.rank} · ${scoreText(place.score)}`;
}

/** The header's line under the bar. The count is an estimate, so it says "About". */
export function remainingLabel(remaining: number): string {
  return `About ${remaining} more to place everything`;
}

/**
 * How full the header's bar is, 0 to 1: the answers given against the first
 * estimate (specs/batch-session.md, "the bar fills as questions are answered
 * against the first estimate").
 *
 * When a run proves longer than the first estimate (the guess was off, or
 * "can't compare" swapped an opponent), the answers plus what is still left
 * take over as the whole, so the bar never fills while a question remains. It
 * never moves backwards: `remainingEstimate` never rises after an answer, so
 * the whole grows by at most the one answer that was just added to the part.
 */
export function progressFill(answered: number, remaining: number, firstEstimate: number): number {
  if (remaining <= 0) return 1;
  const whole = Math.max(firstEstimate, answered + remaining);
  return whole <= 0 ? 0 : Math.min(answered / whole, 1);
}
