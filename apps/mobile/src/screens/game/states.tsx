/**
 * What the page shows while it has nothing.
 *
 * The grey block and the error line are `@/ui`'s since Phase 3 — every screen
 * had built its own copy of the two states specs/README.md defines and the
 * frames never drew. What is this page's own, and stays here, is the
 * arrangement: a 100pt cover, three lines beside it, a score row, two buttons,
 * so the layout does not jump when the data lands.
 *
 * Every read on this page fails into `ErrorLine` rather than throwing: a game
 * whose Steam figure is unavailable still draws, and a game that is not in the
 * catalog says so instead of showing a blank screen.
 */

import { StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { coverHeight, Skeleton, useTheme } from '@/ui';

/** The page's own shape in grey, while `['game', id]` is in flight. */
export function GamePageSkeleton() {
  const t = useT();
  const theme = useTheme();

  return (
    <View style={{ padding: theme.space[4], gap: 18 }} accessibilityLabel={t('browse.game.loading')}>
      <View style={[styles.row, { gap: 14 }]}>
                <Skeleton width={100} height={coverHeight(100)} radius={10} />
        <View style={[styles.column, { gap: theme.space[2] }]}>
          <Skeleton width="80%" height={24} />
          <Skeleton width="55%" height={14} />
          <Skeleton width="40%" height={14} />
        </View>
      </View>
      <View style={[styles.row, { gap: theme.space[4] }]}>
        <Skeleton width={90} height={18} />
        <Skeleton width={110} height={18} />
      </View>
      <View style={[styles.row, { gap: 10 }]}>
        <Skeleton width="48%" height={46} radius={theme.radius.md} />
        <Skeleton width="48%" height={46} radius={theme.radius.md} />
      </View>
      <Skeleton width="100%" height={120} radius={theme.radius.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  column: { flex: 1 },
});
