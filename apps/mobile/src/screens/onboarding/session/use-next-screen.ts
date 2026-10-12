/**
 * Moving on from the session's screens: where Done goes, and how a returning
 * user leaves the onboarding stack.
 *
 * `useGoOnAfterDone` reads what the decision needs (the profile's platforms
 * and the Steam link, only for a new user's stack) and follows `doneTarget`
 * (navigation.ts, where the rules are tested). A read that fails sends the
 * user home rather than holding them on a written review.
 *
 * `useLeaveStack` is "back to where the door was". `router.back()` is not
 * enough after the returning user's deck page: the stack then holds the deck
 * and the review, and one step back lands on the deck. So when the screen's
 * navigator sits inside a parent whose routes include the `onboarding` group
 * (the root stack, once the onboarding `_layout.tsx` nests the group),
 * the parent pops the whole group. Without that nesting, or with nothing
 * behind, it falls back to one step back, then to the tabs.
 */

import { useQueryClient } from '@tanstack/react-query';
import { getMyProfile, getSteamLink } from '@verso/api';
import { useNavigation, useRouter } from 'expo-router';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { doneTarget, type DoneFacts } from './navigation';
import { DECK_HREF, STEAM_HREF, TABS_HREF } from './routes';
import type { SessionRequest } from './session-store';

export function useLeaveStack(): () => void {
  const router = useRouter();
  const navigation = useNavigation();

  return () => {
    const parent = navigation.getParent();
    const holdsGroup = parent?.getState()?.routes.some((route) => route.name === 'onboarding') ?? false;
    if (parent && holdsGroup && parent.canGoBack()) parent.goBack();
    else if (router.canGoBack()) router.back();
    else router.replace(TABS_HREF);
  };
}

export function useGoOnAfterDone(): (onDone: SessionRequest['onDone']) => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();
  const leave = useLeaveStack();

  return async (onDone) => {
    let facts: DoneFacts = { platforms: null, steamLinked: null };
    if (onDone === 'steam-or-tabs') {
      const [profile, link] = await Promise.allSettled([
        queryClient.fetchQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) }),
        queryClient.fetchQuery({ queryKey: queryKeys.steamLink(), queryFn: () => getSteamLink(supabase) }),
      ]);
      facts = {
        platforms: profile.status === 'fulfilled' ? profile.value.platforms : null,
        steamLinked: link.status === 'fulfilled' ? link.value !== null : null,
      };
    }

    switch (doneTarget(onDone, facts)) {
      case 'steam':
        router.replace(STEAM_HREF);
        return;
      case 'tabs':
        router.replace(TABS_HREF);
        return;
      case 'deck':
        router.replace(DECK_HREF);
        return;
      case 'leave':
        leave();
        return;
    }
  };
}
