/**
 * The ask sheet, wired: `useAsk`'s state into `AskView`, and where a pick goes.
 *
 * A film's pick pushes `/movie/[id]`, the movie page PR 2 of the movies build
 * adds (movies-build.md); until that route is on main the push lands on the
 * not-found screen, which is why the path is cast rather than typed. A game's
 * pick pushes the game page with no `from`, so its back button is the chevron
 * alone.
 */

import type { SuggestPick } from '@verso/api';
import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import { AskView } from './ask-view';
import type { AskMedium } from './trace';
import { useAsk } from './use-ask';

export function AskScreen({ medium }: { medium: AskMedium }) {
  const router = useRouter();
  const ask = useAsk(medium);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const openPick = useCallback(
    (pick: SuggestPick) => {
      if (medium === 'game') {
        router.push({ pathname: '/game/[id]', params: { id: pick.mediaItemId } });
      } else {
        router.push({ pathname: '/movie/[id]', params: { id: pick.mediaItemId } } as unknown as Href);
      }
    },
    [medium, router],
  );

  return (
    <AskView
      medium={medium}
      note={ask.note}
      onChangeNote={ask.setNote}
      phase={ask.phase}
      onSend={ask.send}
      onClose={close}
      onChange={ask.change}
      onAnotherThree={() => void ask.anotherThree()}
      onRetry={ask.retry}
      onOpenPick={openPick}
      onConsent={ask.answerConsent}
      onServices={ask.onServices}
      autoFocus
    />
  );
}
