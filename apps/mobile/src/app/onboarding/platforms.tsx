/** `/onboarding/platforms`: where you play. `?edit=1` is the deck's "Add a platform". */

import { useDocumentTitle } from '@/lib/use-document-title';
import { PlatformsScreen } from '@/screens/onboarding/platforms-screen';

export default function OnboardingPlatformsRoute() {
  useDocumentTitle('Where do you play?');
  return <PlatformsScreen />;
}
