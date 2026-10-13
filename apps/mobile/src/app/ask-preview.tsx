/**
 * `/ask-preview` — the ask sheet's states on fixed data, development only.
 *
 * The sheet itself needs a session, a profile and the deployed `suggest`
 * function; this draws the same `AskView` from fixtures so its four states can
 * be looked at in a browser with no stack (`pnpm web`, then
 * `/ask-preview?state=picks`). Registered under the root layout's `__DEV__`
 * guard beside `/preview`, so a release build has no such route.
 *
 * Params: `state` is `question`, `trace`, `consent`, `picks`, `limit` or
 * `empty`; `medium` is `movie` (the default) or `game`. The picks are the
 * site's hero's (copy.ts, `ask.movies`), with their TMDB posters.
 */

import type { SuggestPick } from '@verso/api';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AskView } from '@/screens/ask/ask-view';
import { buildTrace, type AskMedium } from '@/screens/ask/trace';
import type { AskPhase } from '@/screens/ask/use-ask';

const MOVIE_PICKS: SuggestPick[] = [
  {
    mediaItemId: '324857',
    title: 'Spider-Man: Into the Spider-Verse',
    year: 2018,
    coverImageId: '/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg',
    reason: 'A superhero movie for every age, and you told me you loved The Dark Knight.',
    because: ['The Dark Knight'],
  },
  {
    mediaItemId: '862',
    title: 'Toy Story',
    year: 1995,
    coverImageId: '/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg',
    reason: 'Funny for the kids, clever for the grown-ups, and you keep going back to Finding Nemo.',
    because: ['Finding Nemo'],
  },
  {
    mediaItemId: '346648',
    title: 'Paddington 2',
    year: 2017,
    coverImageId: '/1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg',
    reason: "Funny at any age, and it's from the director of Wonka, which you said you liked.",
    because: ['Wonka'],
  },
];

const GAME_PICKS: SuggestPick[] = [
  {
    mediaItemId: 'portal-2',
    title: 'Portal 2',
    year: 2011,
    coverImageId: null,
    reason: 'A co-op campaign built for two, and you told me you loved the puzzles in Outer Wilds.',
    because: ['Outer Wilds'],
  },
  {
    mediaItemId: 'stardew-valley',
    title: 'Stardew Valley',
    year: 2016,
    coverImageId: null,
    reason: 'One more day on a shared farm, and you keep going back to Hades for one more run.',
    because: ['Hades'],
  },
  {
    mediaItemId: 'terraria',
    title: 'Terraria',
    year: 2011,
    coverImageId: null,
    reason: 'Dig, build and take on bosses together, and you told me you loved Elden Ring.',
    because: ['Elden Ring'],
  },
];

/** The reason `templateReason` writes for the same pick, citing the title the model's reason cites. */
function plainReason(pick: SuggestPick, index: number): SuggestPick {
  const genre = ['Animation', 'Family', 'Comedy'][index % 3];
  const cited = pick.because[0] ?? 'your list';
  return { ...pick, reason: `Because you put ${cited} in Loved and this shares the ${genre} genre.` };
}

function phaseFor(state: string | undefined, medium: AskMedium, note: string): AskPhase {
  const picks = medium === 'movie' ? MOVIE_PICKS : GAME_PICKS;
  switch (state) {
    case 'trace':
      return { kind: 'thinking', trace: buildTrace(medium, note) };
    case 'consent':
      return { kind: 'consent' };
    case 'picks':
      return {
        kind: 'picks',
        picks,
        modelVersion: 'claude-haiku-5-5',
        fallback: false,
        loadingMore: false,
        exhausted: false,
        moreFailed: false,
      };
    case 'limit':
      // Over the limit the picks are the plain path's, with the template reasons.
      return { kind: 'limit', picks: picks.map(plainReason), loadingMore: false, exhausted: false, moreFailed: false };
    case 'empty':
      return { kind: 'empty' };
    default:
      return { kind: 'question' };
  }
}

export default function AskPreview() {
  const params = useLocalSearchParams<{ state?: string; medium?: string }>();
  const medium: AskMedium = params.medium === 'game' ? 'game' : 'movie';
  const [note, setNote] = useState(
    medium === 'movie' ? 'something for the whole family' : 'something to play with a friend',
  );
  const noop = () => {};

  return (
    <AskView
      medium={medium}
      note={note}
      onChangeNote={setNote}
      phase={phaseFor(params.state, medium, note)}
      onSend={noop}
      onClose={noop}
      onChange={noop}
      onAnotherThree={noop}
      onRetry={noop}
      onOpenPick={noop}
      onConsent={noop}
      onServices
      still
    />
  );
}
