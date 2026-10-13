/**
 * `/settings/steam` — link Steam, import the library, unlink. Pushed from the
 * "Steam" row in Settings. Accepts `status` and `reason` when `/steam/linked`
 * forwards a cold-start return here.
 *
 * The screen lives in `src/screens/steam/` so this file stays what the route
 * map says it is.
 */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { SteamScreen } from '@/screens/steam/steam-screen';

export default function SteamSettingsRoute() {
  const t = useT();
  useDocumentTitle(t('profile.steam.title'));
  return <SteamScreen />;
}
