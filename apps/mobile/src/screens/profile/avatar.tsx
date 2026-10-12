/**
 * The 64pt circle at the top of Profile.
 *
 * Two notes in profile.md read as if they disagree and are reconciled here.
 * The Layout section calls it "a 64pt circle in `bg/placeholder` (no avatar
 * source in V0; open item in ui-brief.md)" — that is what the frame itself
 * draws, because the design file has no photo in its sample data, and it is
 * flagged as an open question for a future upload flow. The Data section is
 * explicit about behavior: "Avatar: `avatarUrl` when set, else the
 * placeholder circle." `avatarUrl` is already populated today for a Google
 * account (seeded from the provider's picture), so rule 9 (show what you
 * know) says to draw it when it is there; there is simply no sample data in
 * the frame showing that state. Hence: real image when the fact exists,
 * frame's placeholder otherwise.
 */

import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui/theme';

const SIZE = 64;

export function ProfileAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const theme = useTheme();

  return (
    <View style={[styles.circle, { backgroundColor: theme.colors['bg/placeholder'] }]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.image}
          contentFit="cover"
          transition={120}
          accessibilityLabel="Your profile picture"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
