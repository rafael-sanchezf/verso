/**
 * `/preview-profile` — the joint Profile's screens on fixed data, development
 * only, the way `/ask-preview` draws the ask sheet.
 *
 * The real screens need a session and the profile reads of
 * 20261014100000_profile_reads.sql on the project they talk to; this renders
 * the same components over a query cache seeded with the frames' sample data
 * (figma-kit/movies-site-round.md), so they can be checked on the simulator
 * or at 402 in a browser with no stack and no account. Registered under the
 * root layout's `__DEV__` guard, so a release build has no such route.
 *
 * Params: `screen` is `profile` (default), `activity` or `edit`; `media` is
 * `both` (default), `movie` or `game`; `empty=1` draws a profile with no
 * name, nothing ranked and no activity.
 */

import type { ActivityEvent, ActivityMonthEvent, Profile, ProfileStats, TierListRow } from '@verso/api';
import type { Medium, Tier } from '@verso/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { ActivityScreen } from '@/screens/profile/activity-screen';
import { EditProfileScreen } from '@/screens/profile/edit-profile-screen';
import { ProfileScreen } from '@/screens/profile/profile-screen';
import { RECENT_ROWS } from '@/screens/profile/data';

const tmdb = (path: string) => ({ cover_image_id: `/${path}`, external_ids: {} });
const steam = (appId: number) => ({ cover_image_id: null, external_ids: { steam: appId } });

const FILMS = [
  { id: 'dark-knight', title: 'The Dark Knight', year: 2008, ...tmdb('qJ2tW6WMUDux911r6m7haRef0WH.jpg') },
  { id: 'dune-two', title: 'Dune: Part Two', year: 2024, ...tmdb('6izwz7rsy95ARzTR3poZ8H6c5pp.jpg') },
  { id: 'interstellar', title: 'Interstellar', year: 2014, ...tmdb('yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg') },
  { id: 'inception', title: 'Inception', year: 2010, ...tmdb('xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg') },
  { id: 'prestige', title: 'The Prestige', year: 2006, ...tmdb('Ag2B2KHKQPukjH7WutmgnnSNurZ.jpg') },
  { id: 'barbie', title: 'Barbie', year: 2023, ...tmdb('iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg') },
];
const GAMES = [
  { id: 'hades', title: 'Hades', year: 2020, ...steam(1145360) },
  { id: 'bg3', title: "Baldur's Gate 3", year: 2023, ...steam(1086940) },
  { id: 'elden-ring', title: 'Elden Ring', year: 2022, ...steam(1245620) },
  { id: 'outer-wilds', title: 'Outer Wilds', year: 2019, ...steam(753640) },
];
const UNRANKED = {
  parasite: { id: 'parasite', title: 'Parasite', ...tmdb('7IiTTgloJzvGI1TAYymCfbfl3vT.jpg') },
  getOut: { id: 'get-out', title: 'Get Out', ...tmdb('tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg') },
  topGun: { id: 'top-gun', title: 'Top Gun: Maverick', ...tmdb('n0YuM4f5lvGAP6MAW2kBIzugXnc.jpg') },
  oppenheimer: { id: 'oppenheimer', title: 'Oppenheimer', ...tmdb('8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg') },
};

function tiers(items: readonly { id: string; title: string; year: number; cover_image_id: string | null; external_ids: object }[]): Record<Tier, TierListRow[]> {
  return {
    loved: items.map((item, position) => ({
      media_item_id: item.id,
      title: item.title,
      year: item.year,
      cover_image_id: item.cover_image_id ?? null,
      external_ids: item.external_ids as never,
      genres: [],
      platforms: [],
      played_platforms: [],
      position,
      placed_by: 'user',
    })) as TierListRow[],
    liked: [],
    fine: [],
    disliked: [],
  };
}

function stats(ranked: number, played: number, backlog: number): ProfileStats {
  return { ranked, backlog, upcoming: 0, playing: 0, played, dropped: 0 };
}

