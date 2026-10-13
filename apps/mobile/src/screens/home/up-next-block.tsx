/**
 * "Up next": the top of the backlog, numbered, in the order the user put it in.
 *
 * Three at most and then "See all" (rule 3). The numbers are 1, 2, 3 — the
 * backlog's own order, not a rank and not a score — because "order belongs to
 * the user" (rule 11) and the number is there to say that this list has a top,
 * which is the whole point of dragging it.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { coverCandidates, type EntryRow } from '@verso/api';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Cover, coverHeight, EmptyState, EmptyStateCard, ErrorLine, Pressed, Skeleton, Text, TextButton, useTheme } from '@/ui';
import { BlockTitle } from './block';

import { upNextSubtitle } from './rules';

/** 10pt above and below a 44pt cover, which `coverHeight` makes 62 tall. */
const CARD_HEIGHT = coverHeight(44) + 20;
/** 10 + the rank + 10 + the cover + 10 + the 120pt text column + 12. */
const CARD_WIDTH = 220;

export interface UpNextBlockProps {
  query: UseQueryResult<EntryRow[]>;
  /** To the Next tab, Backlog segment. */
  onSeeAll: () => void;
  /** To the Search tab, from the empty card. */
  onSearch: () => void;
  onOpenGame: (id: string) => void;
}

export function UpNextBlock({ query, onSeeAll, onSearch, onOpenGame }: UpNextBlockProps) {
  const t = useT();
  const theme = useTheme();
  const rows = query.data ?? [];

  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={[styles.header, { paddingHorizontal: theme.space[4] }]}>
        <BlockTitle>{t('browse.home.upNext.title')}</BlockTitle>
        {/* No "See all" when there is nothing to see all of (home.md, empty
            backlog). It comes back the moment the backlog does. */}
        {rows.length > 0 ? (
          <TextButton label={t('browse.home.upNext.seeAll')} color="text/secondary" size={15} weight={400} onPress={onSeeAll} />
        ) : null}
      </View>

      <UpNextBody query={query} onSearch={onSearch} onOpenGame={onOpenGame} />
    </View>
  );
}

function UpNextBody({
  query,
  onSearch,
  onOpenGame,
}: Omit<UpNextBlockProps, 'onSeeAll'>) {
  const t = useT();
  const theme = useTheme();

  if (query.isPending) {
    return (
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.space[4], gap: theme.space[3] }}>
        <Skeleton height={CARD_HEIGHT} width={CARD_WIDTH} radius={theme.radius.md} />
        <Skeleton height={CARD_HEIGHT} width={CARD_WIDTH} radius={theme.radius.md} />
      </ScrollView>
    );
  }

  if (query.isError) {
    return (
      <View style={{ paddingHorizontal: theme.space[4] }}>
        <ErrorLine message={t('browse.home.upNext.loadError')} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  if (query.data.length === 0) {
    return (
      <View style={{ paddingHorizontal: theme.space[4] }}>
        <EmptyStateCard>
          <EmptyState
            icon="layers"
            title={t('browse.home.upNext.emptyTitle')}
            body={t('browse.home.upNext.emptyBody')}
            action={{ label: t('browse.home.upNext.emptyAction'), onPress: onSearch }}
          />
        </EmptyStateCard>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Starts at 16 with the block's own padding and runs off the right edge;
      // the trailing 16 is what the last card gets when the row is scrolled to
      // its end (README.md, "horizontal carousels start at 16").
      contentContainerStyle={{ paddingHorizontal: theme.space[4], gap: theme.space[3] }}>
      {query.data.map((row, index) => (
        <UpNextCard
          key={row.mediaItemId}
          row={row}
          rank={index + 1}
          onPress={() => onOpenGame(row.mediaItemId)}
        />
      ))}
    </ScrollView>
  );
}

function UpNextCard({ row, rank, onPress }: { row: EntryRow; rank: number; onPress: () => void }) {
  const theme = useTheme();
  const subtitle = upNextSubtitle(row);

  return (
    <Pressed
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.md,
          paddingLeft: 10,
          paddingRight: theme.space[3],
          paddingVertical: 10,
          gap: 10,
        },
      ]}>
      <Text size={20} weight={700} color="text/secondary">
        {rank}
      </Text>
      <Cover width={44} radius={6} candidates={coverCandidates(row)} accessibilityLabel={row.title} />
      <View style={[styles.text, { gap: 2 }]}>
        <Text size={15} weight={500} numberOfLines={2}>
          {row.title}
        </Text>
        {subtitle ? (
          <Text size={13} color="text/secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressed>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** Fixed rather than hugging: every card in the row is the same width, and a
      two-line title has somewhere to wrap to. */
  text: { width: 120 },
});
