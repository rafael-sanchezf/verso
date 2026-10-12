/** `/onboarding/seeds`: three games you love, the first ranked games. */

import { useDocumentTitle } from '@/lib/use-document-title';
import { SeedsScreen } from '@/screens/onboarding/seeds-screen';

export default function OnboardingSeedsRoute() {
  useDocumentTitle('Three games you love');
  return <SeedsScreen />;
}
