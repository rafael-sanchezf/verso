/**
 * "Coming up": the games in your backlog that are not out yet, soonest first.
 *
 * The block hides itself when there is nothing upcoming (rule 20, hide what is
 * empty). There is no empty card for it and no "see all": an empty Coming up is
 * not a gap in your setup, it is just a fact about the release calendar, and a
 * card saying so would be a third empty box on a first run.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { coverCandidates, type EntryRow } from '@verso/api';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { coverHeight, ErrorLine, ListRow, Skeleton, Text, useTheme } from '@/ui';
import { BlockTitle } from './block';

import { comingUpDate, comingUpSubtitle } from './rules';

/** 6pt above and below a 40pt cover, which `coverHeight` makes 57 tall. */
const ROW_HEIGHT = coverHeight(40) + 12;

export interface ComingUpBlockProps {
  query: UseQueryResult<EntryRow[]>;
  onOpenGame: (id: string) => void;
}

export function ComingUpBlock({ query, onOpenGame }: ComingUpBlockProps) {
  const t = useT();
  const theme = useTheme();

  // Nothing on the way, nothing to draw — not even the title.
  if (query.isSuccess && query.data.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: theme.space[4], gap: 6 }}>
      <BlockTitle>{t('browse.home.comingUp.title')}</BlockTitle>

      {query.isPending ? (
        <View style={{ gap: 6 }}>
          <Skeleton height={ROW_HEIGHT} radius={theme.radius.md} />
          <Skeleton height={ROW_HEIGHT} radius={theme.radius.md} />
        </View>
      ) : null}

      {query.isError ? (
        <ErrorLine message={t('browse.home.comingUp.loadError')} onRetry={() => void query.refetch()} />
      ) : null}

      {query.data?.map((row) => (
        <ComingUpRow key={row.mediaItemId} row={row} onPress={() => onOpenGame(row.mediaItemId)} />
      ))}
    </View>
  );
}

function ComingUpRow({ row, onPress }: { row: EntryRow; onPress: () => void }) {
  return (
    <ListRow
      leading={<ReleaseDate value={row.releaseDate} />}
      coverWidth={40}
      coverRadius={6}
      candidates={coverCandidates(row)}
      title={row.title}
      subtitle={comingUpSubtitle(row)}
      onPress={onPress}
      // The shared row pads 10 above and below; this one pads 6, so three dated
      // rows sit as a calendar rather than as a list.
      style={styles.row}
    />
  );
}

/**
 * The date column's width, the same on every row whatever it prints.
 *
 * The column used to size itself to its text, so "2027" pushed its cover a few
 * points right of the "19" above it (phone-feedback entry 13). Fixed, every
 * cover in the block starts at the same x. 44 holds the widest second line,
 * a year at `subheadline` bold (about 36 points), with a few points to spare
 * each side; a day at 20 bold is about 24.
 */
const DATE_COLUMN_WIDTH = 44;

/**
 * The month over the day, in the left column; the month over a smaller year
 * when the date is next year.
 *
 * `comingUpDate` decides how much of the date is worth printing; a game the
 * catalog only knows the year of shows the year and no month rather than a
 * made-up day (see rules.ts). The day and the year share one slot as tall as
 * the day's line, so the column is the same height whichever it holds, and
 * both lines shrink to fit rather than widen the column at large text sizes.
 */
function ReleaseDate({ value }: { value: string | null }) {
  const t = useT();
  const theme = useTheme();
  const date = comingUpDate(value);

  return (
    <View style={styles.date}>
      {date?.month ? (
        <Text
          style="caption"
          size={11}
          weight={600}
          color="text/secondary"
          numberOfLines={1}
          adjustsFontSizeToFit>
          {t(date.month).toUpperCase()}
        </Text>
      ) : null}
      {date ? (
        <View style={[styles.second, { height: theme.font['title-3'].lineHeight }]}>
          {date.day ? (
            <Text style="title-3" weight={700} numberOfLines={1} adjustsFontSizeToFit>
              {date.day}
            </Text>
          ) : (
            <Text style="subheadline" weight={700} numberOfLines={1} adjustsFontSizeToFit>
              {date.year}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6 },
  date: { width: DATE_COLUMN_WIDTH, alignItems: 'center' },
  second: { justifyContent: 'center' },
});
