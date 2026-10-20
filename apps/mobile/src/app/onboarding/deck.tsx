/**
 * `/onboarding/deck`: popular games on your platforms, ten at a time, with a
 * slider per row. `?from=ranking` is the returning user from Ranking's door;
 * `?medium=movie` is the film deck, with a seen check per row.
 */

import { useLocalSearchParams } from 'expo-router';

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { DeckScreen } from '@/screens/onboarding/deck-screen';
import { mediumParam } from '@/screens/onboarding/seeds';

export default function OnboardingDeckRoute() {
  const t = useT();
  const params = useLocalSearchParams<{ medium?: string }>();
  const film = mediumParam(params.medium) === 'movie';
  useDocumentTitle(t(film ? 'onboarding.deck.documentTitleFilms' : 'onboarding.deck.documentTitle'));
  return <DeckScreen />;
}
