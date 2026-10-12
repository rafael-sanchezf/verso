/**
 * The Profile tab (docs/design/specs/profile.md).
 *
 * Header, identity row, four stat tiles, "Share my top 10", and Recent —
 * dated by `placedAt` and numbered by global rank, never `updatedAt` (see
 * `recentRankings`'s own doc comment for why: a neighbour's insert moving a
 * row is not activity).
 *
 * "Share my top 10" is the share sheet on the phone. In a browser
 * react-native-web's `Share` is `navigator.share`, which most desktop browsers
 * do not have, and it rejects there (W0 finding 12); the web convention is to
 * copy the text and say so, so that is what happens when it is missing.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { useSession } from '@/lib/use-session';
import {
  Button,
  EmptyState,
  EmptyStateCard,
  ErrorLine,
  Icon,
  Pressed,
  ScreenHeader,
  Skeleton,
  Text,
} from '@/ui';
import { useTheme } from '@/ui/theme';

import { useProfileIdentity, useProfileRanking, useProfileRecent, useProfileStats } from './data';
import { displayNameFor, subtitleFor } from './identity';
import { ProfileAvatar } from './avatar';
import { EMPTY_TIERS, globalRank, tierSizes, toRankedList } from './ranking-math';
import { RecentRow } from './recent-row';
import { StatTile } from './stat-tile';
import { topTenShareText } from './share-text';

export function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();

  const identity = useProfileIdentity();
  const stats = useProfileStats();
  const recent = useProfileRecent();
  const ranking = useProfileRanking();

  const email = session.status === 'signed-in' ? (session.user.email ?? null) : null;

  const rankedTiers = ranking.data ?? EMPTY_TIERS;
  const sizes = useMemo(() => tierSizes(rankedTiers), [rankedTiers]);
  const topTen = useMemo(() => toRankedList(rankedTiers).slice(0, 10), [rankedTiers]);

  const hasRankings = (recent.data?.length ?? 0) > 0;

  async function onShare() {
    if (topTen.length === 0) return;
    const message = topTenShareText(topTen);

    if (Platform.OS === 'web' && typeof navigator.share !== 'function') {
      try {
        await navigator.clipboard.writeText(message);
        alert('Top 10 copied', 'Paste it wherever you want to share it.');
      } catch {
        // No clipboard either (an insecure origin, a denied permission).
        alert('Could not copy your top 10', 'Your browser did not allow it.');
      }
      return;
    }

    try {
      await Share.share({ message });
    } catch {
      // The share sheet itself failed to open; nothing more to do about it.
    }
  }

  return (
    <SafeAreaView style={styles.fill} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space[10] }}>
        <ScreenHeader
          title="Profile"
          paddingBottom={8}
          right={
            <Pressed onPress={() => router.push('/settings')} style={styles.settingsButton}>
              <Icon name="settings" size={24} />
            </Pressed>
          }
        />

        <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[1], gap: 20 }}>
          <View style={[styles.identityRow, { gap: 14 }]}>
            <ProfileAvatar avatarUrl={identity.data?.avatarUrl ?? null} />
            <View style={{ flex: 1, gap: 2 }}>
              {identity.data ? (
                <>
                  <Text style="title-2" numberOfLines={1}>
                    {displayNameFor(identity.data, email)}
                  </Text>
                  <Text size={15} color="text/secondary" numberOfLines={1}>
                    {subtitleFor(identity.data)}
                  </Text>
                </>
              ) : identity.isError ? (
                <ErrorLine message="Something went wrong." onRetry={() => void identity.refetch()} />
              ) : (
                <>
                  <Skeleton width={160} height={22} radius={6} />
                  <Skeleton width={110} height={15} radius={6} />
                </>
              )}
            </View>
          </View>

          <View style={[styles.statsRow, { gap: 8 }]}>
            <StatTile
              value={stats.data ? String(stats.data.ranked) : '—'}
              label="Ranked"
              onPress={() => router.navigate('/ranking')}
            />
            <StatTile
              value={stats.data ? String(stats.data.backlog) : '—'}
              label="Backlog"
              onPress={() => router.navigate('/next')}
            />
            <StatTile
              value={stats.data ? String(stats.data.upcoming) : '—'}
              label="Upcoming"
              onPress={() => router.navigate({ pathname: '/next', params: { segment: 'upcoming' } })}
            />
            <StatTile value="—" label="Friends" />
          </View>

          {hasRankings ? (
            <Button
              label="Share my top 10"
              variant="contrast"
              onPress={onShare}
              // profile.md asks for 17 semibold (the `regular` size's label)
              // at 12pt vertical padding; `regular` pads 14 by default, so the
              // 12 is applied as a style override rather than forking Button.
              style={styles.shareButton}
            />
          ) : null}

          <View style={{ gap: 12 }}>
            <Text size={20} weight={700}>
              Recent
            </Text>

            {recent.isError ? (
              <ErrorLine message="Something went wrong." onRetry={() => void recent.refetch()} />
            ) : !recent.data ? (
              <View style={{ gap: 12 }}>
                <Skeleton width="100%" height={52} radius={8} />
                <Skeleton width="100%" height={52} radius={8} />
                <Skeleton width="100%" height={52} radius={8} />
              </View>
            ) : recent.data.length > 0 ? (
              <View>
                {recent.data.map((row) => (
                  <RecentRow
                    key={row.mediaItemId}
                    row={row}
                    rank={globalRank(sizes, row.placement)}
                    onPress={() =>
                      router.push({
                        pathname: '/game/[id]',
                        params: { id: row.mediaItemId, from: 'Profile' },
                      })
                    }
                  />
                ))}
              </View>
            ) : (
              <EmptyStateCard>
                <EmptyState icon="trophy" title="No rankings yet" body="Rank your first game from its page." />
              </EmptyStateCard>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  statsRow: { flexDirection: 'row' },
  settingsButton: { padding: 4 },
  shareButton: { paddingVertical: 12 },
});
