/**
 * The onboarding's query keys and invalidation helpers. Pure: no stack, so this
 * runs everywhere `pnpm test` does.
 */

import { describe, expect, it } from 'vitest';
import {
  invalidateOnboarding,
  invalidateProfile,
  onboardingQueryKeys,
  type QueryInvalidator,
} from '../src/onboarding-keys';

/** Records what a helper asked to invalidate, in order. */
function recorder(): QueryInvalidator & { calls: { queryKey: readonly unknown[]; refetchType?: string }[] } {
  const calls: { queryKey: readonly unknown[]; refetchType?: string }[] = [];
  return {
    calls,
    invalidateQueries: async (filters) => {
      calls.push(filters);
    },
  };
}

describe('onboardingQueryKeys', () => {
  it("keys a deck page by its platforms in sorted order, so the profile's order does not split the cache", () => {
    expect(onboardingQueryKeys.deck(['PlayStation 5', 'Nintendo Switch'], 10)).toEqual(
      onboardingQueryKeys.deck(['Nintendo Switch', 'PlayStation 5', 'PlayStation 5'], 10),
    );
    expect(onboardingQueryKeys.deck(['PlayStation 5'], 10)).toEqual(['deck', ['PlayStation 5'], 10, 10]);
  });

  it('keys no platforms and an empty list the same, as the database reads them', () => {
    expect(onboardingQueryKeys.deck(null)).toEqual(onboardingQueryKeys.deck([]));
    expect(onboardingQueryKeys.deck(null)).toEqual(['deck', [], 10, 0]);
  });

  it('keys each page of the deck apart', () => {
    expect(onboardingQueryKeys.deck(null, 0)).not.toEqual(onboardingQueryKeys.deck(null, 10));
  });

  it('keys the film deck apart from the games deck everywhere, under the same prefix', () => {
    expect(onboardingQueryKeys.deck(null, 0, 10, 'movie')).toEqual(['deck', [], 10, 0, 'movie']);
    expect(onboardingQueryKeys.deck(null, 0, 10, 'movie')).not.toEqual(onboardingQueryKeys.deck(null, 0, 10));
    expect(onboardingQueryKeys.deck(null, 0, 10, 'game')).toEqual(onboardingQueryKeys.deck(null));
  });

  it('keys the drain per medium', () => {
    expect(onboardingQueryKeys.playedNotRanked('game')).toEqual(['played-not-ranked', 'game']);
    expect(onboardingQueryKeys.playedNotRanked('movie')).not.toEqual(onboardingQueryKeys.playedNotRanked('game'));
  });

  it('keys a batch by its set of ids', () => {
    expect(onboardingQueryKeys.batchPredictions('game', ['b', 'a', 'b'])).toEqual(['batch-predictions', 'game', ['a', 'b']]);
  });

  it("does not reorder the caller's list while sorting the key", () => {
    const ids = ['b', 'a'];
    onboardingQueryKeys.batchPredictions('game', ids);
    expect(ids).toEqual(['b', 'a']);
  });
});

describe('invalidation', () => {
  it('clears the deck, the drain and the guesses by prefix after an entry or ranking write, refetching everything', () => {
    const client = recorder();
    invalidateOnboarding(client);
    expect(client.calls).toEqual([
      { queryKey: ['deck'], refetchType: 'all' },
      { queryKey: ['played-not-ranked'], refetchType: 'all' },
      { queryKey: ['batch-predictions'], refetchType: 'all' },
    ]);
  });

  it('clears the profile and the deck after a profile write', () => {
    const client = recorder();
    invalidateProfile(client);
    expect(client.calls).toEqual([
      { queryKey: ['profile'], refetchType: 'all' },
      { queryKey: ['deck'], refetchType: 'all' },
    ]);
  });

  it('covers every key it hands out', () => {
    const client = recorder();
    invalidateOnboarding(client);
    const prefixes = client.calls.map((call) => call.queryKey[0]);
    const keys = [
      onboardingQueryKeys.deck(null),
      onboardingQueryKeys.playedNotRanked('game'),
      onboardingQueryKeys.batchPredictions('game', ['a']),
    ];
    for (const key of keys) expect(prefixes).toContain(key[0]);
  });
});
