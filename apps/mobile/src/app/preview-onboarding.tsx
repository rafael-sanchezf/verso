/**
 * `/preview-onboarding` — the movies onboarding's screens on fixed data,
 * development only, the way `/preview-profile` draws the joint Profile.
 *
 * The real screens need a session and a catalog with TMDB's directory and
 * films; this renders the same components over a query cache seeded with the
 * frames' sample data (figma-kit/movies-site-round.md, round four), so they
 * can be checked at 402 in a browser with no stack and no account. Nothing
 * here writes: Continue, Rank and the doors would call the stack and fail.
 * Registered under the root layout's `__DEV__` guard.
 *
 * Params: `screen` is `services` (default), `seeds`, `deck` or `letterboxd`;
 * `medium` is `movie` (default for seeds and deck) or `game`; `state=empty`
 * draws seeds with none picked and the deck with nothing checked.
 */

import type { DeckCandidateRow, Profile, ProfileStats, SearchGameRow, WatchProvider } from '@verso/api';
import type { Tier } from '@verso/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { DeckScreen } from '@/screens/onboarding/deck-screen';
import { LetterboxdStepScreen } from '@/screens/onboarding/letterboxd-step-screen';
import { SeedsScreen } from '@/screens/onboarding/seeds-screen';
import { deviceRegion } from '@/screens/onboarding/services';
import { ServicesScreen } from '@/screens/onboarding/services-screen';
import { fromSearchRow } from '@/screens/onboarding/rows';

const provider = (providerId: number, name: string, logo: string, priority: number): WatchProvider => ({
  providerId,
  name,
  logoImageId: `/${logo}.jpg`,
  priority,
});

/** A US directory in the frame's order, with the region's others behind it for "More". */
const PROVIDERS: WatchProvider[] = [
  provider(8, 'Netflix', 'pbpMk2JmcoNnQwx5JGpXngfoWtp', 1),
  provider(1899, 'Max', 'jbe4gVSfRlbPTdESXhEKpornsfu', 2),
  provider(15, 'Hulu', 'zxrVdFjIjLqkfnwyghnfywTn3Lh', 3),
  provider(337, 'Disney Plus', '97yvRBw1GzX7fXprcF80er19ot', 4),
  provider(9, 'Amazon Prime Video', 'emthp39XA2YScoYL1p0sdbAH2WA', 5),
  provider(350, 'Apple TV+', '2E03IAZsX4ZaUqM7tXlctEPMGWS', 6),
  provider(531, 'Paramount Plus', 'h5DcR0J2EESLitnhR8xLG1QymTE', 7),
  provider(386, 'Peacock Premium', '2aGrp1xw3qhwCYvNGAJZPdjfeeX', 8),
  provider(258, 'Criterion Channel', '4TJTNWd2TT1kYj6ocUEsQc8WRgr', 9),
  provider(2, 'Apple TV', '9ghgSC0MA082EL6HLCW3GalykFD', 10),
  provider(613, 'Freevee', 'zrDlBfmYivfPo6xvSyaidKMhFnU', 11),
];

interface Film {
  id: string;
  title: string;
  year: number;
  genres: string[];
  poster: string | null;
}

const film = (id: string, title: string, year: number, genre: string, poster: string | null): Film => ({
  id,
  title,
  year,
  genres: [genre],
  poster: poster === null ? null : `/${poster}.jpg`,
});

const DUNE_TWO = film('dune-two', 'Dune: Part Two', 2024, 'Science Fiction', '6izwz7rsy95ARzTR3poZ8H6c5pp');
const DUNE = film('dune', 'Dune', 2021, 'Science Fiction', null);
const INTERSTELLAR = film('interstellar', 'Interstellar', 2014, 'Science Fiction', 'yQvGrMoipbRoddT0ZR8tPoR7NfX');
const TOY_STORY = film('toy-story', 'Toy Story', 1995, 'Animation', null);

