/**
 * `/settings/steam/privacy` — the privacy checklist, pushed when an import
 * answers `private_profile`.
 */

import { useDocumentTitle } from '@/lib/use-document-title';
import { SteamPrivacyScreen } from '@/screens/steam/privacy-screen';

export default function SteamPrivacyRoute() {
  useDocumentTitle('Steam privacy');
  return <SteamPrivacyScreen />;
}
