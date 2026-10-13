/**
 * The draft ranking from the stars, with the drag that fixes it. Shown only
 * when the user has turned on "Rank from my stars" (rule 35, decision 35).
 *
 * Drawn the way the batch session's review draws its rows
 * (screens/onboarding/session/review-rows.tsx), with the Ranking tab's one
 * difference: a row can be carried across a tier line, because a film the
 * stars put in Fine may belong in Loved, and every tier has its divider even
 * when empty so there is somewhere to drop it.
 *
 * - The tier's divider is the `TierChip` and a hairline.
 * - An imported row sits on `brand/text` at 12% and carries the `≡` handle,
 *   the only place a drag starts. Until the user moves it, its score reads
 *   "≈ {score}": the stars placed it, not an answer, and it is written as
 *   placed_by 'prior'. Once dragged it shows the badge, and is written 'user'.
 * - A row already in the ranking has no fill and no handle; its order is the
 *   Ranking tab's. It moves only when an import lands around it.
 * - The year line says where an imported row came from: its stars, and the
 *   file's own title under it when the match was fuzzy, so a wrong match is
 *   caught here and not after it is ranked.
 *
 * VoiceOver cannot drag, so an imported row also offers "Move up" and "Move
 * down", which step across a tier line the way a drag does.
 */

import { starsText, type Tier } from '@verso/core';
import { StyleSheet, View } from 'react-native';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { useT } from '@/lib/i18n';
import { Cover, ScoreBadge, Text, TierChip, TIER_LABELS, joinParts, useTheme } from '@/ui';

import { scoreText } from '../log/game';
import { droppedKey, moveInList, type ReviewListItem, type ReviewRow, type RowFacts } from './model';

/** The handle's touch target, which is also the blank column on a ranked row. */
const HANDLE_SIZE = 44;
const COVER_WIDTH = 40;

export interface ReviewListProps {
  list: ReviewListItem[];
  facts: ReadonlyMap<string, RowFacts>;
  /** The imported films the user has moved: they lose the ≈. */
  moved: ReadonlySet<string>;
  /** The screen's scroll view, so a drag near the edge scrolls it. */
  scrollableRef: AnimatedRef<Animated.ScrollView>;
  /** The list as the drop left it, and the film that moved. */
  onDrop: (list: ReviewListItem[], movedKey: string | null) => void;
  /** Off while the write is in flight: a row must not move under a write. */
  sortEnabled: boolean;
}

export function ReviewList({ list, facts, moved, scrollableRef, onDrop, sortEnabled }: ReviewListProps) {
  const lastIndex = list.length - 1;

  return (
    <View collapsable={false}>
      <Sortable.Grid
        columns={1}
        data={list}
        keyExtractor={(entry) => entry.key}
        customHandle
        sortEnabled={sortEnabled}
        scrollableRef={scrollableRef}
        activeItemScale={1.03}
        inactiveItemOpacity={1}
        // Shorter than the Ranking tab's 300ms: nothing here opens on a tap,
        // so a lift is the only thing a press can mean.
        dragActivationDelay={200}
        onDragEnd={({ data, fromIndex, toIndex }) => {
          if (fromIndex === toIndex) return;
          onDrop(data, droppedKey(data, toIndex));
        }}
        renderItem={({ item: entry, index }) => {
          if (entry.kind === 'divider') {
            return (
              <Sortable.Handle mode="non-draggable">
                <TierDivider tier={entry.tier} />
              </Sortable.Handle>
            );
          }
          const row = (
            <FilmRow
              row={entry.row}
              facts={facts.get(entry.key)}
              provisional={entry.row.kind === 'imported' && !moved.has(entry.key)}
              movable={sortEnabled}
              canMoveUp={index > 1}
              canMoveDown={index < lastIndex}
              onMove={(delta) => onDrop(moveInList(list, entry.key, delta), entry.key)}
            />
          );
          return entry.row.kind === 'imported' ? row : <Sortable.Handle mode="non-draggable">{row}</Sortable.Handle>;
        }}
      />
    </View>
  );
}

