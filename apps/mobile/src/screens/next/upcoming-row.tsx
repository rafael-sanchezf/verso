/**
 * One Upcoming row: cover, title, platforms, the release date — no drag, no
 * start button, just a tap through to the game page.
 * docs/design/specs/next.md, "Upcoming segment".
 */

import { coverCandidates, type EntryRow } from '@verso/api';
import { useRouter } from 'expo-router';

import { releaseDate } from '@/lib/format';
import { ListRow, Text } from '@/ui';

import { upcomingSubtitle } from './row-text';

export function UpcomingRow({ entry }: { entry: EntryRow }) {
  const router = useRouter();
  const dateLabel = releaseDate(entry.releaseDate);

  return (
    <ListRow
      coverWidth={44}
      coverRadius={6}
      candidates={coverCandidates(entry)}
      title={entry.title}
      subtitle={upcomingSubtitle(entry)}
      trailing={
        dateLabel ? (
          <Text size={13} color="text/secondary">
            {dateLabel}
          </Text>
        ) : null
      }
      onPress={() =>
        router.push({ pathname: '/game/[id]', params: { id: entry.mediaItemId, from: 'Next' } })
      }
    />
  );
}
