/**
 * Valve's attribution, under every screen that shows Steam data.
 *
 * The Steam Web API Terms ask for Valve's name and a link (no `nofollow`) on
 * pages that use Steam data, and for nothing that implies Valve endorses the
 * app (docs/research/game-data-sources.md 4.1, and the compliance checklist in
 * section 10). So: "Powered by Steam" as a link to the store, and the trademark
 * line. Quiet on purpose -- footnote size, `text/secondary` -- because it is a
 * credit, not a feature.
 *
 * Valve's logo is not drawn yet. The repo has no Steam mark, Simple Icons'
 * copy has not been brought in, and drawing one from memory is how a brand
 * mark ends up subtly wrong; when the asset arrives it goes beside the first
 * line, the way `GoogleMark` sits in its button.
 */

import { View } from 'react-native';

import { Text } from '@/ui';

import { STEAM_STORE_URL } from './import-outcome';
import { LinkText } from './link-text';

export function SteamAttribution() {
  return (
    <View style={{ gap: 4 }}>
      <LinkText
        label="Powered by Steam"
        url={STEAM_STORE_URL}
        accessibilityLabel="Powered by Steam. Opens the Steam store."
        size={13}
        color="text/secondary"
      />
      <Text size={12} color="text/secondary">
        Steam and the Steam logo are trademarks of Valve Corporation.
      </Text>
    </View>
  );
}
