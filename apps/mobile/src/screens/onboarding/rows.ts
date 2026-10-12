/**
 * Search's rows as the `OnboardingGameRow` the session draws its cards from
 * (batch-session.md, the hand-off: "A passes the deck rows it already has, so
 * B never refetches covers").
 *
 * The deck's rows already are one. The seeds and Search's add-many intent find
 * their games through `searchGames` and `popularGames`, whose rows spell the
 * same facts in snake case and leave one out: a Popular row has no genres (the
 * genre cue and the genre-preferring pivot then have nothing to match, which
 * the engine already handles). Both carry `external_ids`, so a game IGDB has
 * no cover for falls back to its Steam art here as everywhere else.
 *
 * No React and no `react-native` import (`test/onboarding-rows.test.ts`).
 */

import type { OnboardingGameRow, PopularGameRow, SearchGameRow } from '@verso/api';

export function fromSearchRow(
  row: Pick<
    SearchGameRow,
    'media_item_id' | 'title' | 'year' | 'cover_image_id' | 'external_ids' | 'genres' | 'platforms'
  >,
): OnboardingGameRow {
  return {
    mediaItemId: row.media_item_id,
    title: row.title,
    year: row.year ?? null,
    coverImageId: row.cover_image_id ?? null,
    externalIds: row.external_ids ?? null,
    genres: row.genres ?? [],
    platforms: row.platforms ?? [],
  };
}

export function fromPopularRow(
  row: Pick<PopularGameRow, 'id' | 'title' | 'year' | 'cover_image_id' | 'external_ids' | 'platforms'>,
): OnboardingGameRow {
  return {
    mediaItemId: row.id,
    title: row.title,
    year: row.year ?? null,
    coverImageId: row.cover_image_id ?? null,
    externalIds: row.external_ids ?? null,
    genres: [],
    platforms: row.platforms ?? [],
  };
}