function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function event(
  kind: ActivityEvent['kind'],
  item: { id: string; title: string; cover_image_id: string | null; external_ids: object },
  medium: Medium,
  offset: number,
  score: number | null,
): ActivityMonthEvent {
  const onDate = day(offset);
  return {
    kind,
    onDate,
    occurredAt: null,
    mediaItemId: item.id,
    medium,
    title: item.title,
    coverImageId: item.cover_image_id,
    externalIds: item.external_ids as never,
    score,
    place: null,
    day: Number(onDate.slice(8, 10)),
  };
}

function seed(media: Medium[], empty: boolean): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: Infinity } } });
  const profile: Profile = {
    id: 'preview',
    username: empty ? null : 'rafa',
    displayName: empty ? null : 'Rafa Sanchez',
    avatarUrl: null,
    createdAt: '2026-09-08T12:00:00.000Z',
    platforms: [],
    media,
    watchRegion: 'US',
    watchProviderIds: [],
    isPublic: false,
  };
  client.setQueryData(queryKeys.profileMe(), profile);
  client.setQueryData(queryKeys.profileStatsFor('game'), empty ? stats(0, 0, 0) : stats(48, 60, 12));
  client.setQueryData(queryKeys.profileStatsFor('movie'), empty ? stats(0, 0, 0) : stats(31, 31, 12));
  client.setQueryData(queryKeys.ranking('game'), tiers(empty ? [] : GAMES));
  client.setQueryData(queryKeys.ranking('movie'), tiers(empty ? [] : FILMS));
  for (const scope of ['all', 'game', 'movie'] as const) {
    client.setQueryData(queryKeys.profilePercentile(scope), empty ? null : scope === 'all' ? 92 : 88);
    client.setQueryData(queryKeys.profileHours(scope), empty ? 0 : scope === 'all' ? 128 : 64);
  }

  const events: ActivityMonthEvent[] = empty
    ? []
    : [
        event('watched', UNRANKED.getOut, 'movie', 0, null),
        event('watched', UNRANKED.topGun, 'movie', 0, null),
        event('watched', UNRANKED.oppenheimer, 'movie', 1, null),
        event('ranked', FILMS[4]!, 'movie', 2, 8.9),
        event('ranked', GAMES[0]!, 'game', 3, 9.8),
        event('finished', GAMES[2]!, 'game', 3, 9.4),
        event('ranked', FILMS[5]!, 'movie', 3, 7.9),
        event('ranked', FILMS[1]!, 'movie', 4, 9.6),
        event('watched', UNRANKED.parasite, 'movie', 10, null),
      ];
  const now = new Date();
  const thisMonth = events.filter((each) => Number(each.onDate.slice(5, 7)) === now.getMonth() + 1);
  for (const scope of ['all', 'game', 'movie'] as const) {
    const scoped = scope === 'all' ? events : events.filter((each) => each.medium === scope);
    client.setQueryData(queryKeys.profileActivity(scope, RECENT_ROWS), scoped.slice(0, RECENT_ROWS));
    client.setQueryData(
      queryKeys.profileActivityMonth(now.getFullYear(), now.getMonth() + 1, scope),
      scope === 'all' ? thisMonth : thisMonth.filter((each) => each.medium === scope),
    );
  }
  return client;
}

export default function ProfilePreview() {
  const params = useLocalSearchParams<{ screen?: string; media?: string; empty?: string }>();
  const media: Medium[] = params.media === 'movie' ? ['movie'] : params.media === 'game' ? ['game'] : ['game', 'movie'];
  const [client] = useState(() => seed(media, params.empty === '1'));

  return (
    <QueryClientProvider client={client}>
      {params.screen === 'activity' || params.screen === 'edit' ? (
        <>
          {/* Activity and Edit profile are pushed pages with the native header. */}
          <Stack.Screen options={{ headerShown: true }} />
          {params.screen === 'activity' ? <ActivityScreen /> : <EditProfileScreen />}
        </>
      ) : (
        <ProfileScreen />
      )}
    </QueryClientProvider>
  );
}
