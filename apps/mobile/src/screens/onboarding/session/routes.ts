/**
 * The hrefs the onboarding navigates to, every one typed by Expo Router from
 * `src/app`: the session's own two routes, the tabs, each medium's steps (the
 * seeds and the deck take `?medium=movie` for films; games is the bare
 * route), Link Steam and the Letterboxd door, and Search's add-many intent
 * (`searchHref`, whose pathname is the typed route).
 */

import type { Href } from 'expo-router';

import { searchHref } from '@/screens/search/intent';
import type { LiveMedium } from '@/state/medium';

import type { FirstStep } from '../flow';
import type { RankMoreTarget } from './navigation';

export const SESSION_HREF = '/onboarding/session' satisfies Href;
export const REVIEW_HREF = '/onboarding/review' satisfies Href;
export const TABS_HREF = '/' satisfies Href;

export const PLATFORMS_HREF = '/onboarding/platforms' satisfies Href;
export const SERVICES_HREF = '/onboarding/services' satisfies Href;
export const DECK_HREF = '/onboarding/deck' satisfies Href;
export const DECK_RETURNING_HREF = { pathname: '/onboarding/deck', params: { from: 'ranking' } } satisfies Href;
export const STEAM_HREF = '/onboarding/steam' satisfies Href;
export const LETTERBOXD_STEP_HREF = '/onboarding/letterboxd' satisfies Href;
/** The import #99 shipped under Settings → Data, which the Letterboxd door opens. */
export const LETTERBOXD_IMPORT_HREF = '/import/letterboxd' satisfies Href;
export const SEARCH_ADD_MANY_HREF = searchHref('addmany') satisfies Href;

/** The first screen of a medium's path (flow.ts). */
export function firstStepHref(step: FirstStep): Href {
  return step === 'services' ? SERVICES_HREF : PLATFORMS_HREF;
}

/** "Games you love", or "Films you love" with `?medium=movie`. */
export function seedsHref(medium: LiveMedium): Href {
  return medium === 'movie' ? { pathname: '/onboarding/seeds', params: { medium: 'movie' } } : '/onboarding/seeds';
}

/** The new user's deck page for a medium. */
export function deckHref(medium: LiveMedium): Href {
  return medium === 'movie' ? { pathname: '/onboarding/deck', params: { medium: 'movie' } } : DECK_HREF;
}

/** The returning user's deck page for a medium. */
export function deckReturningHref(medium: LiveMedium): Href {
  return medium === 'movie'
    ? { pathname: '/onboarding/deck', params: { from: 'ranking', medium: 'movie' } }
    : DECK_RETURNING_HREF;
}

/** The href "Rank more" opens, when it opens one rather than going back. */
export function rankMoreHref(target: Exclude<RankMoreTarget, 'back-to-deck'>, medium: LiveMedium = 'game'): Href {
  switch (target) {
    case 'deck-returning':
      return deckReturningHref(medium);
    case 'deck-new':
      return deckHref(medium);
    case 'search-add-many':
      return SEARCH_ADD_MANY_HREF;
  }
}
