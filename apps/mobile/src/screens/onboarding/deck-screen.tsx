/**
 * The deck page (specs/onboarding.md, "The deck page", frame 152:202;
 * decision 27, guidelines principle 5): ten popular games on the user's
 * platforms at a time, each with a slider that says "played, and how it was"
 * in one gesture. Many at once invites "I played this, I played this"; a card
 * at a time invites "no, no, no".
 *
 * The rows are `deckCandidates` pages, each in `orderDeck` order (the three
 * most popular pinned on page one), appended below one another by "Show 10
 * more", each game once. Marks are local until "Rank these": then each marked
 * game is marked played (`markFinished`), with its played-on platform filled
 * when it shares exactly one with the profile, and the session opens over the
 * (game, tier) pairs in the page's order. An untouched row is not played and
 * nothing is written for it.
 *
 * The header counts toward ten ranked: ranked games plus the rows marked here.
 * Its `x` is "Done for now": into the session with marks, else to the tabs
 * (new user) or back (returning). `?from=ranking` is the returning user from
 * Ranking's door, who also gets "Add a platform" on the meta line.
 *
 * Rules are in deck-page.ts; the slider is tier-slider.tsx.
 */

import {
  coverCandidates,
  deckCandidates,
  getMyProfile,
  markFinished,
  setPlayedPlatforms,
  type DeckCandidateRow,
} from '@verso/api';
import type { Tier } from '@verso/core';
import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { useProfileStats } from '@/screens/profile/data';
import { GameRowSkeletons } from '@/screens/search/placeholders';
import { Button, Cover, ErrorLine, Icon, Text, TextButton, useTheme } from '@/ui';

import {
  DECK_PAGE_SIZE,
  deckMetaLine,
  deckRowMeta,
  doneForNow,
  hasMorePages,
  markRow,
  markedRows,
  mergePages,
  playedOnFor,
  progressCount,
  progressFraction,
  progressLabel,
  rankButtonLabel,
} from './deck-page';
import { BottomActions, ProgressHeader } from './pieces';
import { SESSION_HREF } from './session/routes';
import { startSession } from './session/session-store';
import { TierAxis, TierSlider } from './tier-slider';
import type { TierValue } from './tier-scale';

/** The slider column's indent: the 44pt cover and the row's 12pt gap. */
const TEXT_INDENT = 56;

interface DeckPages {
  pages: (DeckCandidateRow[] | undefined)[];
  pending: boolean;
  failed: UseQueryResult<DeckCandidateRow[]> | undefined;
}

/** Outside the component so `useQueries` can keep its result between renders. */
function combinePages(results: UseQueryResult<DeckCandidateRow[]>[]): DeckPages {
  return {
    pages: results.map((result) => result.data),
    pending: results.some((result) => result.isPending),
    failed: results.find((result) => result.isError),
  };
}

