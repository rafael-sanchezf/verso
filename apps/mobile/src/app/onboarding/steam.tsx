/** `/onboarding/steam`: Link Steam, for PC players with no link, after the review. */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { SteamStepScreen } from '@/screens/onboarding/steam-step-screen';

export default function OnboardingSteamRoute() {
  const t = useT();
  useDocumentTitle(t('onboarding.steam.documentTitle'));
  return <SteamStepScreen />;
}
