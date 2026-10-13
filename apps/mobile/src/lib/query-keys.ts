/**
 * Every TanStack Query key the app uses, in one place.
 *
 * Seven screens read overlapping data — the game page and the add-to
 * sheet want the same row, Home and Next want the same backlog — and a key
 * spelled differently in two files is two caches that never agree. So the keys
 * are built here and nothing constructs one inline.
 *
 * The shapes match docs/design/specs/README.md, "Data". The onboarding's three
 * reads (the deck's pages, the played-not-ranked drain, a batch's guesses) are
 * spelled in `@verso/api` beside the reads they key (onboarding-keys.ts, PR
 * #73) and spread in here, so the two packages cannot drift.
 */

import { onboardingQueryKeys } from '@verso/api';
import type { Medium } from '@verso/core';

/** The key for one query, as TanStack stores it. */
export type QueryKey = readonly unknown[];

export const queryKeys = {
  /** `playing` in views.ts. `upNext` is the same list limited to three. */
  playing: () => ['playing'] as const,
  /** `backlog` in views.ts, in the user's order. */
  backlog: () => ['backlog'] as const,
  /** `upcoming` in views.ts. `comingUp` is the same list limited to three. */
  upcoming: () => ['upcoming'] as const,

  /** `gamePage(client, id)`: the catalog row, the entry, the scores. */
  game: (id: string) => ['game', id] as const,
  /** `latestPlayerCount(client, id)`, Steam games only. */
  playerCount: (id: string) => ['player-count', id] as const,

  /**
   * The four `tierList` calls assembled best tier first, for one medium.
   * `['ranking']` is still the prefix every medium's list shares, which is
   * what `invalidateRanking` clears.
   */
  ranking: (medium: Medium = 'game') => ['ranking', medium] as const,
  /** One tier on its own, for the log flow's comparisons; `['tier']` is the prefix. */
  tier: (tier: string, medium: Medium = 'game') => ['tier', tier, medium] as const,

  /** `profileStats(client)`. */
  profileStats: () => ['profile', 'stats'] as const,
  /** `recentRankings(client, n)`. */
  profileRecent: () => ['profile', 'recent'] as const,
  /** `getMyProfile(client)`. */
  profileMe: () => ['profile', 'me'] as const,

  /** `searchGames(client, query)`, debounced by the Search screen. */
  search: (query: string, medium: Medium = 'game') => ['search', query, medium] as const,
  /**
   * The catalog's most-rated games; see specs/search.md.
   *
   * Keyed by how many were asked for. Two screens want this list at two
   * lengths — Search's Popular section wants five, the signed-out cover wall
   * wants fifteen — and a single `['popular']` holding whichever of them
   * mounted first would leave the other drawing the wrong number of rows.
   * specs/README.md writes the key as `['popular']`, which is still the prefix
   * of both, so anything matching on it matches both.
   */
  popular: (limit: number = 5, medium: Medium = 'game') => ['popular', limit, medium] as const,
  /**
   * `trackedMediaItemIds(client, ids)`: which of the games on screen are
   * already in the library, for Search's check-instead-of-plus.
   *
   * Keyed by the ids themselves, because the answer is only about those ids.
   * The caller passes a sorted, de-duplicated list so that two screens showing
   * the same rows in a different order share one cache entry.
   * `invalidateEntry` clears every one of them by the `['tracked']` prefix.
   */
  tracked: (ids: readonly string[]) => ['tracked', ids] as const,
  /**
   * `releaseDates(client, ids)`: the release dates of the games on screen, for
   * the pills of Search's two intents. Keyed like `tracked`,
   * by a sorted, de-duplicated list. Catalog data, so no entry write clears it.
   */
  releaseDates: (ids: readonly string[]) => ['release-dates', ids] as const,

  /**
   * `getSteamLink(client)`: the caller's Steam link, or null when there is
   * none. Under `['steam']` with the candidates so one prefix clears both after
   * a link, an import or an unlink (`invalidateSteam`).
   */
  steamLink: () => ['steam', 'link'] as const,
  /** `steamCandidates(client, limit)`: Steam games the caller has no entry for. */
  steamCandidates: () => ['steam', 'candidates'] as const,

  /**
   * The onboarding's reads, from `@verso/api` (onboarding-keys.ts):
   * `deck(platforms, offset, limit)` under `['deck']`, one page of
   * `deckCandidates`; `playedNotRanked(medium)` under `['played-not-ranked']`,
   * the drain and Ranking's banner count; `batchPredictions(medium, ids)` under
   * `['batch-predictions']`, one session's guesses. `invalidateOnboarding`
   * clears all three by those prefixes.
   */
  ...onboardingQueryKeys,

  /**
   * The movie screens' reads (movies-build.md, PR 2), all under `['movies']`
   * so `invalidateEntry` clears every one of them with one prefix: a diary
   * row, a planned day or a watchlist change can move a film between the
   * Watchlist, the Calendar and its page.
   *
   * `movieWatchlist(filters)` is keyed by the filters the RPC takes (services,
   * length, genres); `movieWatchlistAll` is the unfiltered list the screen
   * reads its genres and directors from.
   */
  movieWatchlist: (filters: { onMyServices: boolean; maxMinutes: number | null; genres: readonly string[] }) =>
    ['movies', 'watchlist', filters.onMyServices, filters.maxMinutes, [...filters.genres].sort()] as const,
  movieWatchlistAll: () => ['movies', 'watchlist', 'all'] as const,
  movieCalendar: () => ['movies', 'calendar'] as const,
  /** The movie page's read for one film in one region. */
  moviePage: (id: string, region: string) => ['movies', 'page', id, region] as const,
  /** `movieReleaseState` for one film in one region: the theatrical line. */
  movieRelease: (id: string, region: string) => ['movies', 'release', id, region] as const,
  /** `diaryFor(client, id)`: one film's diary, newest first. */
  diaryFor: (id: string) => ['movies', 'diary', id] as const,
  /** `movieFacts(client, id)`: the log sheet's and the log flow's few facts about a film. */
  movieFacts: (id: string) => ['movies', 'facts', id] as const,
} as const;
