/**
 * Search with a job to do: the `intent` route param.
 *
 * Plain Search answers "find a game" and leaves what to do with it to the
 * add-to sheet. An intent is a visit that already knows: Home's empty Playing
 * card sends "Search a new game" here as `/search?intent=playing`, and in that
 * visit each row's trailing control marks the game Playing in one tap and goes
 * back to Home (specs/search.md, Playing intent; phone-feedback entry 1).
 *
 * The param is a request, not state, the same way the Ranking tab's `focus` is:
 * the Search screen reads it once, keeps the intent in its own state and takes
 * the param off the route, so a later plain visit to the tab is plain Search.
 * The intent then lasts for that visit only and ends when another tab is
 * selected. Opening a game page from a result is not leaving: the page is
 * pushed over the tabs, Search stays the selected tab, and coming back from it
 * finds the intent still on.
 *
 * No React and no `react-native` import, so the rules here run in the Vitest
 * node environment (`apps/mobile/test/search-intent.test.ts`).
 */

import { releaseState } from '@verso/api';

/**
 * Every intent Search knows: `playing` (Home's "Search a new game") and
 * `addmany` (Ranking's "I know what I played", specs/onboarding.md, "The
 * doors"), whose rules are in `add-many.ts`.
 */
export const SEARCH_INTENTS = ['playing', 'addmany'] as const;

export type SearchIntent = (typeof SEARCH_INTENTS)[number];

/**
 * The Playing intent's pill for one row: `play` for a game that is out, `add`
 * for one that is not (phone feedback entry 10).
 *
 * Nobody is playing a game that has not come out, so its row keeps the plain
 * add pill, which opens the add sheet, and the sheet offers the one thing
 * that is true of it ("Want to play", `add-options.ts`). Out or not is
 * `releaseState`, the rule the add sheet and Coming up apply.
 *
 * `releaseDate` is `undefined` until the screen's read of the dates answers
 * for this row, and `releaseState` reads that as out, the same as an undated
 * game: the pill does not flicker on every keystroke, and the write behind it
 * (`use-start-playing.ts`) asks again before it marks anything Playing.
 */
export function playingIntentControl(
  releaseDate: string | null | undefined,
  options: { today?: string } = {},
): 'play' | 'add' {
  return releaseState(releaseDate, options).released ? 'play' : 'add';
}

/**
 * The route param as an intent, or null for plain Search.
 *
 * Expo Router hands a param over as a string, or as an array when the query
 * string repeats the key; the first value wins. Anything that is not exactly a
 * known intent, including the empty string the screen writes back to clear
 * it, is plain Search: an unknown value from an old link must not put the
 * screen in a mode it has no drawing for.
 */
export function parseSearchIntent(value: string | readonly string[] | null | undefined): SearchIntent | null {
  const first = typeof value === 'string' ? value : value?.[0];
  return (SEARCH_INTENTS as readonly string[]).includes(first ?? '') ? (first as SearchIntent) : null;
}

/**
 * The href that opens Search in an intent.
 *
 * The pathname is the typed route (`pnpm typecheck` checks it against
 * `src/app`); the param's value is typed here, since Expo Router types a static
 * route's params only as "anything".
 */
export function searchHref(intent: SearchIntent) {
  return { pathname: '/search', params: { intent } } as const;
}

/** What the tab navigator's state looks like to the check below. */
export interface TabState {
  index: number;
  routes: readonly { key: string }[];
}

/**
 * Whether this route is still the selected tab.
 *
 * The intent ends when this turns false. It is the tab navigator's own index
 * rather than screen focus, because focus is also lost when a game page is
 * pushed over the tabs, and a look at a game from the results is part of the
 * same visit. An unknown state (no navigator yet) keeps the intent.
 */
export function isSelectedTab(state: TabState | null | undefined, routeKey: string): boolean {
  if (!state) return true;
  return state.routes[state.index]?.key === routeKey;
}
