/**
 * The Watchlist segment (frames `Watchlist` 261:119, `Watchlist · Zoomed`
 * 274:79, `Watchlist · Zoomed out` 280:106; Rafa's letters on the site round
 * and round three).
 *
 * - The sub row: "12 films · On your services ⌄" at the left, a tap toggles
 *   the scope to "Everywhere" and back; on by default when the profile has
 *   services, "Everywhere" otherwise. At the right, "Filters" with the count.
 * - The set filters as removable chips under it.
 * - The grid: posters alone (`PosterCard`, no pills: where a film streams is
 *   the movie page's fact), three across; a pinch makes them two large or five
 *   small (`zoom.ts`), and the count is kept per user. A tap opens the film's
 *   page; a long press opens the log sheet (question 16's default).
 *
 * Length, genre and services go to `movie_watchlist`; director, decade and
 * the sort run on the rows it returns (`filters.ts`). A second, unfiltered
 * read is what the filter sheet draws its genres, directors and count from,
 * and what tells an empty watchlist from filters that leave nothing.
 */

import { coverCandidates, movieWatchlist, todayLocal, type MovieWatchlistRow } from '@verso/api';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/state/medium';
import { EmptyState, ErrorLine, Icon, PosterCard, Skeleton, Text, useTheme } from '@/ui';

import { FilterSheet } from './filter-sheet';
import {
  activeCount,
  filmCount,
  filtersReducer,
  matchesClient,
  NO_FILTERS,
  setChips,
  sortRows,
  type FilterChipKey,
  type WatchlistFilters,
} from './filters';
import { useColumns } from './use-columns';
import { cardWidth, columnsAfterPinch, gapFor } from './zoom';

