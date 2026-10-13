/**
 * Movies Home under the switcher and the ask button: the rows by reason
 * (decision 28; frame `Home · Movies H · Rows by reason` 143:173, the site's
 * `MoviesHomePhone` for the numbers; movies-build.md, PR 7).
 *
 * The rows come from `movieHomeRows` in the database's order: the watchlist,
 * up to three genres, up to three "Because you loved", seven at most, or one
 * Popular row when none of them has anything to say. A row with no films is
 * skipped. The first row is the large carousel (190 wide, four pills); the
 * rest are 104 wide with the service pill alone. Every row's title is its
 * reason, the variable part in italics (`movie-rows.ts`).
 *
 * A card opens the movie page. "See all" on the watchlist row opens the
 * Watchlist scoped to everywhere, so it lists what the row does; on every
 * other row it opens that row's own page (`app/home/row.tsx`). Pull to
 * refresh re-reads the rows; a refresh that fails keeps the rows on screen
 * and says so above them.
 *
 * The site's numbers, in points: rows 18 apart and 20 under the ask button,
 * the title 20 Bold with "See all" 15 secondary on its baseline, 16 side
 * margins, the cards 10 under the title and 10 apart, bleeding off the right.
 * The carousel's dots in the frame are left out, as the site leaves them: the
 * next poster peeking at the edge already says the row scrolls.
 */

import { coverCandidates, type HomeRow } from '@verso/api';
import { useQueryClient } from '@tanstack/react-query';
import { isLoaded } from 'expo-font';
import { useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';

import { queryKeys } from '@/lib/query-keys';
import { EmptyState, ErrorLine, PosterCard, Skeleton, Text, useTheme } from '@/ui';

import {
  CARD_WIDTH,
  cardFacts,
  cardSize,
  rowTitleParts,
  rowTitleText,
  seeAllTarget,
  type CardSize,
  type SeeAll,
} from './movie-rows';
import { useMovieHomeRows, useProviderNames } from './use-movie-home';

/** A row's key: two Loved films can share a title, so the film's id (or the index) goes in too. */
function rowKey(row: HomeRow, index: number): string {
  return `${index}:${row.kind}:${row.aboutMediaItemId ?? row.variablePart ?? row.title}`;
}

export function MoviesHome() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const rows = useMovieHomeRows();
  const providerNames = useProviderNames();

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setRefreshing(true);
    void queryClient.refetchQueries({ queryKey: queryKeys.movieHomeRows() }).finally(() => setRefreshing(false));
  }, [queryClient]);

  const openFilm = useCallback(
    (id: string) => router.push({ pathname: '/movie/[id]', params: { id, from: 'Home' } }),
    [router],
  );
  const seeAll = useCallback(
    (target: SeeAll) => {
      if (target.to === 'watchlist') {
        // `navigate` for the tab, so the tab bar and the screen agree; the
        // scope rides as a one-shot param (watchlist-screen.tsx).
        router.navigate({ pathname: '/next', params: { scope: 'everywhere' } });
        return;
      }
      const { index, kind, value } = target.ref;
      router.push({ pathname: '/home/row', params: { index: String(index), kind, value } });
    },
    [router],
  );

  let body: ReactNode;
  if (rows.data && rows.data.length > 0) {
    body = (
      <>
        {/* A failed refresh keeps what was loaded; the line says the rows may be behind. */}
        {rows.isError ? (
          <ErrorLine
            message="Couldn't refresh your recommendations."
            onRetry={refresh}
            style={{ paddingHorizontal: theme.space[4] }}
          />
        ) : null}
        {rows.data.map((row, index) => (
          <PickRow
            key={rowKey(row, index)}
            row={row}
            size={cardSize(index)}
            providerNames={providerNames}
            onOpenFilm={openFilm}
            onSeeAll={() => seeAll(seeAllTarget(row, index))}
          />
        ))}
      </>
    );
  } else if (rows.isPending) {
    body = <RowsSkeleton />;
  } else if (rows.isError) {
    body = (
      <ErrorLine
        message="Couldn't load your recommendations."
        onRetry={() => void rows.refetch()}
        style={{ paddingHorizontal: theme.space[4] }}
      />
    );
  } else {
    // Only when the catalog itself is empty: the database answers with
    // Popular whenever nothing else has anything to say.
    body = (
      <EmptyState
        icon="film"
        title="Nothing to recommend yet"
        body="Add films you want to watch and they start here."
        action={{ label: 'Search', onPress: () => router.navigate('/search') }}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: theme.space[5], paddingBottom: theme.space[6], gap: 18 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors['text/secondary']} />
      }>
      {body}
    </ScrollView>
  );
}

/** One row: its reason with "See all", then the posters, bleeding off the right. */
export function PickRow({
  row,
  size,
  providerNames,
  onOpenFilm,
  onSeeAll,
}: {
  row: HomeRow;
  size: CardSize;
  providerNames: ReadonlyMap<number, string>;
  onOpenFilm: (id: string) => void;
  onSeeAll: () => void;
}) {
  const theme = useTheme();
  const width = CARD_WIDTH[size];

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.header, { paddingHorizontal: theme.space[4], gap: theme.space[2] }]}>
        <RowTitle row={row} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`See all, ${rowTitleText(row)}`}
          hitSlop={12}
          onPress={onSeeAll}
          style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
          <Text style="subheadline" color="text/secondary">
            See all
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.space[4], gap: 10 }}>
        {row.candidates.map((film) => (
          <PosterCard
            key={film.mediaItemId}
            width={width}
            candidates={coverCandidates(film)}
            title={film.title}
            facts={cardFacts(film, size, providerNames)}
            onPress={() => onOpenFilm(film.mediaItemId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const ITALIC_FACE = 'Inter_700Bold_Italic';

/**
 * The italic is its own face, loaded under its own name (app/_layout.tsx), as
 * every weight is (theme.tsx). No `fontStyle` while the face is there: on the
 * web it is registered as a normal style, and asking for italic on top would
 * slant it twice. If the face failed to load, `fontStyle` is the fallback, so
 * the variable part keeps its emphasis in a synthesized italic.
 */
function italicStyle(): TextStyle {
  return isLoaded(ITALIC_FACE) ? { fontFamily: ITALIC_FACE } : { fontStyle: 'italic' };
}

/** The row's reason: 20 Bold, the variable part in Bold Italic. */
function RowTitle({ row }: { row: HomeRow }) {
  return (
    <Text
      style="title-3"
      weight={700}
      tracking={-0.02}
      numberOfLines={2}
      accessibilityRole="header"
      layout={styles.title}>
      {rowTitleParts(row).map((part, index) =>
        part.italic ? (
          <Text key={index} style="title-3" weight={700} tracking={-0.02} layout={italicStyle()}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

function RowsSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: 18 }}>
      {(['large', 'small'] as const).map((size) => (
        <View key={size} style={{ gap: 10, paddingHorizontal: theme.space[4] }}>
          <Skeleton height={22} width={180} />
          <View style={[styles.cards, { gap: 10 }]}>
            {Array.from({ length: size === 'large' ? 2 : 4 }, (_, index) => (
              <Skeleton
                key={index}
                width={CARD_WIDTH[size]}
                height={Math.round(CARD_WIDTH[size] * 1.5)}
                radius={size === 'large' ? 12 : 8}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { flexShrink: 1 },
  cards: { flexDirection: 'row', overflow: 'hidden' },
  pressed: { opacity: 0.7 },
});
