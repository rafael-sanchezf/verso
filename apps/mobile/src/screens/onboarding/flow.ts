/**
 * Which media's onboarding is running, and where each medium's path hands
 * over (movies-build.md, PR 6, item 1; VER-198).
 *
 * Each medium has its own path. Games: Platforms, Games you love, the deck,
 * the session and its review, then Link Steam for a PC player. Movies:
 * Services, Films you love, the film deck, the session and its review, then
 * the Letterboxd door. A person who picked both runs the games path, then the
 * movies path (onboarding-brief, "If both media were picked": games first,
 * the switcher's order). An existing account that adds a medium later, from
 * the switcher's "+" on Home or from Edit profile's check, runs that medium's
 * path the same way (VER-198), and the stored flag alone is what someone who
 * skips every step ends with.
 *
 * Where a path ends (the end of the review, Link Steam's "Not now", the
 * Letterboxd door, the deck's `x` with nothing marked), the flow says what
 * comes next: the next medium's first step, or Home in the medium just set
 * up. A new account's stack has no tabs under it, so it replaces itself with
 * Home; an added medium's stack sits over the tabs and is dismissed back to
 * them.
 *
 * The flow is a module-level holder, like the session's request: a reload in
 * the middle forgets it, and the path that was running ends on Home, which is
 * where the app would open anyway.
 *
 * No React and no `react-native` import (`test/onboarding-flow.test.ts`).
 */

import { LIVE_MEDIA, type LiveMedium } from '../../state/medium-model';
import { createHolder } from './session/holder';

/** A new account from the media question, or a medium added to an existing one. */
export type FlowOrigin = 'new' | 'added';

export interface OnboardingFlow {
  /** The media whose paths run, in order. */
  readonly media: readonly LiveMedium[];
  readonly origin: FlowOrigin;
}

/** The first screen of a medium's path. */
export type FirstStep = 'platforms' | 'services';

export function firstStep(medium: LiveMedium): FirstStep {
  return medium === 'movie' ? 'services' : 'platforms';
}

/** The media to run, in the switcher's order (games first), each once. */
export function flowMedia(picked: Iterable<LiveMedium>): LiveMedium[] {
  const chosen = new Set(picked);
  return LIVE_MEDIA.filter((medium) => chosen.has(medium));
}

/**
 * The media an Edit profile save added: checked now, not tracked before. A
 * profile that had never answered (null) tracked nothing, so whatever is
 * checked is new; a fresh account never reaches Edit profile that way, but
 * the rule holds.
 */
export function addedMedia(
  before: readonly string[] | null | undefined,
  after: readonly LiveMedium[],
): LiveMedium[] {
  const had = new Set(before ?? []);
  return flowMedia(after.filter((medium) => !had.has(medium)));
}

export type AfterPath =
  /** The next medium's first screen. */
  | { readonly kind: 'step'; readonly step: FirstStep; readonly medium: LiveMedium }
  /** Home, switched to `medium`. */
  | { readonly kind: 'home'; readonly medium: LiveMedium; readonly origin: FlowOrigin };

/**
 * Where to go when `finished`'s path ends. With no flow (a reload, or a path
 * entered some other way) it is Home in that medium, as a new account's stack.
 */
export function afterPath(flow: OnboardingFlow | null, finished: LiveMedium): AfterPath {
  const media = flow?.media ?? [finished];
  const index = media.indexOf(finished);
  const next = index === -1 ? undefined : media[index + 1];
  if (next !== undefined) return { kind: 'step', step: firstStep(next), medium: next };
  return { kind: 'home', medium: finished, origin: flow?.origin ?? 'new' };
}

const holder = createHolder<OnboardingFlow | null>(null);

/** Begin a run. Call it, then push the first medium's `firstStep`. */
export function startFlow(flow: OnboardingFlow): void {
  holder.set({ media: flowMedia(flow.media), origin: flow.origin });
}

/** The run in progress, or null. */
export function currentFlow(): OnboardingFlow | null {
  return holder.get();
}

/** Forget the run, once Home is reached. */
export function clearFlow(): void {
  holder.set(null);
}
