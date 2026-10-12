/**
 * The ranked list: labeled tier dividers, a global rank, a score, and the drag
 * that reorders it.
 *
 * The dividers are items in the sortable rather than headers around four of
 * them, which is what makes "crossing a divider changes tier" true rather than
 * special-cased: the drop reads its tier off whichever divider ends up above
 * it. `react-native-sortables` has no per-item lock, but it does have custom
 * handles, and a handle in `non-draggable` mode is exactly a row that shifts
 * with the reorder and cannot be picked up — so every row wraps itself in a
 * draggable handle and every divider in a non-draggable one.
 *
 * Taps go through `Sortable.Touchable` rather than the row's own `Pressable`:
 * it registers the tap as a gesture alongside the item's drag instead of
 * racing it through React Native's responder system.
 *
 * `focusKey` is "Move in Ranking" arriving from a game page: scroll that row
 * into view and tint it for a moment, so the tab switch lands on the game the
 * user was looking at rather than at rank 1. The offset is measured rather
 * than counted, because the rows are not all one height (dividers are short,
 * a wrapped subtitle is tall) and because `react-native-sortables` positions
 * its items absolutely — an `onLayout` inside a cell reports 0. Measuring the
 * row against the wrapper around the grid gives the offset in the scroll
 * view's own content coordinates, which is exactly what `scrollTo` wants.
 */

