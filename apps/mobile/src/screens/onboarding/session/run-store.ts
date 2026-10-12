/**
 * The hand-over from the session to the review: the finished run.
 *
 * The session screen sets it and replaces itself with `/onboarding/review`;
 * the review reads it once when it mounts and keeps its own copy, so clearing
 * it after Done cannot blank the screen during the transition away. A review
 * opened with nothing here (a cold start on the route) has nothing to show and
 * leaves.
 *
 * Its own holder rather than a field on the session request, because the
 * request's shape is the seam with the onboarding screens, fixed by the spec so
 * both halves could be built at once, and this is internal to the session's
 * two screens.
 */

import type { BatchState } from '@verso/core';

import type { TierIds } from './batch-start';
import type { SessionGame } from './games';
import { createHolder } from './holder';
import type { SessionRequest } from './session-store';

export interface FinishedRun {
  readonly request: SessionRequest;
  /** Every game placed: after the last answer, or after `placeRest`. */
  readonly state: BatchState;
  /** The tiers' stored order the session started from. */
  readonly existing: TierIds;
  /** Every game the review may draw, new and ranked, by media item id. */
  readonly games: ReadonlyMap<string, SessionGame>;
}

const holder = createHolder<FinishedRun | null>(null);

export function setFinishedRun(run: FinishedRun): void {
  holder.set(run);
}

export function getFinishedRun(): FinishedRun | null {
  return holder.get();
}

export function clearFinishedRun(): void {
  holder.set(null);
}
