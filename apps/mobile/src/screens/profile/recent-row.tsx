/**
 * One row of Profile's Recent list.
 *
 * Not `src/ui/ListRow`: profile.md asks for a single 15pt line combining the
 * title, the global rank, and the score ("Ranked {title} · #{global rank} ·
 * {score}"), and ListRow's title is fixed at 16pt medium with separate
 * subtitle/detail lines under it — a three-field shape this one string does
 * not fit. Rather than fork ListRow for a one-line row, this mirrors its
 * layout (a `Cover`, a flexible text slot, a trailing slot, 10pt vertical
 * padding, 12pt gap) at the sizes the spec actually asks for. Listed as a
 * deviation in the PR.
 */

import { coverCandidates, type RecentRanking } from '@verso/api';
import { StyleSheet } from 'react-native';

import { relativeDate } from '@/lib/format';
import { Cover, Pressed, Text, textStyles } from '@/ui';
import { useTheme } from '@/ui/theme';

export interface RecentRowProps {
  row: RecentRanking;
  /** The global rank, computed from tier sizes read off the `['ranking']` query. */
  rank: number;
  onPress: () => void;
}

export function RecentRow({ row, rank, onPress }: RecentRowProps) {
  const theme = useTheme();
  const label = `Ranked ${row.title} · #${rank} · ${row.placement.score.toFixed(1)}`;
  const when = relativeDate(row.placedAt) ?? '';

  return (
    <Pressed onPress={onPress} style={[styles.row, { paddingVertical: 10, gap: theme.space[3] }]}>
      <Cover width={32} radius={4} candidates={coverCandidates(row)} accessibilityLabel={row.title} />
      <Text size={15} numberOfLines={1} layout={textStyles.fill}>
        {label}
      </Text>
      <Text size={13} color="text/secondary" numberOfLines={1}>
        {when}
      </Text>
    </Pressed>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