import { coverCandidates } from '@verso/api';
import type { Tier } from '@verso/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type Animated from 'react-native-reanimated';
import { runOnUI, scrollTo, type AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import {
  ListRow,
  ScoreBadge,
  Text,
  TierChip,
  TIER_LABELS,
  tierColor,
  useTheme,
} from '@/ui';

import { coverSourceOf, rowSubtitle, type RankingItem, type RankingListItem } from './model';

export interface RankingListProps {
  list: RankingListItem[];
  /** Off while a filter is active: the visible order is not the whole list. */
  sortEnabled: boolean;
  /** The screen's scroll view, so a drag near the edge scrolls it. */
  scrollableRef: AnimatedRef<Animated.ScrollView>;
  onOpen: (mediaItemId: string) => void;
  /** The list as the drop left it, and the key of the row that moved. */
  onDrop: (list: RankingListItem[], key: string) => void;
  /** A row to scroll to and tint, once, when the screen asks for one. */
  focusKey?: string | null;
  /** Called after the scroll starts, so the screen can forget the request. */
  onFocused?: () => void;
}

/** Air left above the focused row, so it does not sit flush against the header. */
const FOCUS_TOP_GAP = 12;

/** How long the tint stays. Long enough to catch the eye, short enough not to look like state. */
const FOCUS_TINT_MS = 1400;

/**
 * The sortable measures its items before it can position them, so the first
 * attempt after a tab switch can land on a row that has no layout yet. Four
 * tries a beat apart covers a cold tab on a slow device; after that the row is
 * not coming and the request is dropped rather than retried forever.
 */
const FOCUS_ATTEMPTS = 4;
const FOCUS_RETRY_MS = 120;

export function RankingList({
  list,
  sortEnabled,
  scrollableRef,
  onOpen,
  onDrop,
  focusKey = null,
  onFocused,
}: RankingListProps) {
  // The wrapper the rows are measured against, and one host node per row.
  const contentRef = useRef<View | null>(null);
  const rowRefs = useRef(new Map<string, View>());
  const [tinted, setTinted] = useState<string | null>(null);

  const setRowRef = useCallback((key: string, node: View | null) => {
    if (node) rowRefs.current.set(key, node);
    else rowRefs.current.delete(key);
  }, []);

  useEffect(() => {
    if (!focusKey) return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const retry = () => {
      if (cancelled || attempts >= FOCUS_ATTEMPTS) return;
      timer = setTimeout(attempt, FOCUS_RETRY_MS);
    };

    const attempt = () => {
      if (cancelled) return;
      attempts += 1;

      const row = rowRefs.current.get(focusKey);
      const content = contentRef.current;
      if (!row || !content) {
        retry();
        return;
      }

      row.measureLayout(
        content,
        (_x, y) => {
          if (cancelled) return;
          runOnUI(scrollTo)(scrollableRef, 0, Math.max(y - FOCUS_TOP_GAP, 0), true);
          setTinted(focusKey);
          onFocused?.();
        },
        retry,
      );
    };

    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [focusKey, scrollableRef, onFocused]);

  useEffect(() => {
    if (!tinted) return;
    const timer = setTimeout(() => setTinted(null), FOCUS_TINT_MS);
    return () => clearTimeout(timer);
  }, [tinted]);

  return (
    <View ref={contentRef} collapsable={false}>
      <Sortable.Grid
        columns={1}
        data={list}
        keyExtractor={(entry) => entry.key}
        customHandle
        sortEnabled={sortEnabled}
        scrollableRef={scrollableRef}
        // A full-width row scaled by the library's default 1.1 spills off both
        // edges; this reads as a lift without the overflow.
        activeItemScale={1.03}
        // The default dims every other row to half opacity, which reads as "the
        // rest of the list is disabled" rather than "this one is in the air".
        inactiveItemOpacity={1}
        // Long enough that a deliberate tap opens the game page instead of
        // lifting the row (the library's default is 200ms).
        dragActivationDelay={300}
        onDragEnd={({ data, key, fromIndex, toIndex }) => {
          if (fromIndex === toIndex) return;
          onDrop(data, key);
        }}
        renderItem={({ item: entry }) =>
          entry.kind === 'divider' ? (
            <Sortable.Handle mode="non-draggable">
              <TierDivider tier={entry.tier} />
            </Sortable.Handle>
          ) : (
            <View ref={(node) => setRowRef(entry.key, node)} collapsable={false}>
              <Sortable.Handle>
                <Sortable.Touchable
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.item.rank}. ${entry.item.title}`}
                  onTap={() => onOpen(entry.item.mediaItemId)}>
                  <RankingRow item={entry.item} tinted={tinted === entry.key} />
                </Sortable.Touchable>
              </Sortable.Handle>
            </View>
          )
        }
      />
    </View>
  );
}

/**
 * The rule with the tier's chip in the gap.
 *
 * specs/ranking.md writes "a 2pt line flex 1, the label, a 2pt line". A second
 * line that hugged nothing would have no width at all, and ui-brief.md
 * describes the shape as "the line stops, the tier name sits in the gap, the
 * line continues" — so both lines grow and the label sits in the middle.
 *
 * The label is the `TierChip` (the tier's solid, its icon, white words) rather
 * than tier-colored text on the canvas: the deep solids of decision 29 are 3.0
 * to 3.6:1 on black, enough for a line and not for words. Drawn this way in
 * the brand color round (round 3, "a line plus a chip"), which retires the
 * upper-case short form ("LIKED") the text label used. The screen reader hears
 * the chip's words as the header.
 */
export function TierDivider({ tier }: { tier: Tier }) {
  const theme = useTheme();
  const color = theme.colors[tierColor(tier)];

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={TIER_LABELS[tier]}
      style={[styles.divider, { paddingVertical: theme.space[2], gap: 10 }]}>
      <View style={[styles.rule, { backgroundColor: color }]} />
      <TierChip tier={tier} style={styles.dividerChip} />
      <View style={[styles.rule, { backgroundColor: color }]} />
    </View>
  );
}

export function RankingRow({ item, tinted = false }: { item: RankingItem; tinted?: boolean }) {
  const theme = useTheme();

  return (
    <ListRow
      leading={
        <Text
          size={17}
          weight={700}
          color="text/secondary"
          align="right"
          numberOfLines={1}
          layout={styles.rank}>
          {item.rank}
        </Text>
      }
      coverWidth={40}
      coverRadius={6}
      candidates={coverCandidates(coverSourceOf(item.row))}
      title={item.title}
      subtitle={rowSubtitle(item)}
      trailing={<ScoreBadge score={item.score} />}
      style={[
        styles.row,
        tinted ? { backgroundColor: theme.colors['bg/surface'], ...styles.tinted } : null,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // ListRow pads 10 vertically; the frame's ranked row is 9.
  row: { paddingVertical: 9 },
  // The tint bleeds into the list's own side padding, so the row reads as one
  // block rather than as a rectangle floating inside it.
  tinted: { borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8 },
  // Right-aligned so the gap to the cover is the same at rank 9 and rank 10.
  rank: { width: 22 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rule: { height: 2, flex: 1 },
  dividerChip: { alignSelf: 'center' },
});
