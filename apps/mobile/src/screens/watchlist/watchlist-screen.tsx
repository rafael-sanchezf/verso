/**
 * The Watchlist tab: the movies' fourth tab, in place of Next (movies-brief.md,
 * "Tabs for movies"; rule 8 and 18). The large title with the medium chip,
 * the segmented control Watchlist | Calendar, then the segment.
 *
 * Which list a film sits in follows from its release state, never from a
 * choice (rule 37): what you can stream, or what is out and streams nowhere,
 * is on the Watchlist; what is in theaters, unreleased, or streaming from a
 * known day is on the Calendar, and moves to the Watchlist by itself the day
 * it streams. Both reads are the database's (`movie_watchlist`,
 * `movie_calendar`).
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MediumChip, ScreenHeader, SegmentedControl, useTheme } from '@/ui';

import { CalendarSegment } from './calendar-segment';
import { WatchlistSegment } from './watchlist-segment';

type Segment = 'watchlist' | 'calendar';

const SEGMENTS = [
  { value: 'watchlist', label: 'Watchlist' },
  { value: 'calendar', label: 'Calendar' },
] as const;

export function WatchlistScreen() {
  const theme = useTheme();
  const [segment, setSegment] = useState<Segment>('watchlist');

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <ScreenHeader title="Watchlist" right={<MediumChip />} />
      <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[3] }}>
        <SegmentedControl<Segment> segments={SEGMENTS} value={segment} onChange={setSegment} />
      </View>
      {segment === 'watchlist' ? <WatchlistSegment /> : <CalendarSegment />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
