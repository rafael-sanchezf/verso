/**
 * Services (movies-build.md, PR 6, item 2; frame 285:68): where the person
 * watches, the movies analog of Platforms, after the media question for
 * anyone who picked movies (onboarding-brief, section 2).
 *
 * The title block, then the region read from the device with "Change" in the
 * brand green; ten tiles from `watchProviders(region)` (services.ts has the
 * order and the "More" tile, which opens the region's full list in place).
 * Every tile carries the service's logo (Rafa's letter, 2026-10-14), from
 * `watch_providers.logo_image_id` through the poster path (`coverCandidates`);
 * the name sits beside it, as drawn. Then "Theaters", on by default, with its
 * line; Continue writes `setWatchSettings` (the region and the picks) and
 * goes on to "Films you love"; "Skip for now" goes on and writes nothing.
 *
 * "Theaters" has no column to write yet: the Calendar shows openings for
 * every watchlist film whatever it says, so the chip is drawn and toggles,
 * and nothing stores it (said in the PR).
 */

import { coverCandidates, getMyProfile, setWatchSettings, watchProviders, type WatchProvider } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { select } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { invalidateProfileSettings } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Button, ErrorLine, Icon, Skeleton, Text, TextButton, useTheme } from '@/ui';

import { BottomActions, TitleBlock } from './pieces';
import {
  deviceRegion,
  regionChoices,
  regionName,
  serviceLabel,
  serviceTiles,
  servicesToStore,
  toggleService,
} from './services';
import { seedsHref } from './session/routes';

const LOGO = 24;
const TILE_HEIGHT = 48;

/** `initialPicked` is for `/preview-onboarding` only: the frame's picks on fixtures. */
export function ServicesScreen({ initialPicked = [] }: { initialPicked?: readonly number[] } = {}) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [region, setRegion] = useState(() => deviceRegion(getLocales()[0]?.regionCode));
  const [picked, setPicked] = useState<Set<number>>(() => new Set(initialPicked));
  const [expanded, setExpanded] = useState(false);
  const [theaters, setTheaters] = useState(true);

  // Read so a returning person's profile is warm for the steps after; the
  // region itself comes from the device, as the brief asks.
  useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });

  const providers = useQuery({
    queryKey: queryKeys.watchProviders(region),
    queryFn: () => watchProviders(supabase, region),
  });
  const { tiles, more } = serviceTiles(providers.data ?? [], expanded);

  const save = useMutation({
    mutationFn: () => setWatchSettings(supabase, { region, providerIds: servicesToStore(picked, providers.data ?? []) }),
    onSuccess: (stored) => {
      queryClient.setQueryData(queryKeys.profileMe(), stored);
      invalidateProfileSettings(queryClient);
      router.push(seedsHref('movie'));
    },
  });

  const name = (code: string) => {
    const key = regionName(code);
    return key ? t(key) : code;
  };

  const changeRegion = () =>
    select({
      title: t('onboarding.services.changeRegion'),
      choices: regionChoices(region).map((code) => ({
        label: name(code),
        onPress: () => setRegion(code),
      })),
    });

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space[4],
          paddingTop: insets.top + theme.space[2],
          paddingBottom: theme.space[4],
          gap: 18,
        }}>
        <View style={{ gap: 6 }}>
          <TitleBlock
            kicker={t('onboarding.services.kicker')}
            title={t('onboarding.services.title')}
            subtitle={t('onboarding.services.subtitle')}
          />
          <View style={[styles.row, { gap: 6 }]}>
            <Icon name="globe" size={14} color="text/secondary" />
            <Text size={14} color="text/secondary">
              {name(region)}
            </Text>
            <Text size={14} color="text/secondary">
              ·
            </Text>
            <TextButton
              label={t('onboarding.services.change')}
              size={14}
              weight={500}
              color="brand/text"
              onPress={changeRegion}
            />
          </View>
        </View>

        {providers.isPending ? (
          <Grid
            items={Array.from({ length: SKELETONS }, (_, index) => (
              <Skeleton key={index} height={TILE_HEIGHT} radius={12} />
            ))}
          />
        ) : providers.isError ? (
          <ErrorLine message={t('onboarding.services.couldNotLoad')} onRetry={() => void providers.refetch()} />
        ) : tiles.length === 0 ? (
          <Text size={15} color="text/secondary">
            {t('onboarding.services.none')}
          </Text>
        ) : (
          <Grid
            items={[
              ...tiles.map((provider) => (
                <ServiceTile
                  key={provider.providerId}
                  provider={provider}
                  picked={picked.has(provider.providerId)}
                  onPress={() => setPicked((current) => toggleService(current, provider.providerId))}
                />
              )),
              ...(more ? [<MoreTile key="more" onPress={() => setExpanded(true)} />] : []),
            ]}
          />
        )}

        <View style={[styles.row, { gap: 10 }]}>
          <TheatersChip on={theaters} onPress={() => setTheaters((current) => !current)} />
          <Text size={13} color="text/secondary" layout={styles.shrink}>
            {t('onboarding.services.theatersLine')}
          </Text>
        </View>
      </ScrollView>

      <BottomActions>
        {save.isError ? <ErrorLine message={t('onboarding.services.couldNotSave')} /> : null}
        <Button label={t('common.continue')} disabled={save.isPending} onPress={() => save.mutate()} />
        <View style={styles.centre}>
          <TextButton
            label={t('onboarding.services.skipForNow')}
            weight={400}
            color="text/secondary"
            disabled={save.isPending}
            onPress={() => router.push(seedsHref('movie'))}
          />
        </View>
      </BottomActions>
    </View>
  );
}

