/**
 * Steam's review summary phrase, computed rather than stored.
 *
 * Rule 21 in docs/design/ui-principles.md: "Steam reviews are a phrase
 * ('Mostly positive'), never a number next to a metascore." The catalog stores
 * only the two facts Valve gives us, the positive percentage and the review
 * count (`external_scores` source `steam`), and the phrase is derived here.
 *
 * Deriving rather than storing is deliberate. `appreviews` does return its own
 * `review_score_desc`, but caching that string would mean a second
 * representation of the same fact that can drift out of step with the
 * percentage we display next to it, and it would be another thing to migrate
 * if the wording ever changes. One source of truth, one pure function.
 *
 * The thresholds are Valve's published ones, from the Steam support page "Steam
 * Review Score" and the store's own summary bar:
 *
 *   | phrase                    | positive %  | reviews   |
 *   | ------------------------- | ----------- | --------- |
 *   | Overwhelmingly Positive   | 95 - 100    | 500+      |
 *   | Very Positive             | 80 - 100    | 50+       |
 *   | Positive                  | 80 - 100    | 10 - 49   |
 *   | Mostly Positive           | 70 - 79     | 10+       |
 *   | Mixed                     | 40 - 69     | 10+       |
 *   | Mostly Negative           | 20 - 39     | 10+       |
 *   | Negative                  | 0 - 19      | 10 - 49   |
 *   | Very Negative             | 0 - 19      | 50+       |
 *   | Overwhelmingly Negative   | 0 - 19      | 500+      |
 *
 * Below 10 reviews Steam shows no summary at all, and neither do we: the
 * function returns null and the UI shows nothing rather than calling four
 * thumbs-up "Very Positive".
 */

import type { Language } from './language';

/** Every phrase Steam can show, best to worst. */
export const STEAM_REVIEW_PHRASES = [
  'Overwhelmingly Positive',
  'Very Positive',
  'Positive',
  'Mostly Positive',
  'Mixed',
  'Mostly Negative',
  'Negative',
  'Very Negative',
  'Overwhelmingly Negative',
] as const;

export type SteamReviewPhrase = (typeof STEAM_REVIEW_PHRASES)[number];

/**
 * Steam's own wording for each phrase on its Latin American Spanish store
 * (docs/design/spanish-build.md, wave 7). Steam writes these in sentence case,
 * the reviews being feminine plural ("reseñas"), so its capitalization is kept
 * rather than English's title case. The English phrase stays the identity:
 * this is a label for it, never a second thing to compute.
 */
const STEAM_REVIEW_PHRASES_ES: Readonly<Record<SteamReviewPhrase, string>> = {
  'Overwhelmingly Positive': 'Extremadamente positivas',
  'Very Positive': 'Muy positivas',
  Positive: 'Positivas',
  'Mostly Positive': 'Mayormente positivas',
  Mixed: 'Variadas',
  'Mostly Negative': 'Mayormente negativas',
  Negative: 'Negativas',
  'Very Negative': 'Muy negativas',
  'Overwhelmingly Negative': 'Extremadamente negativas',
};

/** A phrase as Steam shows it in a language: `Very Positive`, `Muy positivas`. */
export function steamReviewPhraseLabel(phrase: SteamReviewPhrase, language: Language = 'en'): string {
  return language === 'es' ? STEAM_REVIEW_PHRASES_ES[phrase] : phrase;
}

/** Fewer reviews than this and Steam shows no summary. */
export const STEAM_REVIEW_MINIMUM = 10;

/** The count at which "Positive" becomes "Very Positive", and so on downwards. */
export const STEAM_REVIEW_MANY = 50;

/** The count the two "Overwhelmingly" phrases need. */
export const STEAM_REVIEW_OVERWHELMING = 500;

/**
 * Steam's summary phrase for a positive percentage and a review count.
 *
 * @param percentPositive Positive reviews as a percentage, 0 to 100. This is
 *   the figure stored in `external_scores.score` for source `steam`, so it is
 *   already rounded to two decimals; the thresholds are inclusive lower bounds
 *   so the rounding cannot move a game across one by accident.
 * @param totalReviews Total reviews behind that percentage,
 *   `external_scores.score_count`.
 * @returns The phrase, or null when there is nothing honest to say: fewer than
 *   {@link STEAM_REVIEW_MINIMUM} reviews, or an input that is not a real
 *   percentage or a real count.
 */
export function steamReviewPhrase(
  percentPositive: number,
  totalReviews: number,
): SteamReviewPhrase | null {
  if (!Number.isFinite(percentPositive) || percentPositive < 0 || percentPositive > 100) return null;
  if (!Number.isInteger(totalReviews) || totalReviews < STEAM_REVIEW_MINIMUM) return null;

  if (percentPositive >= 95 && totalReviews >= STEAM_REVIEW_OVERWHELMING) {
    return 'Overwhelmingly Positive';
  }
  if (percentPositive >= 80) {
    return totalReviews >= STEAM_REVIEW_MANY ? 'Very Positive' : 'Positive';
  }
  if (percentPositive >= 70) return 'Mostly Positive';
  if (percentPositive >= 40) return 'Mixed';
  if (percentPositive >= 20) return 'Mostly Negative';

  if (totalReviews >= STEAM_REVIEW_OVERWHELMING) return 'Overwhelmingly Negative';
  if (totalReviews >= STEAM_REVIEW_MANY) return 'Very Negative';
  return 'Negative';
}
