/**
 * The onboarding's three reads: the deck page's candidates, the engine's guess
 * for a batch, and the played-not-ranked drain
 * (supabase/migrations/20261007120000_onboarding_backend.sql;
 * docs/design/specs/onboarding.md and batch-session.md).
 *
 * Unlike the RPC wrappers in ranking.ts and catalog.ts, these return camelCase
 * rows, because each one is handed straight to a pure function in @verso/core
 * that names its fields: `orderDeck` reads `{ popularityRank, boost }`, and a
 * batch item carries `{ predictedScore, confidence }`. `coverImageId` and
 * `externalIds` are the camelCase pair `coverCandidates` accepts, so a row
 * draws its cover as it is.
 *
 * None of them takes a user id. `deck_candidates` and `batch_predictions` are
 * security definer, because the content model behind them is service role
 * only, and they work on the caller's id inside the database; the caller
 * cannot name another user. `played_not_ranked` is security invoker, so Row
 * Level Security decides its rows. All three throw the PostgrestError, as the
 * ranking wrappers do: a failure is a bug or a dead network.
 */

import type { Medium, PredictionConfidence } from '@verso/core';
import type { Client } from './client';
import type { Json } from './database.types';

/** The catalog facts a deck row, a session card and a tier pass draw. */
export interface OnboardingGameRow {
  mediaItemId: string;
  title: string;
  year: number | null;
  coverImageId: string | null;
  /** `media_items.external_ids`. Pass the row to `coverCandidates`; see covers.ts. */
  externalIds: Json;
  /** What the genre-preferring pivot and the genre cue read. */
  genres: string[];
  /** Every platform the catalog lists the game on, spelled as `game_details.platforms` spells them. */
  platforms: string[];
}

/** One row of the deck page. */
export interface DeckCandidateRow extends OnboardingGameRow {
  /**
   * The row's 1-based place by popularity across pages, so page two's ranks
   * continue page one's. What `orderDeck` orders by first.
   */
  popularityRank: number;
  /**
   * The sum of the caller's content-profile weights over the game's features:
   * positive for what they rank above their average, negative below. 0 for a
   * user with fewer than two ranked games, who has no profile.
   */
  boost: number;
}

/** The engine's guess for one game of a batch. */
export interface BatchPrediction {
  mediaItemId: string;
  /** On the caller's own 0 to 10 scale. Never null: the prior falls back to the external score, then 6.5. */
  predictedScore: number;
  /** needs_more_data below five ranked games, medium below fifteen, high from fifteen. */
  confidence: PredictionConfidence;
}

/** One played game the caller has not ranked. */
export interface PlayedNotRankedRow extends OnboardingGameRow {
  /** `YYYY-MM-DD`, or null when no day was recorded. The list is newest first by this. */
  finishedAt: string | null;
  /** When the entry was made, an ISO timestamp; the tie-break after `finishedAt`. */
  addedAt: string;
}

/**
 * One page of the deck: popular games on any of `platforms` that the caller
 * has neither tracked nor ranked, most popular first, with each row's
 * `popularityRank` and `boost` for `orderDeck(rows, { pinned: 3 })` from
 * @verso/core (pass `pinned: 0` for a page after the first).
 *
 * `platforms` is the profile's list (`Profile.platforms`, IGDB names); null or
 * empty means every platform, the "Popular everywhere" deck. `limit` is
 * clamped by the database to 1..50 and defaults to ten, the page; `offset`
 * counts rows, so "Show 10 more" asks for `offset + 10`. A negative offset
 * throws 22023.
 *
 * Popularity is IGDB's rating count today, the signal `popularGames` reads;
 * publishers' sales figures replace it later (decision 20).
 */
export async function deckCandidates(
  client: Client,
  platforms: readonly string[] | null,
  limit = 10,
  offset = 0,
): Promise<DeckCandidateRow[]> {
  const { data, error } = await client.rpc('deck_candidates', {
    // An empty list is sent as one: the database reads it as no filter, the
    // same as null, which the generated Args type cannot spell.
    p_platforms: platforms === null ? [] : [...platforms],
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    mediaItemId: row.media_item_id,
    title: row.title,
    year: row.year ?? null,
    coverImageId: row.cover_image_id ?? null,
    externalIds: row.external_ids,
    genres: row.genres,
    platforms: row.platforms,
    popularityRank: row.popularity_rank,
    boost: Number(row.boost),
  }));
}

/**
 * The engine's guess for each game of a batch session, for the caller alone:
 * copy each row's `predictedScore` and `confidence` onto the matching
 * `BatchItem` before `startBatch`. Ids the catalog does not have, and games of
 * another medium, get no row; treat a missing row as no guess, which the batch
 * engine already handles. Rows come back in the order the ids were given.
 *
 * At most 500 ids (the database throws 22023 above that); an empty list
 * returns nothing without a round trip. The guess reads the caller's ranked
 * list as it is stored, so the tiers chosen in this session count once the
 * session's writes land, not before.
 */
export async function batchPredictions(
  client: Client,
  medium: Medium,
  mediaItemIds: readonly string[],
): Promise<BatchPrediction[]> {
  if (mediaItemIds.length === 0) return [];
  const { data, error } = await client.rpc('batch_predictions', {
    p_medium: medium,
    p_items: [...mediaItemIds],
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    mediaItemId: row.media_item_id,
    predictedScore: Number(row.predicted_score),
    confidence: row.confidence as PredictionConfidence,
  }));
}

/**
 * The drain: the caller's played games in one medium with no ranking yet,
 * newest first (the day finished, then when added; undated last). Ranking's
 * banner counts it ("{n} played games to rank") and the session runs over it
 * with no tiers yet. A game leaves it the moment `finishInsertion` places it,
 * provisional or not.
 */
export async function playedNotRanked(client: Client, medium: Medium): Promise<PlayedNotRankedRow[]> {
  const { data, error } = await client.rpc('played_not_ranked', { p_medium: medium });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    mediaItemId: row.media_item_id,
    title: row.title,
    year: row.year ?? null,
    coverImageId: row.cover_image_id ?? null,
    externalIds: row.external_ids,
    genres: row.genres,
    platforms: row.platforms,
    finishedAt: row.finished_at ?? null,
    addedAt: row.added_at,
  }));
}
