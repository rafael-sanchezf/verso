/**
 * Up next: the Backlog and Upcoming segments behind one segmented control.
 * docs/design/specs/next.md, "Header and segments". Route
 * `app/(tabs)/next.tsx` accepts `?segment=upcoming` (Profile links here).
 */

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { MediumChip, ScreenHeader, SegmentedControl, type Segment } from '@/ui';
import { useTheme } from '@/ui/theme';

import { BacklogSegment } from './backlog-segment';
import { UpcomingSegment } from './upcoming-segment';

type NextSegment = 'backlog' | 'upcoming';

function segmentFromParam(value: string | undefined): NextSegment {
  return value === 'upcoming' ? 'upcoming' : 'backlog';
}

export function NextScreen() {
  const t = useT();
  const theme = useTheme();
  const segments: readonly Segment<NextSegment>[] = [
    { value: 'backlog', label: t('lists.next.backlog'), icon: 'layers' },
    { value: 'upcoming', label: t('lists.next.upcoming'), icon: 'calendar' },
  ];
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<NextSegment>(() => segmentFromParam(params.segment));

  // Profile's "Upcoming" link pushes `?segment=upcoming` onto an already
  // mounted tab; without this the param changes but the segment the user was
  // last on stays put.
  useEffect(() => {
    if (params.segment !== undefined) setSegment(segmentFromParam(params.segment));
  }, [params.segment]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors['bg/canvas'] }}>
      <ScreenHeader title={t('lists.next.title')} right={<MediumChip />} />
      <SegmentedControl
        segments={segments}
        value={segment}
        onChange={setSegment}
        style={{ marginHorizontal: theme.space[4], marginBottom: theme.space[3] }}
      />
      {segment === 'backlog' ? <BacklogSegment /> : <UpcomingSegment />}
    </SafeAreaView>
  );
}