/** The frame's ten rows, with its marks; Parasite unchecked and with no slider, as the letter asks. */
const DECK: { film: Film; mark: Tier | 'seen' | null }[] = [
  { film: film('oppenheimer', 'Oppenheimer', 2023, 'Drama', '8Gxv8gSFCU0XGDykEGv7zR1n2ua'), mark: 'loved' },
  { film: film('barbie', 'Barbie', 2023, 'Comedy', 'iuFNMS8U5cb6xfzi51Dbkovj7vM'), mark: 'liked' },
  { film: film('top-gun', 'Top Gun: Maverick', 2022, 'Action', 'n0YuM4f5lvGAP6MAW2kBIzugXnc'), mark: 'loved' },
  { film: film('avatar', 'Avatar', 2009, 'Science Fiction', null), mark: 'fine' },
  { film: film('inception', 'Inception', 2010, 'Science Fiction', 'xlaY2zyzMfkhk0HSC5VUwzoZPU1'), mark: 'loved' },
  { film: film('eeaao', 'Everything Everywhere All at Once', 2022, 'Science Fiction', null), mark: 'seen' },
  { film: film('parasite', 'Parasite', 2019, 'Thriller', '7IiTTgloJzvGI1TAYymCfbfl3vT'), mark: null },
  { film: film('la-la-land', 'La La Land', 2016, 'Music', null), mark: 'liked' },
  { film: film('godfather', 'The Godfather', 1972, 'Crime', null), mark: null },
  { film: film('endgame', 'Avengers: Endgame', 2019, 'Action', null), mark: null },
];

function searchRow(each: Film): SearchGameRow {
  return {
    media_item_id: each.id,
    title: each.title,
    year: each.year,
    cover_image_id: each.poster,
    external_ids: {},
    genres: each.genres,
    platforms: [],
    developer: null,
    igdb_id: null,
    person_match: null,
    score: 1,
  };
}

function deckRow(each: Film, index: number): DeckCandidateRow {
  return { ...fromSearchRow(searchRow(each)), popularityRank: index + 1, boost: 0 };
}

const stats = (ranked: number): ProfileStats => ({ ranked, backlog: 0, upcoming: 0, playing: 0, played: ranked, dropped: 0 });

function seed(region: string): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: Infinity } } });
  const profile: Profile = {
    id: 'preview',
    username: 'rafa',
    displayName: 'Rafa Sanchez',
    avatarUrl: null,
    createdAt: '2026-09-08T12:00:00.000Z',
    platforms: [],
    media: ['movie'],
    watchRegion: 'US',
    watchProviderIds: [],
    isPublic: false,
  };
  client.setQueryData(queryKeys.profileMe(), profile);
  client.setQueryData(queryKeys.watchProviders(region), PROVIDERS);
  client.setQueryData(queryKeys.search('dune', 'movie'), [DUNE_TWO, DUNE].map(searchRow));
  // The seeds the frame shows in Loved already count toward ten.
  client.setQueryData(queryKeys.profileStatsFor('movie'), stats(0));
  client.setQueryData(queryKeys.deck(null, 0, 10, 'movie'), DECK.map(({ film: each }, index) => deckRow(each, index)));
  return client;
}

export default function OnboardingPreview() {
  const params = useLocalSearchParams<{ screen?: string; state?: string }>();
  const empty = params.state === 'empty';
  const [client] = useState(() => seed(deviceRegion(getLocales()[0]?.regionCode)));

  const marks = new Map<string, Tier>();
  const seen = new Set<string>();
  if (!empty) {
    for (const { film: each, mark } of DECK) {
      if (mark === null) continue;
      seen.add(each.id);
      if (mark !== 'seen') marks.set(each.id, mark);
    }
  }

  return (
    <QueryClientProvider client={client}>
      {params.screen === 'seeds' ? (
        <SeedsScreen
          initialQuery={empty ? '' : 'dune'}
          initialSeeds={empty ? [] : [INTERSTELLAR, TOY_STORY].map((each) => fromSearchRow(searchRow(each)))}
        />
      ) : params.screen === 'deck' ? (
        <DeckScreen initialPicks={{ marks, seen }} />
      ) : params.screen === 'letterboxd' ? (
        <LetterboxdStepScreen />
      ) : (
        <ServicesScreen initialPicked={[8, 1899, 15]} />
      )}
    </QueryClientProvider>
  );
}
