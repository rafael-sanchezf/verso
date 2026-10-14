/**
 * VER-201: what refetches the Profile after a write. `invalidateProfile` by
 * medium and without one, `invalidateProfileSettings` with the deck, and the
 * two shared helpers the mutation sites call: `invalidateEntry` with `'movie'`
 * (the diary sheet's removeWatch and editWatch) and `invalidateRanking` (the
 * log flow's and the batch session's finishInsertion).
 *
 * A real TanStack `QueryClient` with every Profile key in its cache, each read
 * counting its fetches, so the test sees what was refetched, not what was
 * asked for.
 */

import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';

import {
  invalidateEntry,
  invalidateProfile,
  invalidateProfileSettings,
  invalidateRanking,
  isStaleAfterProfileWrite,
  refetchStaleProfile,
  profileKeyMedium,
} from '../src/lib/invalidate';
import { queryKeys } from '../src/lib/query-keys';

const PROFILE_KEYS = {
  me: queryKeys.profileMe(),
  recent: queryKeys.profileRecent(),
  gameStats: queryKeys.profileStatsFor('game'),
  movieStats: queryKeys.profileStatsFor('movie'),
  gamePercentile: queryKeys.profilePercentile('game'),
  moviePercentile: queryKeys.profilePercentile('movie'),
  allPercentile: queryKeys.profilePercentile('all'),
  gameHours: queryKeys.profileHours('game'),
  movieHours: queryKeys.profileHours('movie'),
  allHours: queryKeys.profileHours('all'),
  gameActivity: queryKeys.profileActivity('game', 2),
  movieActivity: queryKeys.profileActivity('movie', 2),
  allActivity: queryKeys.profileActivity('all', 2),
  gameMonth: queryKeys.profileActivityMonth(2026, 10, 'game'),
  movieMonth: queryKeys.profileActivityMonth(2026, 10, 'movie'),
  allMonth: queryKeys.profileActivityMonth(2026, 10, 'all'),
} as const;

type Name = keyof typeof PROFILE_KEYS;

const OTHER_KEYS = {
  deck: queryKeys.deck(null),
  ranking: queryKeys.ranking('movie'),
  catalog: queryKeys.watchProviders('US'),
} as const;

let client: QueryClient;
const fetches = new Map<string, number>();

/** A client holding every key above, fetched once, each counting its fetches. */
async function seeded(): Promise<QueryClient> {
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
  fetches.clear();
  for (const [name, queryKey] of Object.entries({ ...PROFILE_KEYS, ...OTHER_KEYS })) {
    await client.prefetchQuery({
      queryKey,
      queryFn: () => {
        fetches.set(name, (fetches.get(name) ?? 0) + 1);
        return name;
      },
    });
  }
  fetches.clear();
  return client;
}

/** The names refetched since seeding, once the refetches have run. */
async function refetched(): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return [...fetches.keys()].sort();
}

const names = (...list: string[]) => [...list].sort();
const ALL_PROFILE = Object.keys(PROFILE_KEYS) as Name[];
const FILM_AND_ALL: Name[] = [
  'me',
  'recent',
  'movieStats',
  'moviePercentile',
  'allPercentile',
  'movieHours',
  'allHours',
  'movieActivity',
  'allActivity',
  'movieMonth',
  'allMonth',
];

afterEach(() => client?.clear());

describe('profileKeyMedium', () => {
  it('reads the medium from any position, games from the bare stats key, and null for the rest', () => {
    expect(profileKeyMedium(PROFILE_KEYS.gameStats)).toBe('game');
    expect(profileKeyMedium(PROFILE_KEYS.movieStats)).toBe('movie');
    expect(profileKeyMedium(PROFILE_KEYS.movieMonth)).toBe('movie');
    expect(profileKeyMedium(PROFILE_KEYS.gameActivity)).toBe('game');
    expect(profileKeyMedium(PROFILE_KEYS.allHours)).toBeNull();
    expect(profileKeyMedium(PROFILE_KEYS.me)).toBeNull();
    expect(profileKeyMedium(PROFILE_KEYS.recent)).toBeNull();
    expect(profileKeyMedium(OTHER_KEYS.ranking)).toBeNull();
  });
});

