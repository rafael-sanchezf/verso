/**
 * Loading, error and empty, shared by both segments.
 *
 * Loading and error follow README's shared rules ("skeleton blocks in
 * `bg/placeholder` at the row's size"; "one line in `text/secondary` with a
 * 'Retry' text button" — neither is drawn), and since Phase 3 the block and the
 * line come from `@/ui` rather than being drawn again here. What stays is the
 * arrangement: a column of rows at the Next row's own height. Empty follows
 * `EmptyState`'s own doc comment: "bare and centred in the list area with 120pt
 * below it when it stands in for a whole list" (Search, Ranking, Next).
 */

import { StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { coverHeight, EmptyState, ErrorLine, Skeleton, type EmptyStateProps } from '@/ui';
import { useTheme } from '@/ui/theme';

/** A backlog or upcoming row is a 44pt cover (62 tall) plus 10pt padding above and below. */
const ROW_HEIGHT = coverHeight(44) + 20;

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: theme.space[4], gap: theme.space[3] }}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={ROW_HEIGHT} radius={theme.radius.md} />
      ))}
    </View>
  );
}

export function ListErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  const theme = useTheme();

  return (
    <ErrorLine
      message={t('lists.next.couldNotLoad')}
      align="center"
      onRetry={onRetry}
      style={{ paddingVertical: theme.space[8] }}
    />
  );
}

export function ListEmptyState(props: EmptyStateProps) {
  return (
    <View style={styles.emptyWrap}>
      <EmptyState {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 },
});
