/**
 * Media (specs/onboarding.md, "Media", frame 137:34; decision 25): the first
 * question, and the only one with no skip, because its answer chooses every
 * deck after it.
 *
 * A 2 by 2 grid. Games and Movies are live and toggle, a picked tile carrying
 * the medium's border and a check. TV and Books are held at full opacity with
 * "Coming soon" and a bell line: a tap records interest once
 * (`media_interest`) and the line becomes "We'll tell you", where it stays
 * (media-picks.ts).
 *
 * Continue stores the media (`setProfileMedia`), which is what ends the new-user
 * state at the root layout's gate, logs `first_session`, and goes on to the
 * platforms when games is picked. A movies-only user goes to the tabs until
 * the movies onboarding lands (the movies session's work); that move waits for
 * the gate to have seen the stored media, because until then the tabs are not
 * registered and the navigation would go nowhere.
 */

import { getMyProfile, setProfileMedia } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { invalidateProfile } from '@/lib/invalidate';
import { logAppEvent } from '@/lib/log-event';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Button, Chip, ErrorLine, Icon, Text, useTheme } from '@/ui';

import {
  MEDIA_TILES,
  NOTIFIED_LINE,
  NOTIFY_LINE,
  afterMedia,
  canContinue,
  mediaToStore,
  tapHeld,
  toggleMedium,
  type HeldMedium,
  type LiveMedium,
  type MediaTile,
} from './media-picks';
import { BottomActions, TitleBlock } from './pieces';

export function MediaScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [picked, setPicked] = useState<Set<LiveMedium>>(() => new Set());
  const [notified, setNotified] = useState<Set<HeldMedium>>(() => new Set());
  const [toTabs, setToTabs] = useState(false);

  const profile = useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });
  const storedMedia = profile.data?.media ?? null;

  const save = useMutation({
    mutationFn: (media: LiveMedium[]) => setProfileMedia(supabase, media),
    onSuccess: (stored, media) => {
      // The gate reads this key: writing the answer in at once is what lets
      // the tabs register without waiting for a refetch.
      queryClient.setQueryData(queryKeys.profileMe(), stored);
      invalidateProfile(queryClient);
      // A lost event is a lost data point, never a reason to stop the user.
      void logAppEvent('first_session').catch(() => undefined);
      if (afterMedia(new Set(media)) === 'platforms') router.push('/onboarding/platforms');
      else setToTabs(true);
    },
  });

  useEffect(() => {
    if (toTabs && storedMedia !== null) router.replace('/');
  }, [toTabs, storedMedia, router]);

  const onHeld = (medium: HeldMedium) => {
    const { notified: next, log } = tapHeld(notified, medium);
    setNotified(next);
    if (log) void logAppEvent('media_interest', { medium }).catch(() => undefined);
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space[4],
          paddingTop: insets.top + theme.space[2],
          gap: 18,
        }}>
        <TitleBlock
          kicker={t('onboarding.media.kicker')}
          title={t('onboarding.media.title')}
          subtitle={t('onboarding.media.subtitle')}
        />

        <View style={[styles.grid, { gap: 10 }]}>
          {[MEDIA_TILES.slice(0, 2), MEDIA_TILES.slice(2, 4)].map((row, index) => (
            <View key={index} style={[styles.gridRow, { gap: 10 }]}>
              {row.map((tile) =>
                tile.live ? (
                  <LiveTile
                    key={tile.key}
                    tile={tile}
                    picked={picked.has(tile.key as LiveMedium)}
                    onPress={() => setPicked((current) => toggleMedium(current, tile.key as LiveMedium))}
                  />
                ) : (
                  <HeldTile
                    key={tile.key}
                    tile={tile}
                    notified={notified.has(tile.key as HeldMedium)}
                    onPress={() => onHeld(tile.key as HeldMedium)}
                  />
                ),
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <BottomActions>
        {save.isError ? (
          <ErrorLine message={t('onboarding.media.couldNotSave')} />
        ) : null}
        <Button
          label={t('common.continue')}
          disabled={!canContinue(picked) || save.isPending || toTabs}
          onPress={() => save.mutate(mediaToStore(picked))}
        />
      </BottomActions>
    </View>
  );
}

function Tile({
  label,
  selected,
  onPress,
  children,
  bordered,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  bordered: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: 14,
          borderWidth: 1.5,
          // The unpicked tile keeps the border's width in the surface color, so
          // picking one does not shift its content by a point and a half.
          borderColor: bordered ? theme.colors['brand/text'] : theme.colors['bg/surface'],
        },
        pressed && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

function LiveTile({ tile, picked, onPress }: { tile: MediaTile; picked: boolean; onPress: () => void }) {
  const t = useT();
  const name = t(tile.name);

  return (
    <Tile label={name} selected={picked} onPress={onPress} bordered={picked}>
      <Icon name={tile.icon} size={28} color="text/secondary" />
      <Text size={17} weight={600}>
        {name}
      </Text>
      {/* The third line: a check when picked, an empty line of the same height when not. */}
      <View style={styles.third}>{picked ? <Icon name="check" size={15} color="brand/text" /> : null}</View>
    </Tile>
  );
}

function HeldTile({ tile, notified, onPress }: { tile: MediaTile; notified: boolean; onPress: () => void }) {
  const t = useT();
  const theme = useTheme();
  const name = t(tile.name);
  const line = t(notified ? NOTIFIED_LINE : NOTIFY_LINE);

  return (
    <Tile label={t('onboarding.media.heldLabel', { name, line })} onPress={onPress} bordered={false}>
      <Icon name={tile.icon} size={28} color="text/secondary" />
      <Text size={17} weight={600} color="text/secondary">
        {name}
      </Text>
      <Chip label={t('onboarding.media.comingSoon')} style={{ backgroundColor: theme.colors['bg/placeholder'], alignSelf: 'center' }} />
      <View style={[styles.bell, { gap: 6 }]}>
        <Icon name={notified ? 'bell-ring' : 'bell'} size={14} color="text/secondary" />
        <Text size={11} color="text/secondary">
          {line}
        </Text>
      </View>
    </Tile>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: {},
  gridRow: { flexDirection: 'row' },
  tile: {
    flex: 1,
    height: 164,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  third: { height: 18, justifyContent: 'center' },
  bell: { flexDirection: 'row', alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
