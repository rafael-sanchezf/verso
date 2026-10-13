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

import { useT } from '@/lib/i18n';
import { RankingBanner } from '@/screens/onboarding/session/ranking-banner';
import { useActiveMedium } from '@/state/medium';
import { EmptyState, MediumChip, ScreenHeader, useTheme } from '@/ui';

import { RankingDoors } from './doors';
import { FilmsBanner, FilmsEmpty } from './films-banner';
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
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();

  const [view, setView] = useState<RankingView>('list');
  const [filters, setFilters] = useState<RankingFilters>(NO_FILTERS);

  // The game a push asked for, held until the list has scrolled to it.
  const [focusId, setFocusId] = useState<string | null>(null);

  // The sortable scrolls this while a row is held near an edge.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // The active medium (state/medium.ts): films read the movie ranking, with
  // the site's rows and the films banner (movies-build.md, PR 2, item 7).
  const { medium } = useActiveMedium();
  const film = medium === 'movie';
  const ranking = useRanking(medium);
  const move = useMoveRankingEntry(medium);

  // A filter chosen in one medium means nothing in the other.
  useEffect(() => setFilters(NO_FILTERS), [medium]);

  const items = useMemo(() => assembleRanking(ranking.data ?? EMPTY_TIERS), [ranking.data]);
  const visible = useMemo(() => filterItems(items, filters, medium), [items, filters, medium]);
  const list = useMemo(() => toListItems(visible), [visible]);

  // The sheets list what the whole ranking contains, not what the current filter
  // has left, or choosing one filter would empty the other's sheet.
  const genres = useMemo(() => genreOptions(items, medium), [items, medium]);
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
    if (film) router.push({ pathname: '/movie/[id]', params: { id: mediaItemId, from: 'Ranking' } });
    else router.push({ pathname: '/game/[id]', params: { id: mediaItemId, from: 'Ranking' } });
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
        title={t('lists.ranking.title')}
        right={<MediumChip />}
        paddingBottom={view === 'list' ? 10 : theme.space[3]}
      />

      {/* Films: "{n} watched films to rank ›" above the tools row, as the frame draws it. */}
      {film && hasItems ? <FilmsBanner /> : null}

      {hasItems ? (
        <ToolsRow
          medium={medium}
          filters={filters}
          onFiltersChange={setFilters}
          genres={genres}
          platforms={platforms}
          view={view}
          onViewChange={setView}
        />
      ) : null}

      {/* "{n} played games to rank": the drain, owned by the session (onboarding.md, "The doors"). */}
      {film ? null : <RankingBanner />}

      {ranking.isPending ? (
        <View style={{ paddingHorizontal: theme.space[4] }}>
          <RankingSkeleton />
        </View>
      ) : ranking.isError ? (
        <RankingError onRetry={() => void ranking.refetch()} />
      ) : !hasItems ? (
        film ? <FilmsEmpty /> : <RankingDoors />
      ) : visible.length === 0 ? (
        <NothingMatches film={film} onClear={() => setFilters(NO_FILTERS)} />
      ) : (
        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: theme.space[4],
            paddingBottom: theme.space[6],
          }}>
          {view === 'list' ? (
            <RankingList
              medium={medium}
              list={list}
              sortEnabled={!filtered}
              scrollableRef={scrollRef}
              onOpen={openGame}
              onDrop={onDrop}
              focusKey={focusKey}
              onFocused={onFocused}
            />
          ) : (
            <RankingGrid medium={medium} items={visible} onOpen={openGame} />
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
function NothingMatches({ film, onClear }: { film: boolean; onClear: () => void }) {
  const t = useT();
  return (
    <View style={styles.emptyArea}>
      <EmptyState
        icon="search"
        title={film ? t('lists.ranking.noFilmsMatch') : t('lists.ranking.noGamesMatch')}
        body={t('lists.ranking.nothingFits')}
        action={{ label: t('lists.ranking.clearFilters'), onPress: onClear }}
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
