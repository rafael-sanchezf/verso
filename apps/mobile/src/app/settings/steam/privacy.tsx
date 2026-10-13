/**
 * `/settings/steam/privacy` — the privacy checklist, pushed when an import
 * answers `private_profile`.
 */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { SteamPrivacyScreen } from '@/screens/steam/privacy-screen';

export default function SteamPrivacyRoute() {
  const t = useT();
  useDocumentTitle(t('profile.steam.privacy.title'));
  return <SteamPrivacyScreen />;
}