const SKELETONS = 10;

/** Two tiles a row, 10 apart both ways, as drawn; an odd last tile keeps its half. */
function Grid({ items }: { items: ReactElement[] }) {
  const rows: ReactElement[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));

  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, index) => (
        <View key={index} style={[styles.row, { gap: 10 }]}>
          {row.map((item) => (
            <View key={item.key} style={styles.fill}>
              {item}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.fill} /> : null}
        </View>
      ))}
    </View>
  );
}

function Tile({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  children: ReactNode;
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
          borderRadius: theme.radius.md,
          // The unpicked tile keeps the border's width in the surface color,
          // so picking one does not shift its content.
          borderColor: selected ? theme.colors['brand/text'] : theme.colors['bg/surface'],
        },
        pressed && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

function ServiceTile({ provider, picked, onPress }: { provider: WatchProvider; picked: boolean; onPress: () => void }) {
  const name = serviceLabel(provider.name);

  return (
    <Tile label={name} selected={picked} onPress={onPress}>
      <Logo provider={provider} />
      <Text size={15} weight={600} numberOfLines={1} layout={styles.fill}>
        {name}
      </Text>
      {picked ? <Icon name="check" size={16} color="brand/text" /> : null}
    </Tile>
  );
}

/** The service's logo, through the poster path; its initial on the placeholder when TMDB has none or it fails. */
function Logo({ provider }: { provider: WatchProvider }) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = provider.logoImageId ? coverCandidates({ coverImageId: provider.logoImageId, externalIds: null })[0] : undefined;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.logo, { backgroundColor: theme.colors['bg/placeholder'] }]}>
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.logoImage} contentFit="cover" transition={120} onError={() => setFailed(true)} />
      ) : (
        <Text size={12} weight={700} color="text/secondary">
          {provider.name.trim().charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function MoreTile({ onPress }: { onPress: () => void }) {
  const t = useT();
  const theme = useTheme();
  const label = t('onboarding.services.more');

  return (
    <Tile label={label} onPress={onPress}>
      <View style={[styles.logo, { backgroundColor: theme.colors['bg/placeholder'] }]} />
      <Text size={15} weight={600} layout={styles.fill}>
        {label}
      </Text>
      <Icon name="chevron-right" size={16} color="text/secondary" />
    </Tile>
  );
}

/** "Theaters": the brand stroke and a check when on (the default), the surface when off. */
function TheatersChip({ on, onPress }: { on: boolean; onPress: () => void }) {
  const t = useT();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={t('onboarding.services.theaters')}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      // About 32 tall; the slop brings it to 44.
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderColor: on ? theme.colors['brand/text'] : theme.colors['bg/surface'],
        },
        pressed && styles.pressed,
      ]}>
      {on ? <Icon name="check" size={14} color="brand/text" /> : null}
      <Text size={14} weight={600}>
        {t('onboarding.services.theaters')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  centre: { alignItems: 'center' },
  tile: {
    height: TILE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
  },
  logo: {
    width: LOGO,
    height: LOGO,
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: { width: '100%', height: '100%' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pressed: { opacity: 0.7 },
});
