/** `/onboarding/media`: the first question, where the root layout's gate lands a new user. */

import { useDocumentTitle } from '@/lib/use-document-title';
import { MediaScreen } from '@/screens/onboarding/media-screen';

export default function OnboardingMediaRoute() {
  useDocumentTitle('Set up Verso');
  return <MediaScreen />;
}
