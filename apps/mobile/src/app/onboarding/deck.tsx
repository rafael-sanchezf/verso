/**
 * `/onboarding/deck`: popular games on your platforms, ten at a time, with a
 * slider per row. `?from=ranking` is the returning user from Ranking's door.
 */

import { useDocumentTitle } from '@/lib/use-document-title';
import { DeckScreen } from '@/screens/onboarding/deck-screen';

export default function OnboardingDeckRoute() {
  useDocumentTitle('Rank popular games');
  return <DeckScreen />;
}
