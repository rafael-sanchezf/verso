/**
 * The Upcoming segment: the count sub row, then the rows, always by release
 * date, no drag. docs/design/specs/next.md, "Upcoming segment".
 */

import { View } from 'react-native';

import { Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import { ListEmptyState, ListErrorState, ListSkeleton } from './list-status';
import { useUpcomingQuery } from './queries';
import { gameCount } from './row-text';
import { UpcomingRow } from './upcoming-row';

export function UpcomingSegment() {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useUpcomingQuery();

  if (isPending) return <ListSkeleton />;
  if (isError) return <ListErrorState onRetry={() => void refetch()} />;

  if (data.length === 0) {
    return (
      <ListEmptyState
        icon="calendar"
        title="Nothing upcoming"
        body="Unreleased games you add land here."
      />
    );
  }

  return (
    <View>
      <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
        <Text size={13} weight={500} color="text/secondary">
          {gameCount(data.length)} · by release date
        </Text>
      </View>
      {/* The rows' 16pt gutter; `ListRow` has none of its own. */}
      <View style={{ paddingHorizontal: theme.space[4] }}>
        {data.map((entry) => (
          <UpcomingRow key={entry.entry.id} entry={entry} />
        ))}
      </View>
    </View>
  );
}