/** The tier's divider: the `TierChip`, then a hairline to the edge. */
function TierDivider({ tier }: { tier: Tier }) {
  const t = useT();
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t(TIER_LABELS[tier])}
      style={[styles.divider, { gap: 10, paddingTop: theme.space[4], paddingBottom: theme.space[2] }]}>
      <TierChip tier={tier} />
      <View style={[styles.hairline, { backgroundColor: theme.colors['border/separator'] }]} />
    </View>
  );
}

/** `2021 · ★★★★½` for an imported row, `2021 · already ranked` for one that was. */
function subtitleOf(row: ReviewRow): string {
  return (
    joinParts([
      row.year === null ? null : String(row.year),
      row.kind === 'imported' && row.rating !== null ? starsText(row.rating) : 'already ranked',
    ]) ?? ''
  );
}

interface FilmRowProps {
  row: ReviewRow;
  facts: RowFacts | undefined;
  provisional: boolean;
  movable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
}

function FilmRow({ row, facts, provisional, movable, canMoveUp, canMoveDown, onMove }: FilmRowProps) {
  const theme = useTheme();
  const imported = row.kind === 'imported';
  const draggable = imported && movable;

  const scoreWords = facts
    ? provisional
      ? `placed from your stars, about ${scoreText(facts.score)}`
      : scoreText(facts.score)
    : '';
  const label =
    joinParts([`${facts?.rank ?? ''}. ${row.title}`, imported ? 'from Letterboxd' : 'already ranked', scoreWords], ', ') ?? row.title;

  const actions = draggable
    ? [
        ...(canMoveUp ? [{ name: 'moveUp', label: 'Move up' }] : []),
        ...(canMoveDown ? [{ name: 'moveDown', label: 'Move down' }] : []),
      ]
    : [];

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityActions={actions}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'moveUp') onMove(-1);
        if (event.nativeEvent.actionName === 'moveDown') onMove(1);
      }}
      style={[styles.row, { gap: theme.space[3] }]}>
      {imported ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: theme.colors['brand/text'] }]}
        />
      ) : null}

      <Text size={17} weight={700} color="text/secondary" align="right" numberOfLines={1} layout={styles.rank}>
        {facts?.rank ?? ''}
      </Text>
      <Cover width={COVER_WIDTH} radius={6} candidates={row.candidates} />
      <View style={[styles.text, { gap: 2 }]}>
        <Text size={16} weight={500} numberOfLines={1}>
          {row.title}
        </Text>
        <Text size={13} color="text/secondary" numberOfLines={1}>
          {subtitleOf(row)}
        </Text>
        {row.fileTitle === null ? null : (
          <Text size={12} color="text/secondary" numberOfLines={1}>
            {`In your file as “${row.fileTitle}”`}
          </Text>
        )}
      </View>

      {facts ? (
        provisional ? (
          <Text size={15} weight={600} color="text/secondary">
            ≈ {scoreText(facts.score)}
          </Text>
        ) : (
          <ScoreBadge score={facts.score} />
        )
      ) : null}

      {draggable ? (
        <Sortable.Handle>
          <View accessibilityLabel={`Drag ${row.title}`} style={styles.handle}>
            <Text size={16} color="text/secondary">
              ≡
            </Text>
          </View>
        </Sortable.Handle>
      ) : (
        <View style={styles.handle} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // The imported row's fill box; ranked rows share it so the columns align.
    paddingVertical: 6,
    paddingLeft: 8,
    borderRadius: 8,
  },
  fill: { opacity: 0.12, borderRadius: 8 },
  rank: { width: 28 },
  text: { flex: 1, minWidth: 0 },
  // 44 by 44, glyph centred; the row's right padding is the handle's own.
  handle: { width: HANDLE_SIZE, height: HANDLE_SIZE, alignItems: 'center', justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center' },
  hairline: { flex: 1, height: StyleSheet.hairlineWidth },
});
