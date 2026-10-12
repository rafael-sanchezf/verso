/**
 * What a search list looks like while it is loading.
 *
 * The grey block itself is `@/ui`'s `Skeleton` since Phase 3 — every screen had
 * built its own copy of the shape specs/README.md defines and the frames never
 * drew. What is Search's own, and stays here, is the arrangement: a `GameRow`
 * with the words taken out. The error line moved wholesale; Search imports
 * `ErrorLine` from `@/ui` now.
 */

import { StyleSheet, View } from 'react-native';

import { coverHeight, Skeleton, useTheme } from '@/ui';

/**
 * A `GameRow` with the words taken out: the 44pt cover at the cover ratio, a
 * title bar and a subtitle bar, in the row's own 10pt padding and 12pt gap.
 *
 * The bars are deliberately unequal and unequal per row, because a column of
 * identical grey bars reads as a broken image rather than as loading.
 */
export function GameRowSkeleton({ width = '55%' }: { width?: `${number}%` }) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { paddingVertical: 10, gap: theme.space[3] }]}>
      <Skeleton width={44} height={coverHeight(44)} radius={6} />
      <View style={[styles.lines, { gap: 6 }]}>
        <Skeleton width={width} height={13} radius={4} />
        <Skeleton width="32%" height={11} radius={4} />
      </View>
    </View>
  );
}

/** A few of them. The widths repeat after four, which no list is long enough to show. */
export function GameRowSkeletons({ count }: { count: number }) {
  const widths = ['62%', '48%', '70%', '54%'] as const;

  return (
    <View>
      {Array.from({ length: count }, (_, index) => (
        <GameRowSkeleton key={index} width={widths[index % widths.length]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lines: {
    flex: 1,
  },
});
