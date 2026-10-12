/**
 * The top of the page: the cover, what the game is, and what it scored.
 *
 * The three lines beside the cover each drop out on their own (rule 9): a game
 * the mirror has no genres for shows its year alone, one with no year and no
 * genres shows nothing on that line rather than a stray separator, and a game
 * with no `game_details` row at all shows its title and nothing else.
 */

import { coverCandidates } from '@verso/api';
import { StyleSheet, View } from 'react-native';

import { genres as formatGenres } from '@/lib/format';
import { Cover, ScoreBadge, Text, joinParts, useTheme } from '@/ui';

import type { ScoreLineItem } from './score-line';
import type { GamePage } from '@verso/api';

export function GameHeader({ page }: { page: GamePage }) {
  const meta = joinParts([
    page.year === null ? null : String(page.year),
    formatGenres(page.game?.genres),
  ]);

  return (
    <View style={[styles.row, { gap: 14 }]}>
      <Cover width={100} radius={10} candidates={coverCandidates(page)} accessibilityLabel={page.title} />

      <View style={[styles.column, { gap: 6 }]}>
        <Text size={24} weight={700}>
          {page.title}
        </Text>
        {meta ? (
          <Text size={14} color="text/secondary">
            {meta}
          </Text>
        ) : null}
        {page.game?.developer ? (
          <Text size={14} color="text/secondary">
            {page.game.developer}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The scores, each one under the name of whoever published it.
 *
 * Which figure goes in which column is decided in `score-line.ts`; this only
 * draws them. The row wraps rather than shrinking, because "Overwhelmingly
 * Positive" beside a metascore and a badge is wider than a phone at some type
 * sizes and a truncated review phrase would say something else entirely.
 */
export function ScoreLine({ items }: { items: ScoreLineItem[] }) {
  const theme = useTheme();

  if (items.length === 0) return null;

  return (
    <View style={[styles.scores, { columnGap: theme.space[4], rowGap: theme.space[2] }]}>
      {items.map((item) => (
        <View key={item.key} style={[styles.score, { gap: theme.space[1] }]}>
          {item.key === 'you' ? (
            <ScoreBadge score={item.score} size="small" />
          ) : (
            <Text size={15} weight={700}>
              {item.value}
            </Text>
          )}
          <Text size={12} color="text/secondary">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  column: { flex: 1, minWidth: 0 },
  scores: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  score: { flexDirection: 'row', alignItems: 'center' },
});
