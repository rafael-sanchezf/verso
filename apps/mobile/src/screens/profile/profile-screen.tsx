/**
 * The Profile tab: one page for every medium (docs/design/profile-brief.md
 * with Rafa's letters of 2026-10-12 applied; movies-build.md, PR 5; frames
 * `Profile · Every medium` 266:135 and `Profile · One medium` 267:112).
 *
 * Top to bottom: the identity row with Edit; the switcher (All, then one icon
 * per tracked medium, only when there is more than one); the tiles in Beli's
 * shape; the Friends door; a section per medium on All, or "Your top films"
 * (games) on one; Share; Recent at two rows with "See all ›" to Activity.
 *
 * The tab bar stays the active medium's; this page has no medium chip and
 * its switcher is its own, defaulting to All every time the tab is opened
 * fresh, and never changing the app's medium (only a section's "See all"
 * does, since it lands on that medium's Ranking).
 *
 * Share is the plain-text top tens on the share sheet, or copied in a browser
 * without `navigator.share` (W0 finding 12). The public link replaces it once
 * the public page exists (web brief, item 8); until then it is the text
 * whatever `profiles.public` says.
 */

import type { TierRows } from '@/screens/ranking/model';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { assembleRanking } from '@/screens/ranking/model';
import { setActiveMedium, trackedMedia, type LiveMedium } from '@/state/medium';
import { Button, EmptyState, EmptyStateCard, ErrorLine, Icon, ScreenHeader, Skeleton, Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import { ProfileAvatar } from './avatar';
import {
  RECENT_ROWS,
  useMediumStats,
  useProfileHours,
  useProfileIdentity,
  useRankerPercentile,
  useRecentActivity,
  useRefetchProfileOnFocus,
} from './data';
import { subtitleFor } from './identity';
import {
  initialsFor,
  MEDIUM_KEYS,
  mediumOf,
  nameLine,
  profileShareText,
  profileTiles,
  profileView,
  sectionCounts,
  shownMedia,
  shortAgo,
  switcherOptions,
  topTitle,
  type ProfileView,
} from './model';
import { ActivityRow, FriendsDoor, MediumSection, ProfileSwitcher, SectionHeader } from './pieces';
import { StatTile } from './stat-tile';

export function ProfileScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  useRefetchProfileOnFocus();
  const identity = useProfileIdentity();
  const profile = identity.data ?? null;
  const tracked = trackedMedia(profile?.media);
  const counts = useMediumStats(tracked);
  // The media the page shows: tracked and holding an entry. Null until the
  // profile and every tracked medium's counts are in, and the page holds
  // skeletons rather than drawing the games-only layout first.
  const shown = profile ? shownMedia(profile.media, counts.stats) : null;

  const [picked, setPicked] = useState<ProfileView>('all');
  const view = profileView(picked, shown ?? []);
  const options = switcherOptions(shown ?? []);
  const medium = mediumOf(view);

  const percentile = useRankerPercentile(medium);
  const hours = useProfileHours(medium);
  const recent = useRecentActivity(medium);

  const tiles = shown
    ? profileTiles(
        view,
        shown,
        {
          stats: counts.stats,
          percentile: percentile.isError ? null : percentile.data,
          hours: hours.data,
        },
        t,
      )
    : null;
  const tilesFailed = counts.isError || hours.isError;
  const retryTiles = () => {
    counts.refetch();
    if (hours.isError) void hours.refetch();
  };

  const scope: LiveMedium[] = medium ? [medium] : (shown ?? []);
  const rankedInScope = scope.reduce((total, each) => total + (counts.stats[each]?.ranked ?? 0), 0);

  const openItem = (id: string, itemMedium: string) => {
    if (itemMedium === 'movie') router.push({ pathname: '/movie/[id]', params: { id, from: t('profile.page.title') } });
    else router.push({ pathname: '/game/[id]', params: { id, from: t('profile.page.title') } });
  };

  const seeRanking = (each: LiveMedium) => {
    setActiveMedium(each);
    router.navigate('/ranking');
  };

  async function onShare() {
    const message = profileShareText(
      scope.map((each) => {
        const tiers = queryClient.getQueryData<TierRows>(queryKeys.ranking(each));
        return { medium: each, items: tiers ? assembleRanking(tiers) : [] };
      }),
      t,
      profile?.username ?? null,
    );
    if (!message) return;

    if (Platform.OS === 'web' && typeof navigator.share !== 'function') {
      try {
        await navigator.clipboard.writeText(message);
        alert(t('profile.page.copied'), t('profile.page.copiedBody'));
      } catch {
        alert(t('profile.page.couldNotCopy'), t('profile.page.couldNotCopyBody'));
      }
      return;
    }

    try {
      await Share.share({ message });
    } catch {
      // The share sheet itself failed to open; nothing more to do about it.
    }
  }

  const name = profile ? nameLine(profile) : null;

  return (
    <SafeAreaView style={styles.fill} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space[10] }}>
        <ScreenHeader
          title={t('profile.page.title')}
          paddingBottom={8}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.page.settings')}
              hitSlop={10}
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.settingsButton, pressed ? styles.pressed : undefined]}>
              <Icon name="settings" size={24} />
            </Pressable>
          }
        />

        <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[1], gap: 20 }}>
          <View style={[styles.row, { gap: 14 }]}>
            <ProfileAvatar avatarUrl={profile?.avatarUrl ?? null} initials={profile ? initialsFor(profile) : ''} />
            <View style={{ flex: 1, gap: 2 }}>
              {profile ? (
                <>
                  {name ? (
                    <Text size={22} weight={700} numberOfLines={1}>
                      {name}
                    </Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => router.push('/profile/edit')}>
                      <Text size={22} weight={700} color="brand/text" numberOfLines={1}>
                        {t('profile.page.setYourName')}
                      </Text>
                    </Pressable>
                  )}
                  <Text size={15} color="text/secondary" numberOfLines={1}>
                    {subtitleFor(profile, t)}
                  </Text>
                </>
              ) : identity.isError ? (
                <ErrorLine message={t('profile.page.somethingWentWrong')} onRetry={() => void identity.refetch()} />
              ) : (
                <>
                  <Skeleton width={160} height={22} radius={6} />
                  <Skeleton width={110} height={15} radius={6} />
                </>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.page.editProfile')}
              hitSlop={8}
              onPress={() => router.push('/profile/edit')}
              style={({ pressed }) => [
                styles.editPill,
                { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.pill },
                pressed ? styles.pressed : undefined,
              ]}>
              <Text size={14} weight={600}>
                {t('profile.page.edit')}
              </Text>
            </Pressable>
          </View>

          <ProfileSwitcher options={options} value={view} onChange={setPicked} />

          {tilesFailed ? (
            <ErrorLine message={t('profile.page.couldNotLoadNumbers')} onRetry={retryTiles} />
          ) : tiles ? (
            <View style={[styles.row, { gap: 8 }]}>
              {tiles.map((tile) => (
                <StatTile
                  key={tile.key}
                  value={tile.value}
                  label={tile.label}
                  onPress={tile.key === 'ranked' && medium ? () => seeRanking(medium) : undefined}
                />
              ))}
            </View>
          ) : (
            <Skeleton width="100%" height={58} radius={12} />
          )}

          <FriendsDoor />

          {!shown ? null : view === 'all' ? (
            shown.map((each) => (
              <MediumSection
                key={each}
                medium={each}
                title={t(MEDIUM_KEYS[each])}
                counts={sectionCounts(each, counts.stats[each], t)}
                onSeeAll={() => seeRanking(each)}
                onOpen={openItem}
              />
            ))
          ) : (
            <MediumSection
              medium={view}
              title={t(topTitle(view))}
              counts={null}
              onSeeAll={() => seeRanking(view)}
              onOpen={openItem}
            />
          )}

          {rankedInScope > 0 ? (
            <Button
              label={view === 'all' ? t('profile.page.shareProfile') : t('profile.page.shareTop')}
              variant="secondary"
              onPress={onShare}
              style={styles.shareButton}
            />
          ) : null}

          <View style={{ gap: 4 }}>
            <SectionHeader
              title={t('profile.page.recent')}
              trailing={recent.data && recent.data.length > 0 ? t('profile.page.seeAllLink') : null}
              trailingColor="brand/text"
              onPress={() =>
                router.push({ pathname: '/profile/activity', params: medium ? { medium } : {} })
              }
              accessibilityLabel={t('profile.page.seeAllActivity')}
            />

            {recent.isError ? (
              <ErrorLine message={t('profile.page.somethingWentWrong')} onRetry={() => void recent.refetch()} />
            ) : !recent.data ? (
              <View style={{ gap: 12, paddingTop: 8 }}>
                {Array.from({ length: RECENT_ROWS }, (_, index) => (
                  <Skeleton key={index} width="100%" height={48} radius={8} />
                ))}
              </View>
            ) : recent.data.length > 0 ? (
              <View>
                {recent.data.map((event, index) => (
                  <ActivityRow
                    key={`${event.kind}:${event.mediaItemId}:${event.onDate}:${event.occurredAt ?? ''}:${index}`}
                    event={event}
                    trailing={shortAgo(event.onDate, t)}
                    onPress={() => openItem(event.mediaItemId, event.medium)}
                  />
                ))}
              </View>
            ) : (
              <View style={{ paddingTop: 8 }}>
                <EmptyStateCard>
                  <EmptyState
                    icon="trophy"
                    title={t('profile.page.nothingYet')}
                    body={t(`profile.page.nothingYetBody.${medium ?? 'all'}`)}
                  />
                </EmptyStateCard>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  settingsButton: { padding: 4 },
  editPill: { paddingVertical: 6, paddingHorizontal: 12 },
  shareButton: { paddingVertical: 12 },
  pressed: { opacity: 0.7 },
});
