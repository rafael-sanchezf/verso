/**
 * The TanStack Query keys for the onboarding's reads, and what to invalidate
 * after the writes that change them (docs/design/specs/onboarding.md and
 * batch-session.md).
 *
 * The app's keys live in apps/mobile/src/lib/query-keys.ts and its
 * invalidation in apps/mobile/src/lib/invalidate.ts, both the shell's. These
 * are here, beside the reads they key, so the screens' pull request can fold
 * them in rather than spell them again: spread `onboardingQueryKeys` into
 * `queryKeys`, and call `invalidateOnboarding` from `invalidateEntry` and
 * `invalidateRanking`, since every entry write and every ranking write moves a
 * game into or out of the deck and the drain. Spelled out once here, a key
 * cannot drift between the two packages.
 *
 * The profile read keeps the shell's key, `['profile', 'me']`, so
 * `invalidateProfile` clears it by the `['profile']` prefix the shell already
 * uses for stats, recent and me.
 *
 * Typed against the one method these call, not against TanStack's
 * `QueryClient`, so @verso/api does not depend on React Query; a TanStack
 * `QueryClient` satisfies `QueryInvalidator` as it is. Refetches use
 * `refetchType: 'all'` for the reason invalidate.ts gives: a screen under a
 * presented sheet has no active observer, and the default would leave it
 * stale.
 */

import type { Medium } from '@verso/core';

/** The one method of TanStack's `QueryClient` the helpers below call. */
export interface QueryInvalidator {
  invalidateQueries(filters: {
    queryKey: readonly unknown[];
    refetchType?: 'active' | 'inactive' | 'all' | 'none';
  }): Promise<unknown>;
}

/** A sorted, de-duplicated copy, so two screens asking about the same set share one cache entry. */
function canonical(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export const onboardingQueryKeys = {
  /**
   * `deckCandidates(client, platforms, limit, offset)`: one page. Under
   * `['deck']`, so one prefix clears every page. The platforms are sorted so
   * the profile's order does not split the cache; null and empty are the same
   * deck and the same key. The film deck (`medium: 'movie'`, which ignores
   * the platforms) carries the medium at the end, so it never answers from a
   * games page; the games key keeps its shape.
   */
  deck: (platforms: readonly string[] | null, offset = 0, limit = 10, medium: Medium = 'game') =>
    medium === 'game'
      ? (['deck', canonical(platforms ?? []), limit, offset] as const)
      : (['deck', canonical(platforms ?? []), limit, offset, medium] as const),
  /** `playedNotRanked(client, medium)`: the drain, and the banner's count. */
  playedNotRanked: (medium: Medium) => ['played-not-ranked', medium] as const,
  /**
   * `batchPredictions(client, medium, ids)`: the guesses for one session's
   * games, keyed by the ids sorted, which is the set the answer is about.
   */
  batchPredictions: (medium: Medium, mediaItemIds: readonly string[]) =>
    ['batch-predictions', medium, canonical(mediaItemIds)] as const,
} as const;

const REFETCH_EVERYTHING = { refetchType: 'all' } as const;

/**
 * After any write that adds, removes, re-statuses or ranks a game: the
 * onboarding's three reads, by prefix. The deck leaves out every game the
 * caller tracks or has ranked, the drain is the played games not yet ranked,
 * and the guesses and the deck's boost read the ranked list. The shell's
 * `invalidateEntry` and `invalidateRanking` should call this.
 */
export function invalidateOnboarding(queryClient: QueryInvalidator): void {
  void queryClient.invalidateQueries({ queryKey: ['deck'], ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: ['played-not-ranked'], ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: ['batch-predictions'], ...REFETCH_EVERYTHING });
}

/**
 * After `setProfilePlatforms` or `setProfileMedia`: the caller's profile
 * (`['profile', 'me']`, by the shell's `['profile']` prefix) and the deck,
 * whose pages are filtered by the platforms.
 */
export function invalidateProfile(queryClient: QueryInvalidator): void {
  void queryClient.invalidateQueries({ queryKey: ['profile'], ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: ['deck'], ...REFETCH_EVERYTHING });
}
