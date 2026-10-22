/**
 * The two buttons and the sentence under them.
 *
 * The primary button is the core loop, one tap from any game (rule 10). It
 * becomes the score once the game is ranked and stops being a button, because
 * there is nothing left to rank — the way back in is "Move in Ranking" beside
 * it.
 *
 * "Change" opens a native action sheet with the four statuses and the
 * destructive removal (Backlog alone, and the removal, for a game that is not
 * out yet). Neither the sheet nor this line is in the frame; both are rule 7,
 * conventions first.
 */

import { StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Button, Text, TextButton, useTheme } from '@/ui';

import { say, sayJoined } from './phrase';
import type { PrimaryAction, SecondaryAction, StatusLine } from './status';

export function ActionsRow({
  primary,
  secondary,
  busy,
  onPrimary,
  onSecondary,
}: {
  primary: PrimaryAction | null;
  secondary: SecondaryAction | null;
  busy: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const t = useT();
  // A game that is not out has no "Rank this" (status.ts), and none of
  // the two once it is in the backlog: the row then takes what is left, full
  // width, or is not drawn (rule 20).
  if (!primary && !secondary) return null;

  return (
    <View style={[styles.row, { gap: 10 }]}>
      {primary ? (
        <Button
          label={say(t, primary.label)}
          size="compact"
          disabled={primary.disabled || busy}
          onPress={onPrimary}
          style={styles.half}
        />
      ) : null}
      {secondary ? (
        <Button
          label={t(secondary.label)}
          variant="secondary"
          size="compact"
          disabled={busy}
          onPress={onSecondary}
          style={styles.half}
        />
      ) : null}
    </View>
  );
}

export function StatusRow({ line, onChange }: { line: StatusLine; onChange: () => void }) {
  const t = useT();
  const theme = useTheme();

  return (
    <View style={[styles.row, styles.status, { gap: theme.space[2] }]}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: line.playing
              ? theme.colors['brand/text']
              : theme.colors['text/secondary'],
          },
        ]}
      />
      <Text size={14} color="text/secondary" layout={styles.fill}>
        {sayJoined(t, line.parts)}
      </Text>
      <TextButton label={t('browse.game.status.change')} size={14} weight={500} onPress={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  status: { alignItems: 'center' },
  half: { flex: 1 },
  fill: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