export function DeckScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ from?: string }>();
  const returning = params.from === 'ranking';

  const profile = useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });
  const platforms = profile.data?.platforms ?? null;
  const stats = useProfileStats();

  const [pageCount, setPageCount] = useState(1);
  const offsets = Array.from({ length: pageCount }, (_, index) => index * DECK_PAGE_SIZE);
  const deck = useQueries({
    queries: offsets.map((offset) => ({
      queryKey: queryKeys.deck(platforms, offset, DECK_PAGE_SIZE),
      queryFn: () => deckCandidates(supabase, platforms, DECK_PAGE_SIZE, offset),
      enabled: profile.data !== undefined,
    })),
    combine: combinePages,
  });

  const rows = mergePages(deck.pages);
  const [marks, setMarks] = useState<ReadonlyMap<string, Tier>>(() => new Map());
  const count = progressCount(stats.data?.ranked ?? 0, marks);

  const onMark = useCallback((mediaItemId: string, tier: Tier) => {
    setMarks((current) => markRow(current, mediaItemId, tier));
  }, []);

  /**
   * The writes behind "Rank these". Each marked game is written once per
   * visit: a retry after a partial failure writes only what did not land.
   */
  const written = useRef(new Map<string, boolean>());
  const rank = useMutation({
    mutationFn: async (items: { row: DeckCandidateRow; tier: Tier }[]) => {
      const pending = items.filter(({ row }) => !written.current.has(row.mediaItemId));
      const results = await Promise.allSettled(
        pending.map(async ({ row }) => {
          const { alreadyRanked } = await markFinished(supabase, row.mediaItemId);
          written.current.set(row.mediaItemId, alreadyRanked);
          // The played-on pre-fill is a convenience: a refusal leaves the
          // game played with no platform, which the game page can fix.
          const playedOn = playedOnFor(row.platforms, platforms);
          if (playedOn !== null) {
            await setPlayedPlatforms(supabase, row.mediaItemId, [playedOn]).catch(() => undefined);
          }
        }),
      );
      if (results.some((result) => result.status === 'rejected')) throw new Error('some writes failed');
      return items;
    },
    onSuccess: (items) => {
      for (const { row } of items) invalidateEntry(queryClient, row.mediaItemId);
      const toRank = items.filter(({ row }) => written.current.get(row.mediaItemId) !== true);
      written.current = new Map();
      setMarks(new Map());
      startSession({
        source: 'deck',
        items: toRank.map(({ row, tier }) => ({ mediaItemId: row.mediaItemId, tier, row })),
        onDone: returning ? 'back' : 'steam-or-tabs',
      });
      router.push(SESSION_HREF);
    },
  });

  const rankMarked = () => rank.mutate(markedRows(rows, marks));

  const onClose = () => {
    switch (doneForNow(marks.size, returning)) {
      case 'session':
        rankMarked();
        return;
      case 'back':
        if (router.canGoBack()) router.back();
        else router.replace('/');
        return;
      case 'tabs':
        router.replace('/');
    }
  };

  const loadingFirst = profile.data === undefined || deck.pages[0] === undefined;
  const loadingMore = !loadingFirst && deck.pending;
  const failure = profile.isError ? profile : deck.failed;
  const caption = progressLabel(count);
  const metaLine = deckMetaLine(platforms);
  const rankLabel = rankButtonLabel(marks.size);

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'], paddingTop: insets.top + theme.space[2] }]}>
      <ProgressHeader
        onClose={onClose}
        closeLabel={t('onboarding.deck.doneForNow')}
        fraction={progressFraction(count)}
        caption={t(caption.key, caption.vars)}
      />

      <View style={[styles.meta, { paddingHorizontal: theme.space[4], paddingTop: theme.space[2], gap: theme.space[3] }]}>
        <Text size={13} color="text/secondary" numberOfLines={2} layout={styles.fill}>
          {t(metaLine.key, metaLine.vars)}
        </Text>
        {returning ? <AddPlatform onPress={() => router.push({ pathname: '/onboarding/platforms', params: { edit: '1' } })} /> : null}
      </View>

      <View style={{ paddingLeft: theme.space[4] + TEXT_INDENT, paddingRight: theme.space[4], paddingTop: theme.space[3] }}>
        <TierAxis />
      </View>

      {loadingFirst && !failure ? (
        <View accessibilityLabel={t('onboarding.deck.loading')} style={{ paddingHorizontal: theme.space[4] }}>
          <GameRowSkeletons count={6} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.mediaItemId}
          style={styles.fill}
          contentContainerStyle={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[4] }}
          renderItem={({ item }) => (
            <DeckRow
              row={item}
              tier={marks.get(item.mediaItemId) ?? null}
              meta={deckRowMeta(item, platforms)}
              onMark={onMark}
            />
          )}
          ListEmptyComponent={
            failure ? null : (
              <Text size={15} color="text/secondary" align="center" layout={{ paddingVertical: theme.space[6] }}>
                {t('onboarding.deck.empty')}
              </Text>
            )
          }
          ListFooterComponent={
            <View style={[styles.centre, { paddingTop: theme.space[5], minHeight: 64 }]}>
              {failure ? (
                <ErrorLine
                  message={t('onboarding.deck.couldNotLoad')}
                  onRetry={() => void failure.refetch()}
                  style={styles.stretch}
                />
              ) : loadingMore ? (
                <ActivityIndicator color={theme.colors['text/secondary']} />
              ) : hasMorePages(deck.pages) ? (
                <TextButton
                  label={t('onboarding.deck.showMore', { count: DECK_PAGE_SIZE })}
                  weight={400}
                  color="text/secondary"
                  onPress={() => setPageCount((current) => current + 1)}
                />
              ) : null}
            </View>
          }
        />
      )}

      <BottomActions>
        {rank.isError ? (
          <ErrorLine message={t('onboarding.deck.couldNotSave')} />
        ) : null}
        <Button label={t(rankLabel.key, rankLabel.vars)} disabled={marks.size === 0 || rank.isPending} onPress={rankMarked} />
      </BottomActions>
    </View>
  );
}

const DeckRow = memo(function DeckRow({
  row,
  tier,
  meta,
  onMark,
}: {
  row: DeckCandidateRow;
  tier: TierValue;
  meta: string | null;
  onMark: (mediaItemId: string, tier: Tier) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          gap: theme.space[2],
          borderBottomColor: theme.colors['border/separator'],
        },
      ]}>
      <View style={[styles.top, { gap: theme.space[3] }]}>
        <Cover width={44} radius={6} candidates={coverCandidates(row)} accessibilityLabel={row.title} />
        <View style={[styles.fill, styles.text]}>
          <Text size={16} weight={500} numberOfLines={1}>
            {row.title}
          </Text>
          {meta ? (
            <Text size={13} color="text/secondary" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ paddingLeft: TEXT_INDENT }}>
        <TierSlider value={tier} title={row.title} onChange={(next) => onMark(row.mediaItemId, next)} />
      </View>
    </View>
  );
});

/** "Add a platform ›" at the meta line's end, for a returning user. */
function AddPlatform({ onPress }: { onPress: () => void }) {
  const t = useT();
  const label = t('onboarding.deck.addPlatform');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={14}
      style={({ pressed }) => [styles.addPlatform, pressed && styles.pressed]}>
      <Text size={13} weight={500}>
        {label}
      </Text>
      <Icon name="chevron-right" size={13} color="text/primary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center' },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center' },
  text: { minWidth: 0, gap: 2 },
  centre: { alignItems: 'center' },
  stretch: { alignSelf: 'stretch' },
  addPlatform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pressed: { opacity: 0.7 },
});
