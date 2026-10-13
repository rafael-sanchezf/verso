/**
 * Details and About.
 *
 * Details is a list of facts that exist, never a form with blanks in it: the
 * plus beside the title is where a missing personal fact is added, and a row
 * appears once it is filled (rule 20). Which rows there are is decided in
 * `details-rows.ts`.
 *
 * About is IGDB's summary, clipped to three lines. The "more" only appears when
 * there is more — the summary is measured once in an invisible copy, because a
 * "more" that expands nothing is worse than no "more" at all.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Icon, Pressed, Text, TextButton, useTheme } from '@/ui';

import type { DetailRow } from './details-rows';
import { say } from './phrase';

export function DetailsSection({
  rows,
  onAdd,
  onTimeToBeat,
  onHours,
}: {
  rows: DetailRow[];
  onAdd: () => void;
  onTimeToBeat: () => void;
  onHours: () => void;
}) {
  const t = useT();
  const theme = useTheme();
  const openFor = (row: DetailRow) => {
    if (row.action === 'time-to-beat') return onTimeToBeat;
    if (row.action === 'hours') return onHours;
    return undefined;
  };

  return (
    <View>
      <View style={[styles.titleRow, { paddingBottom: theme.space[1] }]}>
        <Text size={18} weight={700}>
          {t('browse.game.details.title')}
        </Text>
        {/*
          A plain `Pressable` rather than the `Pressed` primitive: this is the
          one control on the page with no words in it, and `Pressed` takes no
          accessibility label, so under it the plus would be an unnamed button.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('browse.game.details.addDetail')}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.plus,
            { backgroundColor: theme.colors['bg/placeholder'] },
            pressed && styles.pressed,
          ]}>
          <Icon name="plus" size={18} />
        </Pressable>
      </View>

      {rows.map((row) => (
        <Pressed
          key={row.key}
          onPress={openFor(row)}
          style={[
            row.wrap ? styles.wrapRow : styles.row,
            { paddingVertical: 10, gap: row.wrap ? 2 : theme.space[3] },
          ]}>
          <Text size={15} color="text/secondary">
            {t(row.label)}
          </Text>
          <Text
            size={15}
            weight={500}
            align={row.wrap ? 'left' : 'right'}
            layout={row.wrap ? undefined : styles.value}>
            {say(t, row.value)}
          </Text>
        </Pressed>
      ))}
    </View>
  );
}

export function AboutSection({ summary }: { summary: string }) {
  const t = useT();
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState<number | null>(null);

  return (
    <View style={{ gap: theme.space[2] }}>
      <Text size={18} weight={700}>
        {t('browse.game.about.title')}
      </Text>

      {lines === null ? (
        <Text
          size={14}
          color="text/secondary"
          layout={styles.measure}
          onTextLayout={(event) => setLines(event.nativeEvent.lines.length)}>
          {summary}
        </Text>
      ) : null}

      <Text size={14} color="text/secondary" numberOfLines={expanded ? undefined : 3}>
        {summary}
      </Text>

      {!expanded && lines !== null && lines > 3 ? (
        <TextButton label={t('browse.game.about.more')} size={14} onPress={() => setExpanded(true)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wrapRow: { flexDirection: 'column', alignItems: 'flex-start' },
  pressed: { opacity: 0.7 },
  // The value takes the room the label does not, so a long one wraps rather
  // than pushing the label off the left edge.
  value: { flex: 1 },
  // Off-layout and invisible: this copy exists only to be counted.
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
});
