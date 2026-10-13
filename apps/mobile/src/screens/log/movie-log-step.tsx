/**
 * The log sheet for a film (frame `Log sheet` 260:11, with Rafa's letter of
 * 2026-10-12: "Where" goes, the note is "Notes" marked Optional).
 *
 * The film's log flow begins here rather than at the tier sheet (rule 35,
 * watched is not ranked): the title row with the poster, Date (the
 * platform's picker, today by default), Notes, then "Save and rank", which
 * writes the diary row and continues into the tier sheet and the comparisons
 * as for games, and "Save", which writes the row alone and leaves the film
 * watched and unranked for the Ranking banner and the page's "Rank it ›".
 * When a diary row already exists, a line above the buttons says which watch
 * this is ("2nd watch"). A rewatch of a film already ranked skips the tier
 * sheet even on "Save and rank": it is ranked.
 */

import { coverCandidates, diaryFor, logWatch, todayLocal } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { filmFactsLine } from '@/lib/film';
import { useT } from '@/lib/i18n';
import { invalidateEntry, invalidateMovieHome } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { say } from '@/screens/game/phrase';
import { watchOrdinal } from '@/screens/movie/diary-line';
import type { MovieFacts } from '@/screens/movie/reads';
import { Button, Cover, DateField, fontFamilyFor, Text, useTheme } from '@/ui';

export function MovieLogStep({
  film,
  onSaved,
}: {
  film: MovieFacts;
  /** After the write: `rank` when "Save and rank" was tapped and the film is not ranked yet. */
  onSaved: (rank: boolean) => void;
}) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const today = todayLocal();
  const [day, setDay] = useState(today);
  const [note, setNote] = useState('');

  const diary = useQuery({
    queryKey: queryKeys.diaryFor(film.mediaItemId),
    queryFn: () => diaryFor(supabase, film.mediaItemId),
  });
  const ordinal = watchOrdinal(diary.data?.length ?? 0);

  const save = useMutation({
    mutationFn: (_rank: boolean) =>
      logWatch(supabase, film.mediaItemId, { watchedOn: day, note: note.trim() === '' ? null : note.trim() }),
    onSuccess: (result, rank) => {
      invalidateEntry(queryClient, film.mediaItemId);
      invalidateMovieHome(queryClient);
      onSaved(rank && !result.alreadyRanked);
    },
    onError: () => alert(t('browse.log.movie.didNotSave'), t('browse.tryAgain')),
  });

  return (
    <View
      style={{
        paddingTop: theme.space[3],
        paddingHorizontal: theme.space[4],
        paddingBottom: insets.bottom + theme.space[2],
        gap: theme.space[4],
      }}>
      <View style={[styles.row, { gap: theme.space[3] }]}>
        <Cover width={44} radius={6} aspect="poster" candidates={coverCandidates(film)} accessibilityLabel={film.title} />
        <View style={styles.fill}>
          <Text size={17} weight={600} numberOfLines={2}>
            {film.title}
          </Text>
          {filmFactsLine(film.year, film.runtimeMinutes, null) ? (
            <Text size={13} color="text/secondary">
              {filmFactsLine(film.year, film.runtimeMinutes, null)}
            </Text>
          ) : null}
        </View>
      </View>

      <DateField label={t('browse.log.movie.date')} value={day} max={today} onChange={(next) => next !== null && setDay(next)} />

      <View
        style={[
          styles.row,
          styles.notes,
          { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.md, gap: theme.space[2] },
        ]}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('browse.log.movie.notes')}
          placeholderTextColor={theme.colors['text/secondary']}
          accessibilityLabel={t('browse.log.movie.notesLabel')}
          // One line, as the frame draws it: a note, not a review.
          maxLength={280}
          returnKeyType="done"
          style={[styles.input, { color: theme.colors['text/primary'], fontFamily: fontFamilyFor(400) }]}
        />
        <Text size={13} color="text/secondary">
          {t('browse.log.movie.optional')}
        </Text>
      </View>

      {ordinal ? (
        <Text size={13} color="text/secondary" align="center">
          {say(t, ordinal)}
        </Text>
      ) : null}

      <View style={{ gap: 10 }}>
        <Button label={t('browse.log.movie.saveAndRank')} disabled={save.isPending} onPress={() => save.mutate(true)} />
        <Button label={t('common.save')} variant="secondary" disabled={save.isPending} onPress={() => save.mutate(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  notes: { paddingHorizontal: 14, paddingVertical: 12 },
  input: { flex: 1, fontSize: 17, padding: 0 },
});
