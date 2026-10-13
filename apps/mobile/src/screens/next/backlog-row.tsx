/**
 * One Backlog row: cover, title, the two fallback-chain lines, and a trailing
 * Start button plus the drag handle. docs/design/specs/next.md, "Backlog
 * segment".
 */

import { coverCandidates, type EntryRow } from '@verso/api';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { useT } from '@/lib/i18n';
import { Icon, ListRow } from '@/ui';
import { useTheme } from '@/ui/theme';

import { backlogDetail, backlogSubtitle } from './row-text';
import { StartButton } from './start-button';

export interface BacklogRowProps {
  entry: EntryRow;
  /** Whether the drag handle shows — hidden when the order on screen is not the user's. */
  draggable: boolean;
  onStart: () => void;
}

export function BacklogRow({ entry, draggable, onStart }: BacklogRowProps) {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const detail = backlogDetail(entry);

  const handle = draggable ? (
    <Sortable.Handle>
      <Icon name="grip-vertical" size={18} color="text/secondary" />
    </Sortable.Handle>
  ) : null;

  return (
    <ListRow
      coverWidth={44}
      coverRadius={6}
      candidates={coverCandidates(entry)}
      title={entry.title}
      subtitle={backlogSubtitle(entry)}
      detail={detail === null ? null : 'text' in detail ? detail.text : t(detail.key, { date: detail.date })}
      onPress={() =>
        router.push({ pathname: '/game/[id]', params: { id: entry.mediaItemId, from: 'Next' } })
      }
      trailing={
        <View style={[styles.trailing, { gap: theme.space[3] }]}>
          <StartButton onPress={onStart} />
          {handle}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center' },
});
