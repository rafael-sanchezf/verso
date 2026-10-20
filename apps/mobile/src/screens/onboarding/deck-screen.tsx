/**
 * The deck page (specs/onboarding.md, "The deck page", frame 152:202;
 * decision 27, guidelines principle 5): ten popular games on the user's
 * platforms at a time, each with a slider that says "played, and how it was"
 * in one gesture. Many at once invites "I played this, I played this"; a card
 * at a time invites "no, no, no".
 *
 * The rows are `deckCandidates` pages, each in `orderDeck` order (the three
 * most popular pinned on page one), appended below one another by "Show 10
 * more", each game once. Marks are local until "Rank": then each marked game
 * is marked played (`markFinished`), with its played-on platform filled when
 * it shares exactly one with the profile, and the session opens over the
 * (game, tier) pairs in the page's order. An untouched row is not played and
 * nothing is written for it.
 *
 * `?medium=movie` is the film deck (movies-build.md, PR 6, item 4; frame
 * 287:307 with Rafa's letters of 2026-10-14): popular films by TMDB's vote
 * count, posters at 2:3, rows "year · genre", and a seen check at the end of
 * each title line. The slider appears only once the check is on; a row at
 * rest is poster, title, meta and the check. "Rank" writes every checked
 * film as seen before Verso (`logSeen`, an undated diary row) and opens the
 * session over the ones with a tier; a film checked with no tier is logged
 * and not ranked (rule 35).
 *
 * The header counts toward ten ranked: ranked titles plus the rows marked
 * here. Its `x` is "Done for now": the same writes when anything is marked or
 * checked, else onward (new user: the end of the games path, or the
 * Letterboxd door on the movies path) or back (returning). `?from=ranking` is
 * the returning user from Ranking's door, who also gets "Add a platform" on
 * the games deck's meta line. The button reads "Rank 6", never "Rank these 6"
 * (VER-228).
 *
 * Rules are in deck-page.ts; the slider is tier-slider.tsx.
 */

import {
  coverCandidates,
  deckCandidates,
  getMyProfile,
  logSeen,
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

import { filmMeta } from '@/lib/film';
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
  filmDeckMetaLine,
  hasMorePages,
  markRow,
  markedRows,
  mergePages,
  pendingCount,
  playedOnFor,
  progressCount,
  progressFraction,
  progressLabel,
  rankButtonLabel,
  seenRows,
  showsSlider,
  toggleSeen,
} from './deck-page';
import { BottomActions, ProgressHeader } from './pieces';
import { mediumParam } from './seeds';
import { LETTERBOXD_STEP_HREF, SESSION_HREF } from './session/routes';
import { startSession } from './session/session-store';
import { TierAxis, TierSlider } from './tier-slider';
import type { TierValue } from './tier-scale';
import { useFinishPath } from './use-flow';

/** The slider column's indent: the 44pt cover and the row's 12pt gap. */
const TEXT_INDENT = 56;
/** The film row's seen check (frame 287:307): a 26 circle at the end of the title line. */
const CHECK_SIZE = 26;

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

export interface DeckPicks {
  marks: ReadonlyMap<string, Tier>;
  seen: ReadonlySet<string>;
}

const EMPTY_PICKS: DeckPicks = { marks: new Map(), seen: new Set() };

