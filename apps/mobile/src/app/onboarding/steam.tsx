/** `/onboarding/steam`: Link Steam, for PC players with no link, after the review. */

import { useDocumentTitle } from '@/lib/use-document-title';
import { SteamStepScreen } from '@/screens/onboarding/steam-step-screen';

export default function OnboardingSteamRoute() {
  useDocumentTitle('Link Steam');
  return <SteamStepScreen />;
}
