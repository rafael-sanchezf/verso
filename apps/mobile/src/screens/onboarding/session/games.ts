/**
 * The handful of facts the session and the review draw a game with.
 *
 * Two reads feed the same cards and rows: the request's `OnboardingGameRow`s
 * for the games being placed (camelCase, from the deck, the seeds, the drain)
 * and `tier_list` rows for the games already ranked (snake case, straight off
 * the RPC). Both become a `SessionGame` at the edge, which is the log flow's
 * `LogGame` plus a year, so `CompareCard` draws either one unchanged and the
 * engine's `RankableItem` stays an id and some genres.
 *
 * No `react-native` import: the unit suite runs in node.
 */

import { coverCandidates, type OnboardingGameRow, type TierListRow } from '@verso/api';
import type { RankableItem } from '@verso/core';

import type { LogGame } from '../../log/game';
import { displayGenres } from '../../ranking/model';

export interface SessionGame extends LogGame {
  readonly year: number | null;
}

export function gameFromOnboardingRow(row: OnboardingGameRow): SessionGame {
  return {
    id: row.mediaItemId,
    title: row.title,
    year: row.year ?? null,
    genres: row.genres ?? [],
    candidates: coverCandidates(row),
  };
}

export function gameFromTierListRow(row: TierListRow): SessionGame {
  return {
    id: row.media_item_id,
    title: row.title,
    year: row.year ?? null,
    genres: row.genres ?? [],
    candidates: coverCandidates({
      cover_image_id: row.cover_image_id ?? null,
      external_ids: row.external_ids ?? null,
    }),
  };
}

/** What the engine needs, out of what the screen already has. */
export function rankableOf(game: { readonly id: string; readonly genres: readonly string[] }): RankableItem {
  return { id: game.id, genres: game.genres };
}

/**
 * "{year} · {first genre display name}", as the Ranking rows print it: the
 * year alone without a genre, the genre alone without a year, nothing when
 * neither is known (rule 9 and rule 20).
 */
export function gameSubtitle(game: Pick<SessionGame, 'year' | 'genres'>): string | null {
  const parts = [game.year === null ? null : String(game.year), displayGenres(game.genres)[0] ?? null];
  const present = parts.filter((part): part is string => part !== null && part !== '');
  return present.length === 0 ? null : present.join(' · ');
}
