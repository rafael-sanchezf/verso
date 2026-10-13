/**
 * Activity (frame `Profile · Activity` 275:136; profile-brief, Rafa's letters:
 * "when you click on recent, it expands to show you a calendar"), pushed from
 * Recent's "See all ›".
 *
 * The month in the header with its chevrons, the week row from Sunday, the
 * grid with one poster per day something was ranked, watched or finished and
 * a "+N" badge for the rest of that day (round two), then the month's list,
 * newest first, from `activityMonth`. The medium switcher filters it when
 * more than one medium is tracked, starting on whatever Profile showed.
 */

import { coverCandidates, type ActivityMonthEvent } from '@verso/api';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isLiveMedium, trackedMedia } from '@/state/medium';
import { Cover, EmptyState, EmptyStateCard, ErrorLine, Icon, Skeleton, Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import { useActivityMonth, useMediumStats, useProfileIdentity } from './data';
import {
  dayLabel,
  mediumOf,
  monthGrid,
  monthName,
  monthTitle,
  profileView,
  shownMedia,
  shiftMonth,
  switcherOptions,
  WEEKDAY_LETTERS,
  type MonthCell,
  type ProfileView,
} from './model';
import { ActivityRow, ProfileSwitcher } from './pieces';

const CELL_HEIGHT = 60;
const POSTER_WIDTH = 28;

export function ActivityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ medium?: string }>();
  const identity = useProfileIdentity();
  const media = identity.data?.media;
  // The same media Profile shows: tracked and holding an entry.
  const counts = useMediumStats(trackedMedia(media));
  const visible = identity.data ? (shownMedia(media, counts.stats) ?? []) : [];

  const [picked, setPicked] = useState<ProfileView>(isLiveMedium(params.medium) ? params.medium : 'all');
  const view = profileView(picked, visible);
  const options = switcherOptions(visible);

  const today = new Date();
  const [shown, setShown] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const atThisMonth = shown.year === today.getFullYear() && shown.month === today.getMonth() + 1;
  const isToday = (day: number) => atThisMonth && day === today.getDate();

  const month = useActivityMonth(shown.year, shown.month, mediumOf(view));
  const weeks = monthGrid(shown.year, shown.month, month.data ?? []);

  const openItem = (event: ActivityMonthEvent) => {
    if (event.medium === 'movie') {
      router.push({ pathname: '/movie/[id]', params: { id: event.mediaItemId, from: 'Activity' } });
    } else {
      router.push({ pathname: '/game/[id]', params: { id: event.mediaItemId, from: 'Activity' } });
    }
  };

  const move = (by: number) => setShown((current) => shiftMonth(current.year, current.month, by));

  const header = (
    <Stack.Screen
      options={{
        title: monthTitle(shown.year, shown.month),
        headerBackTitle: 'Profile',
        headerTitle: () => (
          <View style={[styles.row, { gap: 14 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={12} onPress={() => move(-1)}>
              <Icon name="chevron-left" size={20} color="text/secondary" />
            </Pressable>
            <Text size={17} weight={600}>
              {monthTitle(shown.year, shown.month)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              accessibilityState={{ disabled: atThisMonth }}
              disabled={atThisMonth}
              hitSlop={12}
              onPress={() => move(1)}
              style={atThisMonth ? styles.disabled : undefined}>
              <Icon name="chevron-right" size={20} color="text/secondary" />
            </Pressable>
          </View>
        ),
      }}
    />
  );

  return (
    <SafeAreaView style={styles.fill} edges={['bottom']}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space[10] }}>
        {options.length > 0 ? (
          <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[3] }}>
            <ProfileSwitcher options={options} value={view} onChange={setPicked} />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: theme.space[2], paddingTop: theme.space[3] }}>
          <View style={styles.row}>
            {WEEKDAY_LETTERS.map((letter, index) => (
              <Text key={index} size={12} color="text/secondary" align="center" layout={styles.column}>
                {letter}
              </Text>
            ))}
          </View>
          {weeks.map((week, index) => (
            <View key={index} style={[styles.row, { marginTop: 6 }]}>
              {week.map((cell, column) => (
                <DayCell
                  key={column}
                  cell={cell}
                  today={cell !== null && isToday(cell.day)}
                  onPress={cell?.first ? () => openItem(cell.first!) : undefined}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: theme.space[4], paddingTop: 24, gap: 4 }}>
          <Text size={20} weight={600}>
            {monthName(shown.month)}
          </Text>
          {month.isError ? (
            <ErrorLine message="Something went wrong." onRetry={() => void month.refetch()} />
          ) : !month.data ? (
            <View style={{ gap: 12, paddingTop: 8 }}>
              <Skeleton width="100%" height={48} radius={8} />
              <Skeleton width="100%" height={48} radius={8} />
            </View>
          ) : month.data.length > 0 ? (
            month.data.map((event, index) => (
              <ActivityRow
                key={`${event.kind}:${event.mediaItemId}:${event.onDate}:${index}`}
                event={event}
                trailing={dayLabel(event.onDate, today)}
                onPress={() => openItem(event)}
              />
            ))
          ) : (
            <View style={{ paddingTop: 8 }}>
              <EmptyStateCard>
                <EmptyState icon="calendar" title="Nothing this month" body="What you rank, watch and finish lands on its day." />
              </EmptyStateCard>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DayCell({
  cell,
  today,
  onPress,
}: {
  cell: MonthCell<ActivityMonthEvent> | null;
  today: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  if (!cell) return <View style={[styles.column, { height: CELL_HEIGHT }]} />;

  const label = cell.first
    ? `${monthDayWord(cell.day)}: ${cell.first.title}${cell.more > 0 ? ` and ${cell.more} more` : ''}`
    : undefined;

  return (
    <Pressable
      accessibilityRole={cell.first ? 'button' : undefined}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.column, { height: CELL_HEIGHT, paddingHorizontal: 4, gap: 2 }]}>
      <Text size={13} weight={today ? 700 : 400} color={today ? 'brand/text' : 'text/primary'}>
        {String(cell.day)}
      </Text>
      {cell.first ? (
        <View style={{ width: POSTER_WIDTH }}>
          <Cover width={POSTER_WIDTH} radius={3} aspect="poster" candidates={coverCandidates(cell.first)} />
          {cell.more > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors['bg/canvas'], borderColor: theme.colors['border/separator'] },
              ]}>
              <Text size={10} weight={600}>
                {`+${cell.more}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function monthDayWord(day: number): string {
  return `Day ${day}`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  column: { flex: 1 },
  disabled: { opacity: 0.3 },
  // The frame's 20 circle, overlapping the poster's bottom-right corner by 6.
  badge: {
    position: 'absolute',
    right: -14,
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
