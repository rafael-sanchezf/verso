/**
 * `/settings/steam/candidates` — the games an import found that are not in the
 * user's lists. `hidden=1` when the import read every game at zero minutes.
 */

import { useDocumentTitle } from '@/lib/use-document-title';
import { SteamCandidatesScreen } from '@/screens/steam/candidates-screen';

export default function SteamCandidatesRoute() {
  useDocumentTitle('From Steam');
  return <SteamCandidatesScreen />;
}
