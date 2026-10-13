/** `/onboarding/platforms`: where you play. `?edit=1` is the deck's "Add a platform". */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { PlatformsScreen } from '@/screens/onboarding/platforms-screen';

export default function OnboardingPlatformsRoute() {
  const t = useT();
  useDocumentTitle(t('onboarding.platforms.title'));
  return <PlatformsScreen />;
}
