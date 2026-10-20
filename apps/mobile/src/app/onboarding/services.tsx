/** `/onboarding/services`: where you watch, the first step of the movies path. */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { ServicesScreen } from '@/screens/onboarding/services-screen';

export default function OnboardingServicesRoute() {
  const t = useT();
  useDocumentTitle(t('onboarding.services.title'));
  return <ServicesScreen />;
}
