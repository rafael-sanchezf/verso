/**
 * The comparison session, in the onboarding stack (specs/batch-session.md).
 *
 * Takes the stack's default options from the onboarding group's
 * `app/onboarding/_layout.tsx` (no header, no back gesture); the screen draws
 * its own top row. The games arrive through `startSession` in
 * `screens/onboarding/session/session-store.ts`, not as params.
 */

import { SessionScreen } from '@/screens/onboarding/session/session-screen';

export default function SessionRoute() {
  return <SessionScreen />;
}
