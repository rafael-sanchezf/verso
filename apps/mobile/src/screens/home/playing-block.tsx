/**
 * "Playing": the hero, the small cards beside it, and what stands there when
 * you are not playing anything.
 *
 * The first block on the first screen, so it answers the question the app is
 * opened with — what am I in the middle of — before anything else is read.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import type { EntryRow } from '@verso/api';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useT } from '@/lib/i18n';
import { coverHeight, EmptyState, EmptyStateCard, ErrorLine, Skeleton, useTheme } from '@/ui';
import { BlockTitle } from './block';

import { PlayingHero, PlayingSmallCard } from './playing-card';
import { playingEmptyCard, splitPlaying, type PlayingEmptyAction } from './rules';
import type { PlayingActions } from './use-home-data';

/** 12pt of padding above and below a 96pt cover, which `coverHeight` makes 136 tall. */
const HERO_HEIGHT = coverHeight(96) + 24;
/** 8pt above and below a 36pt cover, 51 tall. */
const SMALL_CARD_HEIGHT = coverHeight(36) + 16;

export interface PlayingBlockProps {
  query: UseQueryResult<EntryRow[]>;
  /**
   * Nothing anywhere on the screen. The empty card loses its button and says
   * the longer sentence (home.md, first run B): with an empty backlog under it
   * there is nothing to pick from, so the button would be a door into another
   * empty room.
   */
  firstRun: boolean;
  /**
   * How many released games are in the backlog, from the list Home already
   * reads for Up next, or null until it has answered. With none, the empty
   * card offers only "Search a new game" (`playingEmptyCard` in rules.ts).
   */
  backlog: number | null;
  actions: PlayingActions;
  /** To the Next tab, Backlog segment. */
  onPickFromBacklog: () => void;
  /** To the Search tab in the Playing intent. */
  onSearchNew: () => void;
}

export function PlayingBlock(props: PlayingBlockProps) {
  const t = useT();
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: theme.space[4], gap: theme.space[3] }}>
      <BlockTitle>{t('browse.home.playing.title')}</BlockTitle>
      <PlayingBody {...props} />
    </View>
  );
}

function PlayingBody({
  query,
  firstRun,
  backlog,
  actions,
  onPickFromBacklog,
  onSearchNew,
}: PlayingBlockProps) {
  const t = useT();
  const theme = useTheme();

  if (query.isPending) {
    return (
      <View style={{ gap: theme.space[3] }}>
        <Skeleton height={HERO_HEIGHT} radius={theme.radius.lg} />
        <View style={[styles.row, { gap: theme.space[3] }]}>
          <Skeleton height={SMALL_CARD_HEIGHT} radius={theme.radius.md} style={styles.fill} />
          <Skeleton height={SMALL_CARD_HEIGHT} radius={theme.radius.md} style={styles.fill} />
        </View>
      </View>
    );
  }

  if (query.isError) {
    return <ErrorLine message={t('browse.home.playing.loadError')} onRetry={() => void query.refetch()} />;
  }

  const { hero, alsoPlaying } = splitPlaying(query.data);

  if (!hero) {
    const card = playingEmptyCard({ firstRun, backlog });
    const handlers: Record<PlayingEmptyAction, () => void> = {
      'pick-from-backlog': onPickFromBacklog,
      'search-new': onSearchNew,
    };
    const button = (spec: typeof card.primary) =>
      spec ? { label: t(spec.label), onPress: handlers[spec.action] } : undefined;

    return (
      <EmptyStateCard>
        <EmptyState
          icon="play"
          title={t('browse.home.playing.emptyTitle')}
          body={t(card.body)}
          action={button(card.primary)}
          secondaryAction={button(card.secondary)}
        />
      </EmptyStateCard>
    );
  }

  return (
    <View style={{ gap: theme.space[3] }}>
      <PlayingHero row={hero} actions={actions} />
      <AlsoPlaying rows={alsoPlaying} actions={actions} />
    </View>
  );
}

/**
 * The rest of what you are playing, two across.
 *
 * Two fit the width, and two is where the rule of three leaves this row given
 * the hero above it. A third means the row scrolls (home.md): fixed to the
 * width two would have had, so the cards stay the size they were and the third
 * one peeks in at the edge, which is what says "there is more" without a
 * caption saying it.
 */
function AlsoPlaying({ rows, actions }: { rows: EntryRow[]; actions: PlayingActions }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  if (rows.length === 0) return null;

  if (rows.length <= 2) {
    return (
      <View style={[styles.row, { gap: theme.space[3] }]}>
        {rows.map((row) => (
          <View key={row.mediaItemId} style={styles.fill}>
            <PlayingSmallCard row={row} actions={actions} />
          </View>
        ))}
      </View>
    );
  }

  // The width two cards share inside the block's 16pt side padding.
  const cardWidth = (width - theme.space[4] * 2 - theme.space[3]) / 2;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.space[3] }}>
      {rows.map((row) => (
        <View key={row.mediaItemId} style={{ width: cardWidth }}>
          <PlayingSmallCard row={row} actions={actions} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  fill: { flex: 1 },
});
