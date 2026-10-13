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
 *
 * One-shot params (movies-build.md, PR 7): `scope=everywhere` (the watchlist
 * row's "See all" on movies Home, so the list matches the row, which is the
 * whole watchlist) and `genre` (filter by one genre). They apply to one visit:
 * read once, cleared from the route at once (the tab bar re-navigates with
 * the route's params, so a kept param would apply again on every tab tap),
 * and undone when another tab is selected, so the next visit opens as the
 * person left it before. A movie page pushed from the grid is the same visit.
 * The route (`next.tsx`) clears them when the medium is games.
 */

import { useLocalSearchParams, useNavigation, useRoute, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { MediumChip, ScreenHeader, SegmentedControl, useTheme } from '@/ui';

import { isSelectedTab } from '@/screens/search/intent';

import { CalendarSegment } from './calendar-segment';
import { WatchlistSegment, type WatchlistVisit } from './watchlist-segment';

type Segment = 'watchlist' | 'calendar';

export function WatchlistScreen() {
  const t = useT();
  const theme = useTheme();
  const segments = [
    { value: 'watchlist' as const, label: t('lists.watchlist.watchlist') },
    { value: 'calendar' as const, label: t('lists.watchlist.calendar') },
  ];
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('watchlist');

  const navigation = useNavigation();
  const route = useRoute();
  const params = useLocalSearchParams<{ genre?: string | string[]; scope?: string | string[] }>();
  const genreParam = Array.isArray(params.genre) ? params.genre[0] : params.genre;
  const scopeParam = Array.isArray(params.scope) ? params.scope[0] : params.scope;

  // What this visit asked for, held until the segment has applied it; `end`
  // undoes the last one when the visit is over.
  const [visit, setVisit] = useState<WatchlistVisit | null>(null);
  useEffect(() => {
    if (!genreParam && !scopeParam) return;
    setSegment('watchlist');
    setVisit({ kind: 'start', genre: genreParam ?? null, everywhere: scopeParam === 'everywhere' });
    router.setParams({ genre: undefined, scope: undefined });
  }, [genreParam, scopeParam, router]);

  useEffect(
    () =>
      navigation.addListener('state', (event) => {
        if (isSelectedTab(event.data.state, route.key)) return;
        setVisit({ kind: 'end' });
      }),
    [navigation, route.key],
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <ScreenHeader title={t('lists.watchlist.title')} right={<MediumChip />} />
      <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[3] }}>
        <SegmentedControl<Segment> segments={segments} value={segment} onChange={setSegment} />
      </View>
      {segment === 'watchlist' ? (
        <WatchlistSegment visit={visit} onVisitApplied={() => setVisit(null)} />
      ) : (
        <CalendarSegment />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
