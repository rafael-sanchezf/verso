/**
 * The handful of facts this flow draws a game with, and the short tier words
 * the confirm step uses.
 *
 * Two different reads feed the same cards: `gamePage` for the game being
 * ranked and `tier_list` rows for the ones it is compared against. Both become
 * a `LogGame` at the edge, so nothing below here has to know which read a game
 * came from, and the engine's `RankableItem` stays what it is — an id and some
 * genres — instead of growing a title and a cover.
 */

import { coverCandidates, type GamePage, type TierListRow } from '@verso/api';
import type { RankableItem, Tier } from '@verso/core';

import type { TranslationKey } from '../../lib/i18n/dictionary';

export interface LogGame {
  /** `media_items.id`, the same id the engine ranks by. */
  readonly id: string;
  readonly title: string;
  readonly genres: readonly string[];
  /** From `coverCandidates`, best first; empty means the placeholder. */
  readonly candidates: readonly string[];
}

export function gameFromPage(page: GamePage): LogGame {
  return {
    id: page.mediaItemId,
    title: page.title,
    genres: page.game?.genres ?? [],
    candidates: coverCandidates(page),
  };
}

export function gameFromTierRow(row: TierListRow): LogGame {
  return {
    id: row.media_item_id,
    title: row.title,
    genres: row.genres,
    candidates: coverCandidates(row),
  };
}

/** What the engine needs, out of what the screen already has. */
export function rankable(game: LogGame): RankableItem {
  return { id: game.id, genres: game.genres };
}

/**
 * The tier named inside a sentence: "lands at #4 in Liked", "First in Loved".
 *
 * Not `TIER_LABELS` ("Liked it"), which is the chip's wording (and, since
 * decision 29, the Ranking divider's) and does not fit in a sentence. That
 * lives in `src/ui`, which belongs to the shell, so this form is spelled here
 * rather than added there (specs/log-flow.md, step 3). Dictionary keys, which
 * the steps say (the Spanish wave).
 */
export const TIER_IN_SENTENCE: Readonly<Record<Tier, TranslationKey>> = {
  loved: 'browse.log.tierInSentence.loved',
  liked: 'browse.log.tierInSentence.liked',
  fine: 'browse.log.tierInSentence.fine',
  disliked: 'browse.log.tierInSentence.disliked',
};

/** The tier step's rows, the chip's words, as dictionary keys. */
export const TIER_ROW_LABELS: Readonly<Record<Tier, TranslationKey>> = {
  loved: 'browse.log.tiers.loved',
  liked: 'browse.log.tiers.liked',
  fine: 'browse.log.tiers.fine',
  disliked: 'browse.log.tiers.disliked',
};

/** One decimal, as every score in the app is written. */
export function scoreText(score: number): string {
  return score.toFixed(1);
}