/** `initialPicks` is for `/preview-onboarding` only: the frame's marks and checks on fixtures. */
export function DeckScreen({ initialPicks = EMPTY_PICKS }: { initialPicks?: DeckPicks } = {}) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ from?: string; medium?: string }>();
  const returning = params.from === 'ranking';
  const medium = mediumParam(params.medium);
  const film = medium === 'movie';
  const finishPath = useFinishPath();

  const profile = useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });
  // The film deck ignores the platforms (deck_candidates by medium).
  const platforms = film ? null : (profile.data?.platforms ?? null);
  const stats = useProfileStats(medium);

  const [pageCount, setPageCount] = useState(1);
  const offsets = Array.from({ length: pageCount }, (_, index) => index * DECK_PAGE_SIZE);
  const deck = useQueries({
    queries: offsets.map((offset) => ({
      queryKey: queryKeys.deck(platforms, offset, DECK_PAGE_SIZE, medium),
      queryFn: () => deckCandidates(supabase, platforms, DECK_PAGE_SIZE, offset, medium),
      enabled: profile.data !== undefined,
    })),
    combine: combinePages,
  });

  const rows = mergePages(deck.pages);
  // The marks and the film checks in one state, so the check and its slider never disagree.
  const [picks, setPicks] = useState<DeckPicks>(initialPicks);
  const { marks, seen } = picks;
  const count = progressCount(stats.data?.ranked ?? 0, marks);

  const onMark = useCallback((mediaItemId: string, tier: Tier) => {
    setPicks((current) => ({ ...current, marks: markRow(current.marks, mediaItemId, tier) }));
  }, []);

  const onSeen = useCallback((mediaItemId: string) => {
    setPicks((current) => toggleSeen(current.seen, current.marks, mediaItemId));
  }, []);

  /** Where the deck goes when nothing is left to rank: the path's next screen. */
  const onward = () => {
    if (returning) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    if (film) router.replace(LETTERBOXD_STEP_HREF);
    else finishPath('game');
  };

  /**
   * The writes behind "Rank". Each title is written once per visit: a retry
   * after a partial failure writes only what did not land.
   */
  const written = useRef(new Map<string, boolean>());
  const rank = useMutation({
    mutationFn: async (args: { items: { row: DeckCandidateRow; tier: Tier }[]; seenOnly: DeckCandidateRow[] }) => {
      const all = [...args.items.map(({ row }) => row), ...args.seenOnly];
      const pending = all.filter((row) => !written.current.has(row.mediaItemId));
      const results = await Promise.allSettled(
        pending.map(async (row) => {
          if (film) {
            const { alreadyRanked } = await logSeen(supabase, row.mediaItemId);
            written.current.set(row.mediaItemId, alreadyRanked);
            return;
          }
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
      return args;
    },
    onSuccess: ({ items, seenOnly }) => {
      for (const { row } of items) invalidateEntry(queryClient, row.mediaItemId);
      for (const row of seenOnly) invalidateEntry(queryClient, row.mediaItemId);
      const toRank = items.filter(({ row }) => written.current.get(row.mediaItemId) !== true);
      written.current = new Map();
      setPicks(EMPTY_PICKS);
      if (toRank.length === 0) {
        onward();
        return;
      }
      startSession({
        source: 'deck',
        medium,
        items: toRank.map(({ row, tier }) => ({ mediaItemId: row.mediaItemId, tier, row })),
        onDone: returning ? 'back' : film ? 'letterboxd' : 'steam-or-tabs',
      });
      router.push(SESSION_HREF);
    },
  });

  const rankMarked = () => {
    const items = markedRows(rows, marks);
    const seenOnly = film ? seenRows(rows, seen).filter((row) => !marks.has(row.mediaItemId)) : [];
    rank.mutate({ items, seenOnly });
  };

  const onClose = () => {
    switch (doneForNow(film ? pendingCount(marks, seen) : marks.size, returning)) {
      case 'write':
        rankMarked();
        return;
      case 'back':
      case 'onward':
        onward();
    }
  };

  const loadingFirst = profile.data === undefined || deck.pages[0] === undefined;
  const loadingMore = !loadingFirst && deck.pending;
  const failure = profile.isError ? profile : deck.failed;
  const caption = progressLabel(count);
  const metaLine = film ? filmDeckMetaLine() : deckMetaLine(platforms);
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
        {returning && !film ? (
          <AddPlatform onPress={() => router.push({ pathname: '/onboarding/platforms', params: { edit: '1' } })} />
        ) : null}
      </View>

      <View style={{ paddingLeft: theme.space[4] + TEXT_INDENT, paddingRight: theme.space[4], paddingTop: theme.space[3] }}>
        <TierAxis trailing={film ? t('onboarding.deck.seen') : undefined} />
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
          extraData={seen}
          renderItem={({ item }) => (
            <DeckRow
              row={item}
              film={film}
              tier={marks.get(item.mediaItemId) ?? null}
              checked={seen.has(item.mediaItemId)}
              slider={showsSlider(film, seen, item.mediaItemId)}
              meta={film ? filmMeta(item.year, item.genres) : deckRowMeta(item, platforms)}
              onMark={onMark}
              onSeen={onSeen}
            />
          )}
          ListEmptyComponent={
            failure ? null : (
              <Text size={15} color="text/secondary" align="center" layout={{ paddingVertical: theme.space[6] }}>
                {t(film ? 'onboarding.deck.emptyFilms' : 'onboarding.deck.empty')}
              </Text>
            )
          }
          ListFooterComponent={
            <View style={[styles.centre, { paddingTop: theme.space[5], minHeight: 64 }]}>
              {failure ? (
                <ErrorLine
                  message={t(film ? 'onboarding.deck.couldNotLoadFilms' : 'onboarding.deck.couldNotLoad')}
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
  film,
  tier,
  checked,
  slider,
  meta,
  onMark,
  onSeen,
}: {
  row: DeckCandidateRow;
  film: boolean;
  tier: TierValue;
  checked: boolean;
  slider: boolean;
  meta: string | null;
  onMark: (mediaItemId: string, tier: Tier) => void;
  onSeen: (mediaItemId: string) => void;
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
        <Cover
          width={44}
          radius={6}
          aspect={film ? 'poster' : 'cover'}
          candidates={coverCandidates(row)}
          accessibilityLabel={row.title}
        />
        <View style={[styles.fill, styles.text]}>
          <Text size={16} weight={film ? 600 : 500} numberOfLines={1}>
            {row.title}
          </Text>
          {meta ? (
            <Text size={13} color="text/secondary" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {film ? <SeenCheck title={row.title} checked={checked} onPress={() => onSeen(row.mediaItemId)} /> : null}
      </View>
      {slider ? (
        // A film's slider arrives with its check (Rafa's letters, 2026-10-14).
        // No entering animation: the list recycles rows as it scrolls, and a
        // fade would replay on every checked row that comes back into view.
        <View style={{ paddingLeft: TEXT_INDENT }}>
          <TierSlider value={tier} title={row.title} onChange={(next) => onMark(row.mediaItemId, next)} />
        </View>
      ) : null}
    </View>
  );
});

/** The film row's seen check: a 26 circle, hollow at rest, the brand fill with a white check when on. */
function SeenCheck({ title, checked, onPress }: { title: string; checked: boolean; onPress: () => void }) {
  const t = useT();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={t('onboarding.deck.seenLabel', { title })}
      accessibilityState={{ checked }}
      onPress={onPress}
      // 26 drawn, 44 to touch.
      hitSlop={9}
      style={({ pressed }) => [
        styles.check,
        checked
          ? { backgroundColor: theme.colors['brand/primary'], borderColor: theme.colors['brand/primary'] }
          : { backgroundColor: 'transparent', borderColor: theme.colors['border/separator'] },
        pressed && styles.pressed,
      ]}>
      {checked ? <Icon name="check" size={14} color="brand/on-primary" strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

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
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlatform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pressed: { opacity: 0.7 },
});
