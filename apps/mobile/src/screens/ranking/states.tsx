/**
 * Loading and failure, which specs/README.md defines once for every screen:
 * "skeleton blocks in `bg/placeholder` at the row's size" and "one line in
 * `text/secondary` with a Retry text button". Neither is drawn in Figma.
 *
 * The blocks and the line are `@/ui`'s since Phase 3; what is Ranking's own,
 * and stays here, is the arrangement: the ranked row's geometry — 9pt of
 * vertical padding, a 22pt rank column, a 40pt cover, a badge on the right —
 * so the list does not jump when the real rows arrive.
 */

import { StyleSheet, View } from 'react-native';

import { coverHeight, ErrorLine, Skeleton, useTheme } from '@/ui';

/** Enough rows to reach the fold on the smallest phone the app runs on. */
const SKELETON_ROWS = 8;

export function RankingSkeleton() {
  const theme = useTheme();

  return (
    <View accessibilityLabel="Loading your ranking">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} style={[styles.row, { gap: theme.space[3] }]}>
          <Skeleton width={22} height={17} />
          <Skeleton width={40} height={coverHeight(40)} radius={6} />
          <View style={[styles.lines, { gap: 6 }]}>
            <Skeleton width="65%" height={16} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={46} height={26} radius={theme.radius.pill} />
        </View>
      ))}
    </View>
  );
}

export function RankingError({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();

  return (
    <ErrorLine
      message="Couldn't load your ranking."
      align="center"
      onRetry={onRetry}
      style={{ paddingVertical: theme.space[6] }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },
  lines: { flex: 1 },
});