export function WatchlistSegment() {
  const theme = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const profile = useMyProfile();
  const hasServices = (profile.data?.watchProviderIds.length ?? 0) > 0;

  const [scope, setScope] = useState<boolean | null>(null);
  const onMyServices = scope ?? hasServices;
  const [filters, setFilters] = useState<WatchlistFilters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [columns, setColumns] = useColumns();

  const today = todayLocal();
  const rpcFilters = { onMyServices, maxMinutes: filters.maxMinutes, genres: filters.genres };

  const all = useQuery({
    queryKey: queryKeys.movieWatchlistAll(),
    queryFn: () => movieWatchlist(supabase, { today }),
  });
  const filtered = useQuery({
    queryKey: queryKeys.movieWatchlist(rpcFilters),
    queryFn: () =>
      movieWatchlist(supabase, {
        today,
        onMyServices,
        ...(filters.maxMinutes === null ? {} : { maxMinutes: filters.maxMinutes }),
        ...(filters.genres.length === 0 ? {} : { genres: filters.genres }),
      }),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(
    () => sortRows((filtered.data ?? []).filter((row) => matchesClient(row, filters)), filters.sort),
    [filtered.data, filters],
  );
  const chips = setChips(filters);
  const count = activeCount(filters);
  const width = cardWidth(Math.min(screenWidth, 640), columns);
  const gap = gapFor(columns);

  // One gesture object per column count, so the detector is not handed a new
  // handler on every render.
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onEnd((event) => {
          const next = columnsAfterPinch(columns, event.scale);
          if (next !== columns) setColumns(next);
        }),
    [columns, setColumns],
  );

  const openFilm = (id: string) => router.push({ pathname: '/movie/[id]', params: { id, from: 'Watchlist' } });
  const logFilm = (id: string) => router.push({ pathname: '/log/[id]', params: { id } });

  const removeChip = (chip: FilterChipKey) => setFilters(filtersReducer(filters, { type: 'remove', chip }));

  if (all.isPending) return <GridSkeleton />;
  if (all.isError) {
    return (
      <ErrorLine
        message="Couldn't load your watchlist."
        onRetry={() => void all.refetch()}
        style={{ paddingHorizontal: theme.space[4] }}
      />
    );
  }

  if (all.data.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState
          icon="layers"
          title="Add films you want to watch"
          body="Find one in Search and tap Want to watch."
          action={{ label: 'Search', onPress: () => router.navigate('/search') }}
        />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={[styles.subRow, { paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onMyServices ? 'On your services. Show everywhere' : 'Everywhere. Show on your services'}
          hitSlop={10}
          onPress={() => setScope(!onMyServices)}
          style={styles.scope}>
          <Text size={13} color="text/secondary">
            {filmCount(filtered.data ? rows.length : all.data.length)} ·{' '}
          </Text>
          <Text size={13} color="brand/text">
            {onMyServices ? 'On your services' : 'Everywhere'}
          </Text>
          <Icon name="chevron-down" size={13} color="brand/text" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Filters, ${count} set` : 'Filters'}
          hitSlop={6}
          onPress={() => setSheetOpen(true)}
          style={[
            styles.filters,
            { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.pill, gap: 6 },
          ]}>
          <Icon name="sliders-horizontal" size={14} />
          <Text size={14} weight={500}>
            Filters
          </Text>
          {count > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.colors['brand/primary'] }]}>
              <Text size={11} weight={600} color="brand/on-primary">
                {count}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {chips.length > 0 ? (
        <View style={[styles.chips, { paddingHorizontal: theme.space[4], paddingBottom: theme.space[3], gap: theme.space[2] }]}>
          {chips.map((chip) => (
            <Pressable
              key={chip.label}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${chip.label}`}
              onPress={() => removeChip(chip.key)}
              style={[styles.chip, { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.pill }]}>
              <Text size={14} weight={500}>
                {chip.label}
              </Text>
              <Icon name="x" size={13} color="text/secondary" />
            </Pressable>
          ))}
        </View>
      ) : null}

      {onMyServices && !hasServices && profile.isSuccess ? (
        <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[3] }}>
          <Text size={15} color="text/secondary">
            Pick your services in Settings to see what's on them. Until then, tap the scope for everywhere.
          </Text>
        </View>
      ) : null}

      {filtered.isError ? (
        <ErrorLine
          message="Couldn't filter your watchlist."
          onRetry={() => void filtered.refetch()}
          style={{ paddingHorizontal: theme.space[4] }}
        />
      ) : rows.length === 0 && filtered.data ? (
        <View style={styles.empty}>
          <EmptyState
            icon="search"
            title="No films match"
            body={
              onMyServices
                ? 'Nothing on your services fits. Try everywhere, or fewer filters.'
                : 'Nothing on your watchlist fits those filters.'
            }
            action={{
              label: 'Clear filters',
              onPress: () => {
                setFilters({ ...NO_FILTERS, sort: filters.sort });
                // With no services saved, "On your services" can only ever be
                // empty: clearing goes to Everywhere so the grid can fill.
                if (!hasServices) setScope(false);
              },
            }}
          />
        </View>
      ) : (
        <GestureDetector gesture={pinch}>
          {/* A view that outlives the list: the list remounts when the column count changes. */}
          <View style={styles.fill} collapsable={false}>
            <FlatList<MovieWatchlistRow>
              key={columns}
              data={rows}
              numColumns={columns}
              keyExtractor={(row) => row.mediaItemId}
              contentContainerStyle={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[6], gap }}
              columnWrapperStyle={{ gap }}
              renderItem={({ item }) => (
                <PosterCard
                  width={width}
                  radius={columns === 5 ? 6 : columns === 2 ? 12 : 8}
                  candidates={coverCandidates(item)}
                  title={item.title}
                  onPress={() => openFilm(item.mediaItemId)}
                  onLongPress={() => logFilm(item.mediaItemId)}
                />
              )}
            />
          </View>
        </GestureDetector>
      )}

      <FilterSheet
        visible={sheetOpen}
        applied={filters}
        rows={all.data}
        onMyServices={onMyServices}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
        onDismiss={() => setSheetOpen(false)}
      />
    </View>
  );
}

function GridSkeleton() {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const width = cardWidth(Math.min(screenWidth, 640), 3);
  return (
    <View style={[styles.chips, { paddingHorizontal: theme.space[4], gap: 10, paddingTop: theme.space[3] }]}>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} width={width} height={Math.round(width * 1.5)} radius={8} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  filters: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  badge: { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 120 },
});
