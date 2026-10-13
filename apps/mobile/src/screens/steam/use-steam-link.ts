/**
 * The Steam link's reads and writes, as hooks.
 *
 * - `useSteamAccount()` is the link itself under `['steam', 'link']`: null when
 *   there is none, which is the ordinary state rather than an error.
 * - `useSteamLink()` is the round trip behind "Link Steam" (link-flow.ts has
 *   the phases): ask the `steam-link` function for Valve's URL, open it in the
 *   system's auth browser, wait for `verso://steam/linked`, and read the link to
 *   see what happened. The onboarding's "Link Steam" screen (bulk-entry-build.md,
 *   PR 4) calls the same hook, or renders `LinkSteamButton`, which does.
 * - `useUnlinkSteam()` is "Unlink".
 *
 * The browser is `expo-web-browser`'s auth session, never a WebView: Steam
 * Guard and password managers need the real browser, and Apple and Google both
 * want third-party sign-in there (steam.ts, point 1). On iOS that is
 * ASWebAuthenticationSession, which shares Safari's cookies, so someone already
 * signed in to Steam in Safari only has to confirm.
 */

import { getSteamLink, startSteamLink, unlinkSteam, type SteamLink } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useReducer, useRef } from 'react';

import { useT } from '@/lib/i18n';
import { invalidateSteam } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { startFailureMessage } from './errors';
import { failureOf, IDLE, isBusy, linkReducer, type LinkPhase } from './link-flow';
import { parseLinkReturn, STEAM_LINK_RETURN_URL, type LinkReturn } from './link-return';

/** The caller's Steam link, or null. */
export function useSteamAccount() {
  return useQuery({
    queryKey: queryKeys.steamLink(),
    queryFn: () => getSteamLink(supabase),
  });
}

export interface UseSteamLinkOptions {
  /** Called once when a round trip ends with a link in the database. */
  onLinked?: (link: SteamLink) => void;
  /**
   * A return the router delivered rather than the browser: `/steam/linked` on a
   * cold start forwards its status here through `/settings/steam`'s params.
   * Read once, on mount.
   */
  initialReturn?: LinkReturn | null;
}

export interface SteamLinkFlow {
  phase: LinkPhase;
  /** Between the tap and the answer. The button waits; a second tap does nothing. */
  busy: boolean;
  /** One line for the last attempt's failure, in the app's language, or null. */
  failure: string | null;
  /** Start a round trip. A no-op while one is under way. */
  start: () => void;
}

export function useSteamLink({ onLinked, initialReturn = null }: UseSteamLinkOptions = {}): SteamLinkFlow {
  const t = useT();
  const queryClient = useQueryClient();
  const [phase, dispatch] = useReducer(linkReducer, IDLE);

  // The latest callback, without making it a dependency of the effects below.
  const onLinkedRef = useRef(onLinked);
  useEffect(() => {
    onLinkedRef.current = onLinked;
  }, [onLinked]);

  // A tap that lands while the previous one is still asking for a URL would
  // start a second attempt before the reducer has said "busy"; this is the
  // synchronous guard the reducer cannot be.
  const running = useRef(false);

  async function start() {
    if (running.current) return;
    running.current = true;
    dispatch({ type: 'start' });

    try {
      let url: string;
      try {
        ({ url } = await startSteamLink(supabase));
      } catch (cause) {
        dispatch({ type: 'start-failed', message: startFailureMessage(cause) });
        return;
      }

      dispatch({ type: 'opened' });
      try {
        const result = await WebBrowser.openAuthSessionAsync(url, STEAM_LINK_RETURN_URL);
        // 'cancel' is the user closing the sheet; 'dismiss' is Android's
        // browser closing before (or instead of) the deep link arriving. Both
        // are read as "check the link and say nothing if there is none".
        dispatch({
          type: 'returned',
          result: result.type === 'success' ? parseLinkReturn(result.url) : null,
        });
      } catch {
        dispatch({
          type: 'start-failed',
          message: 'profile.steam.link.couldNotOpenSignIn',
        });
      }
    } finally {
      running.current = false;
    }
  }

  // The second road back: the app's own deep-link listener. It still fires when
  // `+native-intent.tsx` keeps the router still, and it is the one that hears
  // the return when Android's browser promise settled as a dismiss first, or
  // when iOS handed the link to the app instead of to the auth session.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const returned = parseLinkReturn(url);
      if (returned) dispatch({ type: 'returned', result: returned });
    });
    return () => subscription.remove();
  }, []);

  // The third road: a cold start, forwarded by the route.
  const initial = useRef(initialReturn);
  useEffect(() => {
    if (initial.current) dispatch({ type: 'returned', result: initial.current });
  }, []);

  // Back from the browser, by any road: ask the database. One read per return,
  // because `phase.kind` only becomes 'confirming' once per round trip.
  //
  // `fetchQuery` writes the answer into `['steam', 'link']`, so a screen
  // drawing from `useSteamAccount` switches to its linked state on the same
  // read, and may unmount whatever rendered this hook while doing so. That is
  // why `onLinked` is called from here rather than from an effect on the
  // phase: it still fires when the dispatch lands on an unmounted component.
  useEffect(() => {
    if (phase.kind !== 'confirming') return;
    queryClient
      .fetchQuery({ queryKey: queryKeys.steamLink(), queryFn: () => getSteamLink(supabase), staleTime: 0 })
      .then((link) => {
        dispatch({ type: 'confirmed', linked: link !== null });
        if (link) onLinkedRef.current?.(link);
      })
      .catch(() => dispatch({ type: 'confirm-failed' }));
  }, [phase.kind, queryClient]);

  const failure = failureOf(phase);

  return {
    phase,
    busy: isBusy(phase),
    failure: failure === null ? null : t(failure),
    start: () => void start(),
  };
}

/**
 * "Unlink": drop the link and the stored library. Imported hours stay on the
 * entries (steam.ts, point 5), so the entries are left alone.
 */
export function useUnlinkSteam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => unlinkSteam(supabase),
    onSuccess: () => {
      // Draw the unlinked state at once rather than after the refetch.
      queryClient.setQueryData(queryKeys.steamLink(), null);
    },
    onSettled: () => invalidateSteam(queryClient),
  });
}
