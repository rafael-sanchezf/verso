/**
 * Ranking's banner (onboarding.md, "The doors", frame 104:79): when the user
 * has played games with no ranking yet, a row above the list says how many,
 * and opens the session over them with no tiers, so the session asks each
 * game's tier first (batch-session.md, "Untiered items").
 *
 * The drain: games marked played on the deck page, from Search's add-many, by
 * the Steam import, or left by a session that was closed before its Done. It
 * draws nothing while the read is out, when it fails, and when it is empty;
 * the Ranking tab is complete without it.
 *
 * Owned by the session's branch and drawn by the Ranking screen with one line,
 * so the Ranking tab's own files barely change.
 */

import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Icon, Pressed, Text, useTheme } from '@/ui';

import { usePlayedNotRanked } from './queries';
import { SESSION_HREF } from './routes';
import { startSession } from './session-store';

export function RankingBanner() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const drain = usePlayedNotRanked();
  const rows = drain.data ?? [];

  if (rows.length === 0) return null;

  const label =
    rows.length === 1 ? t('onboarding.rankingBanner.one') : t('onboarding.rankingBanner.other', { count: rows.length });

  const open = () => {
    startSession({
      source: 'drain',
      items: rows.map((row) => ({ mediaItemId: row.mediaItemId, tier: null, row })),
      onDone: 'back',
    });
    router.push(SESSION_HREF);
  };

  return (
    <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
      <Pressed
        onPress={open}
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.md,
            padding: theme.space[3],
            gap: theme.space[3],
          },
        ]}>
        <Icon name="gamepad-2" size={22} color="brand/text" />
        <Text size={15} weight={500} layout={styles.label}>
          {label}
        </Text>
        <Icon name="chevron-right" size={16} color="text/secondary" />
      </Pressed>
    </View>
  );
}

const styles = StyleSheet.create({
  // 46 high with the 22pt icon and 12 of padding: past the 44pt target.
  banner: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1 },
});