describe('isStaleAfterProfileWrite', () => {
  it('never matches a key outside the Profile', () => {
    expect(isStaleAfterProfileWrite(OTHER_KEYS.ranking)).toBe(false);
    expect(isStaleAfterProfileWrite(OTHER_KEYS.ranking, 'movie')).toBe(false);
  });

  it('matches a Profile key added later under the prefix, with or without a medium', () => {
    expect(isStaleAfterProfileWrite(['profile', 'something-new'])).toBe(true);
    expect(isStaleAfterProfileWrite(['profile', 'something-new', 'all'], 'game')).toBe(true);
    expect(isStaleAfterProfileWrite(['profile', 'something-new', 'tv'], 'game')).toBe(false);
  });
});

describe('invalidateProfile', () => {
  it('refetches every Profile read when no medium is given, and nothing else', async () => {
    invalidateProfile(await seeded());
    expect(await refetched()).toEqual(names(...ALL_PROFILE));
  });

  it("refetches one medium's reads and 'all', the identity and the recent list, and leaves the other medium's", async () => {
    invalidateProfile(await seeded(), 'movie');
    expect(await refetched()).toEqual(names(...FILM_AND_ALL));
  });

  it('treats the bare stats key as the games count', async () => {
    invalidateProfile(await seeded(), 'game');
    const got = await refetched();
    expect(got).toContain('gameStats');
    expect(got).not.toContain('movieStats');
  });

  it('refetches a Profile read nothing is observing (the page under a sheet)', async () => {
    const queryClient = await seeded();
    expect(queryClient.getQueryCache().find({ queryKey: PROFILE_KEYS.allHours })?.getObserversCount()).toBe(0);
    invalidateProfile(queryClient, 'game');
    expect(await refetched()).toContain('allHours');
  });
});

describe('invalidateProfileSettings', () => {
  it('refetches every Profile read and the deck, for the media and platforms writes', async () => {
    invalidateProfileSettings(await seeded());
    expect(await refetched()).toEqual(names(...ALL_PROFILE, 'deck'));
  });
});

describe('the mutation sites', () => {
  it("the diary sheet's removeWatch and editWatch: a film's Profile reads and 'all', not the games'", async () => {
    invalidateEntry(await seeded(), 'film-1', 'movie');
    const got = await refetched();
    for (const name of FILM_AND_ALL) expect(got).toContain(name);
    expect(got).not.toContain('gameStats');
    expect(got).not.toContain('gamePercentile');
  });

  it('a placement finishing (invalidateRanking): every Profile read and the ranked list', async () => {
    invalidateRanking(await seeded(), 'game-1');
    const got = await refetched();
    for (const name of ALL_PROFILE) expect(got).toContain(name);
    expect(got).toContain('ranking');
    expect(got).not.toContain('catalog');
  });

  it("a film's placement from the log flow: the film's and 'all' Profile reads and the ranked list", async () => {
    invalidateRanking(await seeded(), 'film-1', 'movie');
    const got = await refetched();
    for (const name of FILM_AND_ALL) expect(got).toContain(name);
    expect(got).not.toContain('gameHours');
    expect(got).toContain('ranking');
  });
});

describe('refetchStaleProfile, on focus', () => {
  it('refetches the stale Profile reads on screen, and leaves fresh ones, unobserved ones and other keys alone', async () => {
    const queryClient = await seeded();
    // On screen: two Profile reads and the ranked list, as a mounted tab holds them.
    const observe = (queryKey: readonly unknown[]) => {
      // The seeded read's own counting queryFn, which an observer must carry.
      const queryFn = queryClient.getQueryCache().find({ queryKey, exact: true })!.options.queryFn;
      return new QueryObserver(queryClient, { queryKey, queryFn, staleTime: 30_000 }).subscribe(() => undefined);
    };
    const unsubscribe = [PROFILE_KEYS.me, PROFILE_KEYS.allHours, OTHER_KEYS.ranking].map(observe);
    fetches.clear();
    // A write's refetch that the frozen tab never got: stale, not refetched.
    await queryClient.invalidateQueries({ queryKey: PROFILE_KEYS.allHours, refetchType: 'none' });
    await queryClient.invalidateQueries({ queryKey: OTHER_KEYS.ranking, refetchType: 'none' });
    await queryClient.invalidateQueries({ queryKey: PROFILE_KEYS.movieStats, refetchType: 'none' });

    await refetchStaleProfile(queryClient);
    expect(await refetched()).toEqual(['allHours']);
    unsubscribe.forEach((stop) => stop());
  });
});
