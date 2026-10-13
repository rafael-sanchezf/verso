/**
 * The profile photo: 64 on Profile, 96 on Edit profile (profile-brief, the
 * page, item 1; the frames 266:135 and 267:168).
 *
 * The picture when `avatarUrl` is set (an uploaded photo in the `avatars`
 * bucket, or the one Google seeded), else the initials on the placeholder
 * circle, else the circle alone. Rule 9: show what you know.
 */

import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Text } from '@/ui';
import { useTheme } from '@/ui/theme';

export interface ProfileAvatarProps {
  avatarUrl: string | null;
  /** From `initialsFor`; empty draws the circle alone. */
  initials?: string;
  size?: number;
}

export function ProfileAvatar({ avatarUrl, initials = '', size = 64 }: ProfileAvatarProps) {
  const t = useT();
  const theme = useTheme();

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors['bg/placeholder'] },
      ]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.image}
          contentFit="cover"
          transition={120}
          accessibilityLabel={t('profile.page.photo')}
        />
      ) : initials ? (
        <Text size={Math.round(size * 0.36)} weight={600} color="text/secondary">
          {initials}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
});
