/**
 * The Backlog segment: the count-and-sort sub row, then the rows themselves,
 * draggable through `moveBacklogEntry` when the order on screen is the
 * user's own. docs/design/specs/next.md, "Backlog segment".
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { useT } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import { BACKLOG_SORT_LABELS, sortBacklogEntries, type BacklogSort } from './backlog-sort';
import { BacklogRow } from './backlog-row';
import { ListEmptyState, ListErrorState, ListSkeleton } from './list-status';
import { gameCountKey } from './row-text';
import { useBacklogQuery, useMoveBacklogEntry, useStartPlaying } from './queries';
import { SortMenu } from './sort-menu';

export function BacklogSegment() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useBacklogQuery();
  const [sort, setSort] = useState<BacklogSort>('your-order');

  const moveEntry = useMoveBacklogEntry();
  const startPlaying = useStartPlaying();

  if (isPending) return <ListSkeleton />;
  if (isError) return <ListErrorState onRetry={() => void refetch()} />;

  if (data.length === 0) {
    return (
      <ListEmptyState
        icon="layers"
        title={t('lists.next.backlogEmptyTitle')}
        body={t('lists.next.backlogEmptyBody')}
        action={{ label: t('lists.next.searchGames'), onPress: () => router.navigate('/search') }}
      />
    );
  }

  const sorted = sortBacklogEntries(data, sort);
  // Handles hide while a sort other than "Your order" is active, because the
  // order on screen is then not the user's (next.md).
  const draggable = sort === 'your-order';

  return (
    <View style={styles.fill}>
      <View style={[styles.subRow, { paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }]}>
        <Text size={13} color="text/secondary">
          {t(gameCountKey(sorted.length), { count: sorted.length })} · {t(BACKLOG_SORT_LABELS[sort])}
        </Text>
        <SortMenu value={sort} onChange={setSort} />
      </View>

      {/*
        The rows' 16pt gutter. `ListRow` carries no horizontal padding of its
        own — it is meant to sit inside a padded column, the way Home's and
        Ranking's lists do — and this one had none, so every cover sat flush
        against the left edge of the screen while the count and the sort menu
        above it were correctly inset. specs/README.md: "Content sits inside
        16pt side padding unless a spec says otherwise."
      */}
      <View style={[styles.fill, { paddingHorizontal: theme.space[4] }]}>
      {draggable ? (
        <Sortable.Grid
          columns={1}
          data={sorted}
          customHandle
          keyExtractor={(item) => item.entry.id}
          rowGap={0}
          onDragEnd={({ fromIndex, toIndex, key, data: nextOrder }) => {
            if (fromIndex === toIndex) return;
            const movedMediaItemId = nextOrder[toIndex]?.mediaItemId ?? '';
            queryClient.setQueryData(queryKeys.backlog(), nextOrder);
            moveEntry.mutate({ entryId: key, position: toIndex, mediaItemId: movedMediaItemId });
          }}
          renderItem={({ item }) => (
            <BacklogRow entry={item} draggable onStart={() => startPlaying.mutate(item.mediaItemId)} />
          )}
        />
      ) : (
        <View>
          {sorted.map((item) => (
            <BacklogRow
              key={item.entry.id}
              entry={item}
              draggable={false}
              onStart={() => startPlaying.mutate(item.mediaItemId)}
            />
          ))}
        </View>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
