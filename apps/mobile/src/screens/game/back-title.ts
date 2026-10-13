/**
 * The back button's words on the game and movie pages.
 *
 * Every screen that pushes a page passes the tab it is on as `from` ("Home",
 * "Next", "Ranking"...), an English name that is also an identifier. The page
 * says it in the app's language (the Spanish wave); a name it does not know
 * reads as it came, so a new caller is never left without a back title.
 */

import type { Say } from './phrase';

const BACK_TITLES = {
  Home: 'browse.backTitles.Home',
  Next: 'browse.backTitles.Next',
  Ranking: 'browse.backTitles.Ranking',
  Search: 'browse.backTitles.Search',
  Steam: 'browse.backTitles.Steam',
  Activity: 'browse.backTitles.Activity',
  Profile: 'browse.backTitles.Profile',
  Watchlist: 'browse.backTitles.Watchlist',
} as const;

export function backTitle(from: string | undefined, t: Say): string | undefined {
  if (from === undefined) return undefined;
  const key = (BACK_TITLES as Readonly<Record<string, (typeof BACK_TITLES)[keyof typeof BACK_TITLES]>>)[from];
  return key ? t(key) : from;
}
