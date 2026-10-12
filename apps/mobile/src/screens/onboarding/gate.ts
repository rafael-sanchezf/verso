/**
 * Who sees the onboarding stack, and the two rules around its edges
 * (specs/onboarding.md, "Routes", "Segmentation", "Link Steam", "Events").
 *
 * - The root layout's gate: a signed-in user whose profile has no `media` is
 *   new and starts at `/onboarding/media`; everyone else gets the tabs. Until
 *   the profile has answered, a signed-in user is not routed yet (the splash
 *   on a cold start, the sign-in screen just after signing in), so nobody sees
 *   Home flash past on the way to the questionnaire. A profile read that
 *   failed routes to the tabs: an account we cannot read is not evidence of a
 *   new one, and a wall would be worse than a missed questionnaire.
 * - Link Steam is offered to a PC player with no link.
 * - `ten_ranked` is logged once, when a write takes the ranked count from
 *   under ten to ten or more.
 *
 * No React and no `react-native` import (`test/onboarding-gate.test.ts`).
 */

/** The facts the gate reads off `getMyProfile`. */
export interface GateProfile {
  media: readonly string[] | null;
}

export interface OnboardingGate {
  /** The profile has answered (or failed), so the user can be routed. */
  routed: boolean;
  /** No media yet: the onboarding stack, not the tabs. */
  newUser: boolean;
}

export function onboardingGate(profile: GateProfile | undefined, failed: boolean): OnboardingGate {
  if (profile) return { routed: true, newUser: profile.media === null || profile.media.length === 0 };
  return { routed: failed, newUser: false };
}

/** The IGDB name the PC pick stores first; the one the Steam step looks for. */
export const PC_PLATFORM = 'PC (Microsoft Windows)';

/**
 * Whether the Link Steam step shows: the profile's platforms include PC and
 * there is no link. `linked` is undefined while the link is still being read,
 * which does not offer it yet.
 */
export function offersSteam(platforms: readonly string[] | null | undefined, linked: boolean | undefined): boolean {
  return linked === false && (platforms ?? []).includes(PC_PLATFORM);
}

/** Whether a write that took the ranked count from `before` to `after` reached ten. */
export function crossesTenRanked(before: number, after: number): boolean {
  return before < 10 && after >= 10;
}
