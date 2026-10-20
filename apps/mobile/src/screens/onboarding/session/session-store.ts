/**
 * The seam between the two halves of PR 4: the screens that gather games (the
 * seeds, the deck page, Search's add-many, Ranking's banner) and the session
 * that places them (specs/batch-session.md, "Two builds, one stack: the
 * hand-off").
 *
 * The caller hands over a request and pushes the route:
 *
 *   startSession({ source: 'deck', items, onDone: 'steam-or-tabs' });
 *   router.push('/onboarding/session');
 *
 * The session screen reads it with `useSessionRequest`, and the review (or the
 * session itself, for the seeds, whose review is skipped) clears it once the
 * games are written. The shape is fixed by the spec so both halves could be
 * built against it at once; change it there first.
 *
 * - `items[].row` is the catalog row the caller already drew, so the session
 *   never refetches a cover or a title.
 * - `tier: null` means the session asks the tier first (the drain and
 *   add-many), one screen per game.
 * - `onDone` is where the review goes after its writes: `steam-or-tabs` for a
 *   new user's stack (Link Steam when the profile has PC and no link, else the
 *   tabs), `back` for a door a returning user came through (the drain,
 *   add-many, the returning deck), `deck` for the seeds, `letterboxd` for the
 *   film deck of a new user's or a newly added medium's path (the Letterboxd
 *   door, movies-build.md, PR 6).
 *
 * A module-level holder, not the router's params and not a store library.
 */

import type { OnboardingGameRow } from '@verso/api';
import type { Medium, Tier } from '@verso/core';
import { useSyncExternalStore } from 'react';

import { createHolder } from './holder';

export type SessionSource = 'seeds' | 'deck' | 'drain' | 'add-many';

export interface SessionItem {
  mediaItemId: string;
  tier: Tier | null;
  row: OnboardingGameRow;
}

export interface SessionRequest {
  source: SessionSource;
  /**
   * Which medium's ranked list the games join. Games when absent, which is
   * every caller from before the movies build; Ranking's films banner sends
   * `movie` (movies-build.md, PR 2, item 7).
   */
  medium?: Medium;
  items: SessionItem[];
  onDone: 'steam-or-tabs' | 'letterboxd' | 'back' | 'deck';
}

const holder = createHolder<SessionRequest | null>(null);

/** Hand the session its games. Call it, then `router.push('/onboarding/session')`. */
export function startSession(request: SessionRequest): void {
  // A copy of the list, so the caller clearing its own marks after the push
  // cannot empty the session under it.
  holder.set({ ...request, items: request.items.slice() });
}

/** The request on the session screen; null when nothing was handed over. */
export function useSessionRequest(): SessionRequest | null {
  return useSyncExternalStore(holder.subscribe, holder.get, holder.get);
}

/** Forget the request, after the review's writes. */
export function clearSession(): void {
  holder.set(null);
}
