/**
 * The active medium, for every tab (movies-build.md, PR 2, item 1).
 *
 * A persisted holder (`createMediumStore` in medium-model.ts, the holder the
 * session uses, so no store library comes in), kept on the device under
 * `verso.medium` so the app reopens where it was left (the build's default 1).
 * The Home switcher writes it; the medium chip, the tab bar's fourth tab,
 * Search, Ranking and the Next or Watchlist tab read it.
 *
 * What a screen reads is the stored choice resolved against the profile's
 * media (`resolveMedium`): a medium the person no longer tracks is never the
 * one they land in. The profile comes from the cache every tab already shares
 * (`['profile', 'me']`).
 *
 * The stored value is read as soon as this module loads, which is the first
 * render of the tabs; until it answers the app is in the profile's first
 * medium.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { getMyProfile } from '@verso/api';
import { useCallback, useSyncExternalStore } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { createMediumStore, resolveMedium, type LiveMedium } from './medium-model';

export * from './medium-model';

const store = createMediumStore(AsyncStorage);
void store.hydrate();

/** Switch the app to a medium, and remember it. */
export function setActiveMedium(medium: LiveMedium): void {
  store.set(medium);
}

/** The caller's profile, from the cache every tab shares. */
export function useMyProfile() {
  return useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });
}

/** The medium the app is in, and the way to change it. */
export function useActiveMedium(): { medium: LiveMedium; setMedium: (medium: LiveMedium) => void } {
  const stored = useSyncExternalStore(store.subscribe, store.get, store.get);
  const profile = useMyProfile();
  const medium = resolveMedium(stored, profile.data?.media);
  const setMedium = useCallback((next: LiveMedium) => store.set(next), []);
  return { medium, setMedium };
}
