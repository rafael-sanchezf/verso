/**
 * Ranking: everything you have played, best first.
 *
 * Two views over one list. The list is the ranking proper — tier dividers,
 * global rank, score, and the drag that changes any of it. The grid is the same
 * games as a collection wall. The filters sit above both and are client-side
 * over the one list that was already read, so the rank numbers and scores never
 * change when the visible set does (specs/ranking.md, open question 2).
 *
 * The view and the filters are state, not params: specs/ranking.md says they
 * persist for the session only, and this component is the session.
 *
 * `?focus=<media item id>` is the one param, and it is a request rather than
 * state: "Move in Ranking" on a game page switches to this tab and asks for
 * that row to be scrolled to. It is read once and cleared, because the tab
 * stays mounted and a param left on the route would scroll the list again
 * every time the user came back to it.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankingBanner } from '@/screens/onboarding/session/ranking-banner';
import { EmptyState, MediumChip, ScreenHeader, useTheme } from '@/ui';

import { RankingDoors } from './doors';
import {
  assembleRanking,
  dropTarget,
  EMPTY_TIERS,
  filterItems,
  focusRowKey,
  genreOptions,
  isFiltered,
  NO_FILTERS,
  platformOptions,
  tiersFromList,
  toListItems,
  type RankingFilters,
  type RankingListItem,
} from './model';
import { RankingGrid } from './ranking-grid';
import { RankingList } from './ranking-list';
import { RankingError, RankingSkeleton } from './states';
import { ToolsRow, type RankingView } from './tools-row';
import { useMoveRankingEntry, useRanking } from './use-ranking';

export function RankingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();

  const [view, setView] = useState<RankingView>('list');
  const [filters, setFilters] = useState<RankingFilters>(NO_FILTERS);

  // The game a push asked for, held until the list has scrolled to it.
  const [focusId, setFocusId] = useState<string | null>(null);

  // The sortable scrolls this while a row is held near an edge.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const ranking = useRanking();
  const move = useMoveRankingEntry();

  const items = useMemo(() => assembleRanking(ranking.data ?? EMPTY_TIERS), [ranking.data]);
  const visible = useMemo(() => filterItems(items, filters), [items, filters]);
  const list = useMemo(() => toListItems(visible), [visible]);

  // The sheets list what the whole ranking contains, not what the current filter
  // has left, or choosing one filter would empty the other's sheet.
  const genres = useMemo(() => genreOptions(items), [items]);
  const platforms = useMemo(() => platformOptions(items), [items]);

  const filtered = isFiltered(filters);

  // Take the param, then take it off the route: `setParams` rewrites the URL
  // of the mounted tab without a navigation, so the request happens once and
  // switching back to this tab later is a plain tab switch again.
  useEffect(() => {
    if (!params.focus) return;
    setFocusId(params.focus);
    router.setParams({ focus: '' });
  }, [params.focus, router]);

  const focusKey = focusId === null || view !== 'list' ? null : focusRowKey(list, focusId);

  // Nothing to scroll to: the grid is deliberately unaffected, and a game that
  // is not in the list (a filter is on, or it is not ranked after all) has to
  // let the request go rather than leave it waiting for a row that is not
  // coming. The pending read is the exception — the list is empty because the
  // four tiers have not landed yet, and the row is still on its way.
  useEffect(() => {
    if (focusId === null) return;
    if (view !== 'list') {
      setFocusId(null);
      return;
    }
    if (!ranking.isPending && focusRowKey(list, focusId) === null) setFocusId(null);
  }, [focusId, view, list, ranking.isPending]);

  const onFocused = useCallback(() => setFocusId(null), []);

  const openGame = (mediaItemId: string) => {
    router.push({ pathname: '/game/[id]', params: { id: mediaItemId, from: 'Ranking' } });
  };

  const onDrop = (dropped: RankingListItem[], key: string) => {
    // Belt and braces: the list turns its own drag off while a filter is on,
    // because the visible order is not the whole order and a position read off
    // it would be wrong.
    if (filtered) return;

    const target = dropTarget(dropped, key);
    if (!target) return;

    move.mutate({ target, optimistic: tiersFromList(dropped) });
  };

  const hasItems = items.length > 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <ScreenHeader
        title="Ranking"
        right={<MediumChip />}
        paddingBottom={view === 'list' ? 10 : theme.space[3]}
      />

      {hasItems ? (
        <ToolsRow
          filters={filters}
          onFiltersChange={setFilters}
          genres={genres}
          platforms={platforms}
          view={view}
          onViewChange={setView}
        />
      ) : null}

      {/* "{n} played games to rank": the drain, owned by the session (onboarding.md, "The doors"). */}
      <RankingBanner />

      {ranking.isPending ? (
        <View style={{ paddingHorizontal: theme.space[4] }}>
          <RankingSkeleton />
        </View>
      ) : ranking.isError ? (
        <RankingError onRetry={() => void ranking.refetch()} />
      ) : !hasItems ? (
        <RankingDoors />
      ) : visible.length === 0 ? (
        <NothingMatches onClear={() => setFilters(NO_FILTERS)} />
      ) : (
        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: theme.space[4],
            paddingBottom: theme.space[6],
          }}>
          {view === 'list' ? (
            <RankingList
              list={list}
              sortEnabled={!filtered}
              scrollableRef={scrollRef}
              onOpen={openGame}
              onDrop={onDrop}
              focusKey={focusKey}
              onFocused={onFocused}
            />
          ) : (
            <RankingGrid items={visible} onOpen={openGame} />
          )}
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * A filter that matches nothing. Not drawn: coded from the same block as the
 * empty ranking, with the way out as its action (rule 7).
 */
function NothingMatches({ onClear }: { onClear: () => void }) {
  return (
    <View style={styles.emptyArea}>
      <EmptyState
        icon="search"
        title="No games match"
        body="Nothing you have ranked fits that filter."
        action={{ label: 'Clear filters', onPress: onClear }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  emptyArea: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 120,
  },
});
