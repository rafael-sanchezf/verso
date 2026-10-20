/** `/onboarding/letterboxd`: the Letterboxd door, the last step of the movies path. */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { LetterboxdStepScreen } from '@/screens/onboarding/letterboxd-step-screen';

export default function OnboardingLetterboxdRoute() {
  const t = useT();
  useDocumentTitle(t('onboarding.letterboxd.title'));
  return <LetterboxdStepScreen />;
}
