/**
 * Where the session and the review go next, decided without a router.
 *
 * - After Done (specs/batch-session.md, "The review"; onboarding.md, "Link
 *   Steam"): a new user's stack goes to Link Steam when the profile has PC and
 *   Steam is not linked, else to the tabs; a returning user goes back to where
 *   the door was; the seeds go on to the deck page (their review is skipped).
 * - "Rank more": back to the deck page, or to Search's add-many for a session
 *   that came from there. The drain has no deck behind it, so it opens the
 *   returning user's deck page, the other door on Ranking.
 *
 * The routes the onboarding screens' branch owns (`/onboarding/deck`,
 * `/onboarding/steam`) are named here as strings and turned into hrefs by the
 * screen; see `routes.ts`.
 *
 * Pure, so the rules are tested in node (`apps/mobile/test/session-navigation.test.ts`).
 */

import type { SessionRequest } from './session-store';

/** The catalog's spelling of PC, which `expandPlatforms` writes for the PC pick. */
export const PC_PLATFORM = 'PC (Microsoft Windows)';

export type DoneTarget =
  /** Link Steam, for a new PC player with no link. */
  | 'steam'
  /** Home: the end of the new user's stack. */
  | 'tabs'
  /** Out of the onboarding stack, back to the tab whose door opened it. */
  | 'leave'
  /** The deck page, after the seeds. */
  | 'deck';

export interface DoneFacts {
  /** The profile's platforms, or null when the profile could not be read. */
  readonly platforms: readonly string[] | null;
  /** Whether Steam is linked, or null when the link could not be read. */
  readonly steamLinked: boolean | null;
}

export function doneTarget(onDone: SessionRequest['onDone'], facts: DoneFacts): DoneTarget {
  switch (onDone) {
    case 'deck':
      return 'deck';
    case 'back':
      return 'leave';
    case 'steam-or-tabs': {
      // A read that failed sends the user home rather than to a screen whose
      // premise nobody checked; Settings → Steam is always there.
      const pc = facts.platforms?.includes(PC_PLATFORM) ?? false;
      return pc && facts.steamLinked === false ? 'steam' : 'tabs';
    }
  }
}

export type RankMoreTarget =
  /** The deck page this session came from, one step back. */
  | 'back-to-deck'
  /** The returning user's deck page, opened in place of the review. */
  | 'deck-returning'
  /** The new user's deck page, opened in place of the review. */
  | 'deck-new'
  /** Search's add-many intent. */
  | 'search-add-many';

export function rankMoreTarget(request: Pick<SessionRequest, 'source' | 'onDone'>): RankMoreTarget {
  switch (request.source) {
    case 'deck':
      return 'back-to-deck';
    case 'add-many':
      return 'search-add-many';
    case 'drain':
      return 'deck-returning';
    case 'seeds':
      return 'deck-new';
  }
}
