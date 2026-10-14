/**
 * What "Change" and "Watched 2× · last Sep 2 ›" open on the movie page: the
 * film's diary rows, newest first, each with its day (the platform's date
 * picker, `editWatch` on change) and a Remove (`removeWatch`, confirmed), and
 * "Log another watch" under them, which opens the log sheet for a rewatch.
 *
 * Not drawn: the brief names the line's two taps and leaves what they open to
 * convention (rule 7), so this is the app's in-screen sheet with the details
 * sheet's date rows.
 */

import { editWatch, removeWatch, type DiaryRow } from '@verso/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { alert, showDialog } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { invalidateEntry } from '@/lib/invalidate';
import { supabase } from '@/lib/supabase';
import { Button, DateField, Sheet, Text, TextButton, useTheme } from '@/ui';
import { dateOnly } from '@/ui/date-field-value';

export function DiarySheet({
  visible,
  mediaItemId,
  title,
  rows,
  onLogAnother,
  onDismiss,
}: {
  visible: boolean;
  mediaItemId: string;
  title: string;
  rows: readonly DiaryRow[];
  onLogAnother: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const today = dateOnly(new Date());

  const edit = useMutation({
    mutationFn: ({ id, watchedOn }: { id: string; watchedOn: string }) => editWatch(supabase, id, { watchedOn }),
    onSuccess: () => invalidateEntry(queryClient, mediaItemId, 'movie'),
    onError: () => alert(t('browse.movie.diary.couldNotChangeDay'), t('browse.tryAgain')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeWatch(supabase, id),
    onSuccess: () => invalidateEntry(queryClient, mediaItemId, 'movie'),
    onError: () => alert(t('browse.movie.diary.couldNotRemove'), t('browse.tryAgain')),
  });

  const confirmRemove = (row: DiaryRow) =>
    showDialog({
      title: t('browse.movie.diary.removeTitle'),
      message: t('browse.movie.diary.removeMessage'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('browse.movie.diary.remove'), style: 'destructive', onPress: () => remove.mutate(row.id) },
      ],
    });

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <View style={{ gap: theme.space[3], paddingTop: theme.space[3] }}>
        <View style={{ gap: 2 }}>
          <Text size={20} weight={600}>
            {t('browse.movie.diary.title')}
          </Text>
          <Text size={15} color="text/secondary" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {rows.map((row, index) => (
          <View key={row.id} style={{ gap: 2 }}>
            <DateField
              label={
                rows.length === 1
                  ? t('browse.movie.diary.watched')
                  : t('browse.movie.diary.watchNumber', { count: rows.length - index })
              }
              value={row.watchedOn}
              max={today}
              onChange={(next) => next !== null && next !== row.watchedOn && edit.mutate({ id: row.id, watchedOn: next })}
            />
            {row.note ? (
              <Text size={14} color="text/secondary" numberOfLines={2}>
                {row.note}
              </Text>
            ) : null}
            <TextButton label={t('browse.movie.diary.remove')} size={14} color="text/destructive" onPress={() => confirmRemove(row)} />
          </View>
        ))}
        <Button label={t('browse.movie.diary.logAnother')} variant="secondary" onPress={onLogAnother} />
      </View>
    </Sheet>
  );
}
