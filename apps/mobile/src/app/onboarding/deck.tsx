/**
 * `/onboarding/deck`: popular games on your platforms, ten at a time, with a
 * slider per row. `?from=ranking` is the returning user from Ranking's door.
 */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { DeckScreen } from '@/screens/onboarding/deck-screen';

export default function OnboardingDeckRoute() {
  const t = useT();
  useDocumentTitle(t('onboarding.deck.documentTitle'));
  return <DeckScreen />;
}
