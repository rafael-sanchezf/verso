/**
 * The Calendar segment (frame `Calendar` 262:101): rows grouped NOW, then by
 * month, because dates lead (rule 37). Each row is a date column, the poster,
 * the title over what kind of date it is, and the trailing action: "Going? ›"
 * for a film in or coming to theaters, "Change" for the day you are going.
 * The words are `calendar.ts`'s; this draws them.
 */

import { coverCandidates, movieCalendar, todayLocal, type MovieCalendarRow } from '@verso/api';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Cover, EmptyState, ErrorLine, Pressed, Skeleton, Text, TextButton, useTheme } from '@/ui';

import { calendarGroups, type CalendarRowView } from './calendar';
import { GoingSheet, type GoingTarget } from './going-sheet';

export function CalendarSegment() {
  const theme = useTheme();
  const router = useRouter();
  const today = todayLocal();
  const [going, setGoing] = useState<GoingTarget | null>(null);

  const calendar = useQuery({
    queryKey: queryKeys.movieCalendar(),
    queryFn: () => movieCalendar(supabase, { today }),
  });

  const groups = useMemo(() => calendarGroups(calendar.data ?? [], today), [calendar.data, today]);

  const openFilm = (id: string) =>
    router.push({ pathname: '/movie/[id]', params: { id, from: 'Watchlist' } });

  const askGoing = (row: MovieCalendarRow) =>
    setGoing({
      mediaItemId: row.mediaItemId,
      title: row.title,
      plannedOn: row.plannedOn,
      suggested: row.kind === 'opening' ? row.onDate : null,
    });

  if (calendar.isPending) {
    return (
      <View style={{ paddingHorizontal: theme.space[4], gap: theme.space[3], paddingTop: theme.space[3] }}>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} height={66} />
        ))}
      </View>
    );
  }

  if (calendar.isError) {
    return (
      <ErrorLine
        message="Couldn't load your calendar."
        onRetry={() => void calendar.refetch()}
        style={{ paddingHorizontal: theme.space[4] }}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState
          icon="calendar"
          title="Nothing coming up"
          body="Films you want to watch that are in theaters or not out yet land here, with the day they stream."
        />
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[6] }}>
        {groups.map((group) => (
          <View key={group.title} style={{ paddingTop: theme.space[3] }}>
            <Text size={13} weight={600} color="text/secondary" accessibilityRole="header">
              {group.title}
            </Text>
            {group.rows.map((view) => (
              <CalendarRow
                key={view.row.mediaItemId}
                view={view}
                onOpen={() => openFilm(view.row.mediaItemId)}
                onGoing={() => askGoing(view.row)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <GoingSheet target={going} onDismiss={() => setGoing(null)} />
    </>
  );
}

function CalendarRow({ view, onOpen, onGoing }: { view: CalendarRowView; onOpen: () => void; onGoing: () => void }) {
  const theme = useTheme();
  const { row } = view;
  const dateColor = view.going ? 'brand/text' : view.row.kind === 'in_theaters' ? 'text/secondary' : 'text/primary';

  return (
    // The trailing action sits beside the row's press target, not inside it:
    // a button inside a button is one tap with two meanings (and invalid on web).
    <View style={[styles.row, { gap: theme.space[3] }]}>
      <Pressed onPress={onOpen} style={[styles.row, styles.main, { paddingVertical: 10, gap: theme.space[3] }]}>
        <View style={styles.date}>
          <Text size={11} weight={600} color={view.going ? 'brand/text' : 'text/secondary'}>
            {view.dateTop}
          </Text>
          <Text size={20} weight={700} color={dateColor}>
            {view.dateDay}
          </Text>
        </View>
        <Cover width={44} radius={6} aspect="poster" candidates={coverCandidates(row)} accessibilityLabel={row.title} />
        <View style={styles.text}>
          <Text size={16} weight={600} numberOfLines={1}>
            {row.title}
          </Text>
          <Text size={13} color={view.going ? 'brand/text' : 'text/secondary'} numberOfLines={1}>
            {view.meta}
          </Text>
        </View>
      </Pressed>
      {view.trailing === 'going?' ? (
        <TextButton label="Going? ›" size={13} color="brand/text" onPress={onGoing} />
      ) : view.trailing === 'change' ? (
        <TextButton label="Change" size={13} color="brand/text" onPress={onGoing} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1 },
  date: { width: 44, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 120 },
});
