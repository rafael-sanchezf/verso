/**
 * The flow's navigation (flow.ts has the rules): end a medium's path, and
 * start a medium's onboarding from outside the stack (the switcher's "+",
 * Edit profile's check; VER-198).
 */

import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import { setActiveMedium, type LiveMedium } from '@/state/medium';

import { afterPath, clearFlow, currentFlow, firstStep, flowMedia, startFlow } from './flow';
import { firstStepHref, TABS_HREF } from './session/routes';

/**
 * End `medium`'s path: on to the next medium's first step, or Home in this
 * medium. `then` is pushed over Home once it is there (the Letterboxd door's
 * import, whose own back comes home).
 */
export function useFinishPath(): (medium: LiveMedium, then?: Href) => void {
  const router = useRouter();

  return useCallback(
    (medium: LiveMedium, then?: Href) => {
      const next = afterPath(currentFlow(), medium);
      if (next.kind === 'step') {
        router.replace(firstStepHref(next.step));
        return;
      }
      clearFlow();
      setActiveMedium(next.medium);
      // A new account's stack has nothing under it; an added medium's stack
      // was pushed over the tabs and goes back to them.
      if (next.origin === 'added') router.dismissTo(TABS_HREF);
      else router.replace(TABS_HREF);
      if (then) router.push(then);
    },
    [router],
  );
}

/**
 * Run a medium's onboarding for an existing account: the switcher's "+" and
 * Edit profile's check. `replace` takes the place of the screen that asked
 * (Edit profile), so the path's end goes back to the tabs rather than to it.
 */
export function useStartAddedMedia(): (media: readonly LiveMedium[], options?: { replace?: boolean }) => void {
  const router = useRouter();

  return useCallback(
    (media: readonly LiveMedium[], options?: { replace?: boolean }) => {
      const ordered = flowMedia(media);
      const first = ordered[0];
      if (first === undefined) return;
      startFlow({ media: ordered, origin: 'added' });
      const href = firstStepHref(firstStep(first));
      if (options?.replace) router.replace(href);
      else router.push(href);
    },
    [router],
  );
}
