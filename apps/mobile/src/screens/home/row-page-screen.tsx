/**
 * A movies Home row's own page, what its "See all" opens (movies-build.md,
 * PR 7): the row's films as the Watchlist's poster grid, three across, the
 * row's reason as the title, a tap to the movie page.
 *
 * A genre or "Because you loved" row is unseen films, never on the Watchlist,
 * so this page is the only list that shows them all. It reads the rows Home
 * already loaded (`useMovieHomeRows`, one key, no new call) and finds its row
 * by kind and value (`findRow`), the index first; a row that is gone after a
 * refetch says so.
 *
 * Params: `index` (the row's place on Home), `kind`, `value` (the row's
 * variable part, or its title when nothing in it varies).
 */

import { coverCandidates, type HomeRow } from '@verso/api';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useT } from '@/lib/i18n';
import { EmptyState, ErrorLine, PosterCard, Skeleton, useTheme } from '@/ui';
import { cardWidth, gapFor } from '@/screens/watchlist/zoom';

import { findRow, rowTitleText, saidRow } from './movie-rows';
import { useMovieHomeRows } from './use-movie-home';

const KINDS: readonly HomeRow['kind'][] = ['watchlist', 'genre', 'because', 'popular'];
const COLUMNS = 3;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function RowPageScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ index?: string; kind?: string; value?: string }>();
  const kind = KINDS.find((k) => k === firstParam(params.kind)) ?? null;
  const value = firstParam(params.value) ?? '';
  const index = Number(firstParam(params.index) ?? '0');

  const rows = useMovieHomeRows();
  const row =
    kind !== null && rows.data
      ? findRow(rows.data, { index: Number.isInteger(index) ? index : 0, kind, value })
      : null;

  const width = cardWidth(Math.min(screenWidth, 640), COLUMNS);
  const gap = gapFor(COLUMNS);
  const openFilm = (id: string) => router.push({ pathname: '/movie/[id]', params: { id, from: 'Home' } });

  const header = (
    <Stack.Screen
      options={{ title: row ? rowTitleText(saidRow(row, t)) : '', headerBackTitle: t('browse.home.rowPage.back') }}
    />
  );

  if (rows.isPending) {
    return (
      <View style={[styles.fill, styles.grid, { backgroundColor: theme.colors['bg/canvas'], padding: theme.space[4], gap }]}>
        {header}
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} width={width} height={Math.round(width * 1.5)} radius={8} />
        ))}
      </View>
    );
  }

  if (!row) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
        {header}
        {rows.isError && !rows.data ? (
          <ErrorLine
            message={t('browse.home.movies.loadError')}
            onRetry={() => void rows.refetch()}
            style={{ padding: theme.space[4] }}
          />
        ) : (
          <View style={[styles.fill, styles.center]}>
            <EmptyState
              icon="film"
              title={t('browse.home.rowPage.goneTitle')}
              body={t('browse.home.rowPage.goneBody')}
              action={{ label: t('browse.home.rowPage.goneAction'), onPress: () => router.back() }}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      {header}
      <FlatList
        data={row.candidates}
        numColumns={COLUMNS}
        keyExtractor={(film) => film.mediaItemId}
        contentContainerStyle={{ padding: theme.space[4], paddingBottom: theme.space[8], gap }}
        columnWrapperStyle={{ gap }}
        renderItem={({ item }) => (
          <PosterCard
            width={width}
            candidates={coverCandidates(item)}
            title={item.title}
            onPress={() => openFilm(item.mediaItemId)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  center: { justifyContent: 'center', paddingBottom: 120 },
});
