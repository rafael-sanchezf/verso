/** `/onboarding/seeds`: three games you love, the first ranked games. */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { SeedsScreen } from '@/screens/onboarding/seeds-screen';

export default function OnboardingSeedsRoute() {
  const t = useT();
  useDocumentTitle(t('onboarding.seeds.title'));
  return <SeedsScreen />;
}
