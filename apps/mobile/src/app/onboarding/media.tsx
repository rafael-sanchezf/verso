/** `/onboarding/media`: the first question, where the root layout's gate lands a new user. */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { MediaScreen } from '@/screens/onboarding/media-screen';

export default function OnboardingMediaRoute() {
  const t = useT();
  useDocumentTitle(t('onboarding.media.documentTitle'));
  return <MediaScreen />;
}
