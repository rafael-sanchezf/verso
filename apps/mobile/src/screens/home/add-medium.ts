/**
 * "Add a medium" from the switcher's "+": what one tap on a choice does
 * (VER-203).
 *
 * The bug this exists for: choosing Movies looked as if it had not registered,
 * and it took three tries in the 2026-10-13 signed-in pass. The tap always
 * registered. What the switcher did with it was write the profile, then
 * invalidate it, then switch, and the switch could not show until the profile
 * refetch came back, because `resolveMedium` never lands in a medium the cached
 * profile does not track yet. That is two round trips with nothing on screen:
 * the sheet closed, Home still said Games, and the "+" still offered Movies,
 * so the obvious move was to tap again. On the local stack it is a blink; on
 * the hosted one it is seconds.
 *
 * So the choice now lands in the cache and the active medium the moment it is
 * made (`onMutate`), the write follows, the server's row replaces the guess
 * when it answers, and a failed write puts both back and says so. One tap
 * chooses, closes, switches and writes.
 *
 * No React and no `react-native`: the handlers take what they touch, so
 * `test/add-medium.test.ts` drives them with fakes.
 */

import type { Profile } from '@verso/api';
import type { Medium } from '@verso/core';

import { LIVE_MEDIA, trackedMedia, type LiveMedium } from '../../state/medium-model';

/**
 * The media to write: what is tracked (games when nothing is, as
 * `trackedMedia` reads it) plus the one chosen, once each, in the switcher's
 * order.
 */
export function mediaWith(media: readonly Medium[] | null | undefined, next: LiveMedium): LiveMedium[] {
  const tracked = trackedMedia(media);
  return LIVE_MEDIA.filter((medium) => medium === next || tracked.includes(medium));
}

/** The profile with one more medium tracked: the guess the cache holds until the server answers. */
export function withMediumAdded(profile: Profile, next: LiveMedium): Profile {
  return { ...profile, media: mediaWith(profile.media, next) };
}

/** What the handlers need from the screen: the profile cache, the active medium, the write. */
export interface AddMediumDeps {
  /** The cached `['profile', 'me']`, if any. */
  readProfile: () => Profile | undefined;
  writeProfile: (profile: Profile | undefined) => void;
  /** Stop an in-flight profile read, so it cannot land on top of the choice. */
  cancelProfileReads: () => Promise<void>;
  /** The medium the app is in now, to go back to if the write fails. */
  currentMedium: () => LiveMedium;
  setMedium: (medium: LiveMedium) => void;
  /** The write: the profile as the server now has it. */
  save: (media: LiveMedium[]) => Promise<Profile>;
  /** After the write either way: refetch the profile and what reads it. */
  invalidate: () => void;
  /** Tell the person the add did not take. */
  reportFailure: () => void;
}

export interface AddMediumContext {
  previousProfile: Profile | undefined;
  previousMedium: LiveMedium;
}

/** `useMutation`'s options for the add, built from the deps. */
export function addMediumHandlers(deps: AddMediumDeps) {
  return {
    // Runs after `onMutate`, so the cache may already hold the choice;
    // `mediaWith` adds it once either way.
    mutationFn: (next: LiveMedium) => deps.save(mediaWith(deps.readProfile()?.media, next)),

    onMutate: async (next: LiveMedium): Promise<AddMediumContext> => {
      const previousProfile = deps.readProfile();
      const previousMedium = deps.currentMedium();
      // Synchronously first: the screen switches on the frame the sheet
      // closes, before anything is awaited.
      if (previousProfile) deps.writeProfile(withMediumAdded(previousProfile, next));
      deps.setMedium(next);
      await deps.cancelProfileReads();
      return { previousProfile, previousMedium };
    },

    onSuccess: (profile: Profile) => {
      deps.writeProfile(profile);
    },

    onError: (_error: unknown, _next: LiveMedium, context: AddMediumContext | undefined) => {
      if (context) {
        deps.writeProfile(context.previousProfile);
        deps.setMedium(context.previousMedium);
      }
      deps.reportFailure();
    },

    onSettled: () => {
      deps.invalidate();
    },
  };
}
