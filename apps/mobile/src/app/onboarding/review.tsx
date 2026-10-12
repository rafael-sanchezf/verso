/**
 * "Look right?", the review after a batch session (specs/batch-session.md).
 *
 * The session replaces itself with this route once every game is placed and
 * hands the finished run over in `screens/onboarding/session/run-store.ts`.
 * Takes the onboarding stack's default options.
 */

import { ReviewScreen } from '@/screens/onboarding/session/review-screen';

export default function ReviewRoute() {
  return <ReviewScreen />;
}
