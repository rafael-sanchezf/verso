/**
 * The collection wall: every ranked game as a tile, three to a row.
 *
 * Continuous across tiers with no dividers, because this view is the thing
 * Rafa wants to be able to screenshot (rule 15) and a wall of covers reads as
 * one collection where a divided list reads as four. The tier still shows: the
 * numbering is the same global rank as the list's.
 *
 * Deliberately not a `FlatList`. The rows are laid out by hand so the last one
 * keeps its cells at a third of the width instead of stretching them, and the
 * whole grid shares the screen's one scroll view with the list.
 */

import { coverCandidates } from '@verso/api';
import type { Medium } from '@verso/core';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Cover, Pressed, Text, useTheme } from '@/ui';

import { coverSourceOf, type RankingItem } from './model';

const COLUMNS = 3;
const GAP = 12;
const SIDE_PADDING = 16;

export interface RankingGridProps {
  /** Films are 2:3 posters. */
  medium?: Medium;
  items: readonly RankingItem[];
  onOpen: (mediaItemId: string) => void;
}

export function RankingGrid({ items, onOpen, medium = 'game' }: RankingGridProps) {
  const { width } = useWindowDimensions();

  // specs/ranking.md gives the cells flex 1; at the frame's 402pt that is a
  // 115pt cell. Computing it instead of flexing gives `Cover` the number it
  // needs to hold the cover ratio, and comes out at the same size. Nothing here
  // fixes a cell height: the tile is as tall as the art it holds (rule 29).
  const cell = Math.floor((width - SIDE_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  const rows: RankingItem[][] = [];
  for (let index = 0; index < items.length; index += COLUMNS) {
    rows.push(items.slice(index, index + COLUMNS));
  }

  return (
    <View style={{ gap: GAP }}>
      {rows.map((row) => (
        <View key={row[0]?.mediaItemId ?? 'row'} style={[styles.row, { gap: GAP }]}>
          {row.map((item) => (
            <GridCell key={item.mediaItemId} item={item} width={cell} onOpen={onOpen} medium={medium} />
          ))}
        </View>
      ))}
    </View>
  );
}

function GridCell({
  item,
  width,
  onOpen,
  medium,
}: {
  item: RankingItem;
  width: number;
  medium: Medium;
  onOpen: (mediaItemId: string) => void;
}) {
  const theme = useTheme();

  return (
    <Pressed onPress={() => onOpen(item.mediaItemId)} style={{ width, gap: 6 }}>
      <View>
        <View style={[styles.bar, { backgroundColor: theme.colors['brand/text'] }]} />
        <Cover
          width={width}
          // Square corners: the wall reads as tiles rather than as cards.
          radius={0}
          aspect={medium === 'movie' ? 'poster' : 'cover'}
          candidates={coverCandidates(coverSourceOf(item.row))}
          accessibilityLabel={item.title}
        />
      </View>

      <View style={[styles.footer, { gap: 6 }]}>
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors['text/primary'], borderRadius: 6 },
          ]}>
          <Text size={11} weight={700} color="bg/canvas">
            {item.rank}
          </Text>
        </View>
        <Text size={12} weight={500} numberOfLines={2} layout={styles.title}>
          {item.title}
        </Text>
      </View>
    </Pressed>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  bar: { height: 3 },
  footer: { flexDirection: 'row', alignItems: 'flex-start' },
  badge: { paddingHorizontal: 6, paddingVertical: 1 },
  // The frame fixes the title at 84pt inside a 115pt cell; filling what the
  // badge leaves is the same thing at 402 and survives a narrower screen.
  title: { flex: 1 },
});
