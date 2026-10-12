/**
 * The hrefs the session and the review navigate to, every one typed by Expo
 * Router from `src/app`: the session's own two routes, the tabs, the
 * onboarding deck and Link Steam, and Search's add-many intent
 * (`searchHref`, whose pathname is the typed route).
 */

import type { Href } from 'expo-router';

import { searchHref } from '@/screens/search/intent';

import type { RankMoreTarget } from './navigation';

export const SESSION_HREF = '/onboarding/session' satisfies Href;
export const REVIEW_HREF = '/onboarding/review' satisfies Href;
export const TABS_HREF = '/' satisfies Href;

export const DECK_HREF = '/onboarding/deck' satisfies Href;
export const DECK_RETURNING_HREF = { pathname: '/onboarding/deck', params: { from: 'ranking' } } satisfies Href;
export const STEAM_HREF = '/onboarding/steam' satisfies Href;
export const SEARCH_ADD_MANY_HREF = searchHref('addmany') satisfies Href;

/** The href "Rank more" opens, when it opens one rather than going back. */
export function rankMoreHref(target: Exclude<RankMoreTarget, 'back-to-deck'>): Href {
  switch (target) {
    case 'deck-returning':
      return DECK_RETURNING_HREF;
    case 'deck-new':
      return DECK_HREF;
    case 'search-add-many':
      return SEARCH_ADD_MANY_HREF;
  }
}
