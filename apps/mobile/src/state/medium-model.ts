/**
 * The rules of the active medium, with no storage and no React: which media
 * exist, what each is called, and which one the app is in given what was
 * stored and what the profile tracks (movies-build.md, PR 2, item 1; the
 * build's default 1).
 *
 * The app is always in exactly one medium (rule 4). Games and movies are live;
 * TV and books are held until TV's ranking unit is decided (decision 23), so
 * they are not a `LiveMedium` and nothing can switch to them.
 *
 * Relative imports only, for the node test suite (`test/medium-store.test.ts`).
 */

import type { Medium } from '@verso/core';

import { createHolder } from '../screens/onboarding/session/holder';

/** The media the app can be in now. */
export type LiveMedium = Extract<Medium, 'game' | 'movie'>;

/** In the order the switcher lists them. */
export const LIVE_MEDIA: readonly LiveMedium[] = ['game', 'movie'];

/** Where the choice is kept on the device. */
export const MEDIUM_STORAGE_KEY = 'verso.medium';

export interface MediumWords {
  /** The switcher's and the chip's word: "Games", "Movies". */
  plural: string;
  /** Inside a sentence: "game", "film". */
  noun: string;
  /** The fourth tab's word (rule 8 and 18): "Next" for games, "Watchlist" for films. */
  listTab: string;
  /** The Lucide icon the switcher draws for it. */
  icon: 'gamepad-2' | 'film';
}

export const MEDIUM_WORDS: Readonly<Record<LiveMedium, MediumWords>> = {
  game: { plural: 'Games', noun: 'game', listTab: 'Next', icon: 'gamepad-2' },
  movie: { plural: 'Movies', noun: 'film', listTab: 'Watchlist', icon: 'film' },
};

export function isLiveMedium(value: unknown): value is LiveMedium {
  return typeof value === 'string' && (LIVE_MEDIA as readonly string[]).includes(value);
}

/** What was stored, if it names a live medium; anything else is no answer. */
export function parseStoredMedium(raw: string | null | undefined): LiveMedium | null {
  return isLiveMedium(raw) ? raw : null;
}

/** The live media a profile tracks, in the switcher's order. Null (not answered yet) is games. */
export function trackedMedia(profileMedia: readonly Medium[] | null | undefined): LiveMedium[] {
  const tracked = LIVE_MEDIA.filter((medium) => (profileMedia ?? []).includes(medium));
  return tracked.length > 0 ? tracked : ['game'];
}

/**
 * The medium the app is in. The stored choice when the profile still tracks
 * it; otherwise the first medium the profile tracks, which is where a fresh
 * install opens (the build's default 1). With no profile yet, the stored
 * choice stands, and games when there is none.
 */
export function resolveMedium(
  stored: LiveMedium | null,
  profileMedia: readonly Medium[] | null | undefined,
): LiveMedium {
  if (profileMedia === undefined || profileMedia === null) return stored ?? 'game';
  const tracked = trackedMedia(profileMedia);
  return stored !== null && tracked.includes(stored) ? stored : tracked[0]!;
}

/** The other media the switcher offers as icons: the tracked ones that are not active. */
export function otherMedia(active: LiveMedium, profileMedia: readonly Medium[] | null | undefined): LiveMedium[] {
  return trackedMedia(profileMedia).filter((medium) => medium !== active);
}

/** The live media the profile does not track yet: what "add a medium" offers (decision 25). */
export function addableMedia(profileMedia: readonly Medium[] | null | undefined): LiveMedium[] {
  const tracked = trackedMedia(profileMedia);
  return LIVE_MEDIA.filter((medium) => !tracked.includes(medium));
}

/** The two calls the store needs from AsyncStorage, so the tests can hand it a map. */
export interface MediumStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface MediumStore {
  /** The stored choice, or null before the read answers or when there is none. */
  get(): LiveMedium | null;
  /** Switch, and remember it. */
  set(medium: LiveMedium): void;
  subscribe(listener: () => void): () => void;
  /** Read the stored choice; resolves once it is in. A choice made before it answers wins. */
  hydrate(): Promise<void>;
}

/**
 * The persisted holder. A failed read or write is swallowed: no stored choice
 * opens on the profile's first medium, and a choice that could not be written
 * still holds for the session.
 */
export function createMediumStore(storage: MediumStorage): MediumStore {
  const holder = createHolder<LiveMedium | null>(null);
  let touched = false;

  return {
    get: holder.get,
    subscribe: holder.subscribe,
    set(medium) {
      touched = true;
      holder.set(medium);
      void storage.setItem(MEDIUM_STORAGE_KEY, medium).catch(() => undefined);
    },
    async hydrate() {
      try {
        const raw = await storage.getItem(MEDIUM_STORAGE_KEY);
        if (!touched) holder.set(parseStoredMedium(raw));
      } catch {
        // Nothing stored is a fine answer.
      }
    },
  };
}
