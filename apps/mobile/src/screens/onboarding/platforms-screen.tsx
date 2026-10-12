/**
 * Platforms (specs/onboarding.md, "Platforms", frame 132:58; decision 20):
 * where the user plays, now or before, so the deck can be "popular on your
 * platforms".
 *
 * One list from `PLATFORM_FAMILIES`: a tile per family, and under a picked
 * family its generations as chips (platform-picks.ts has the rules). Nothing
 * here mentions backward compatibility; the deck assumes it (decision 27).
 *
 * Continue stores `expandPlatforms(picks)` and goes on to the seeds. "Skip for
 * now" goes on with nothing stored, and the deck reads every platform.
 *
 * `?edit=1` is the deck's "Add a platform" for a returning user: titled so,
 * the picks read back from the profile, Continue stores and goes back to the
 * deck, and "Cancel" goes back without storing (not drawn; the skip has no
 * meaning there).
 */

import { getMyProfile, setProfilePlatforms } from '@verso/api';
import { PLATFORM_FAMILIES, expandPlatforms, type PlatformFamilyGroup, type PlatformPickId } from '@verso/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { invalidateProfile } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Button, Chip, ErrorLine, Icon, Skeleton, Text, TextButton, useTheme } from '@/ui';

import { BottomActions, TitleBlock } from './pieces';
import { isFamilyPicked, orderedPicks, picksFromPlatforms, toggleFamily, togglePick } from './platform-picks';

export function PlatformsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ edit?: string }>();
  const editing = params.edit === '1';

  const [picks, setPicks] = useState<Set<PlatformPickId>>(() => new Set());

  const profile = useQuery({
    queryKey: queryKeys.profileMe(),
    queryFn: () => getMyProfile(supabase),
    enabled: editing,
  });

  // Read the profile back once; after that the chips are the user's.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!editing || prefilled.current || !profile.data) return;
    prefilled.current = true;
    setPicks(picksFromPlatforms(profile.data.platforms));
  }, [editing, profile.data]);

  const save = useMutation({
    mutationFn: (platforms: string[]) => setProfilePlatforms(supabase, platforms),
    onSuccess: (stored) => {
      queryClient.setQueryData(queryKeys.profileMe(), stored);
      // The profile, and the deck's pages, which are filtered by these platforms.
      invalidateProfile(queryClient);
      if (editing) router.back();
      else router.push('/onboarding/seeds');
    },
  });

  const loadingProfile = editing && !profile.data;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space[4],
          paddingTop: insets.top + theme.space[2],
          paddingBottom: theme.space[4],
          gap: 18,
        }}>
        <TitleBlock
          kicker={editing ? undefined : "Let's set up your ranking"}
          title={editing ? 'Add a platform' : 'Where do you play?'}
          subtitle="Now or before. Tap every one."
        />

        {loadingProfile ? (
          profile.isError ? (
            <ErrorLine message="Couldn't load your platforms." onRetry={() => void profile.refetch()} />
          ) : (
            <View style={{ gap: 10 }}>
              {PLATFORM_FAMILIES.map((family) => (
                <Skeleton key={family.id} height={56} radius={12} />
              ))}
            </View>
          )
        ) : (
          <View style={{ gap: 10 }}>
            {PLATFORM_FAMILIES.map((family) => (
              <Family
                key={family.id}
                family={family}
                picks={picks}
                onFamily={() => setPicks((current) => toggleFamily(current, family.id))}
                onPick={(pick) => setPicks((current) => togglePick(current, pick))}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <BottomActions>
        {save.isError ? (
          <ErrorLine message="Couldn't save your platforms. Check your connection and try again." />
        ) : null}
        <Button
          label="Continue"
          disabled={picks.size === 0 || save.isPending || loadingProfile}
          onPress={() => save.mutate(expandPlatforms(orderedPicks(picks).map((pick) => pick.id)))}
        />
        <View style={styles.centre}>
          {editing ? (
            <TextButton label="Cancel" weight={400} color="text/secondary" onPress={() => router.back()} />
          ) : (
            <TextButton
              label="Skip for now"
              weight={400}
              color="text/secondary"
              disabled={save.isPending}
              onPress={() => router.push('/onboarding/seeds')}
            />
          )}
        </View>
      </BottomActions>
    </View>
  );
}

function Family({
  family,
  picks,
  onFamily,
  onPick,
}: {
  family: PlatformFamilyGroup;
  picks: ReadonlySet<PlatformPickId>;
  onFamily: () => void;
  onPick: (pick: PlatformPickId) => void;
}) {
  const theme = useTheme();
  const picked = isFamilyPicked(picks, family.id);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={family.label}
        accessibilityState={{ selected: picked }}
        onPress={onFamily}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.md,
            borderColor: picked ? theme.colors['brand/text'] : theme.colors['bg/surface'],
            gap: theme.space[3],
          },
          pressed && styles.pressed,
        ]}>
        <View style={styles.glyph}>
          <Icon name="gamepad-2" size={24} color="text/secondary" />
        </View>
        <Text size={17} weight={600} layout={styles.fill}>
          {family.label}
        </Text>
        <Icon
          name={picked ? 'check' : 'chevron-right'}
          size={15}
          color={picked ? 'brand/text' : 'text/secondary'}
        />
      </Pressable>

      {picked && family.asksGeneration ? (
        <View style={[styles.chips, { paddingLeft: theme.space[3], paddingBottom: theme.space[1], gap: theme.space[2] }]}>
          {family.picks.map((pick) => {
            const on = picks.has(pick.id);
            return (
              <Pressable
                key={pick.id}
                accessibilityRole="button"
                accessibilityLabel={`${family.label} ${pick.label}`}
                accessibilityState={{ selected: on }}
                onPress={() => onPick(pick.id)}
                // The chip is about 30pt tall; the slop brings it to 44.
                hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
                style={({ pressed }) => (pressed ? styles.pressed : null)}>
                <Chip label={pick.label} variant={on ? 'played' : 'surface'} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1.5,
  },
  glyph: { width: 24, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  centre: { alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
