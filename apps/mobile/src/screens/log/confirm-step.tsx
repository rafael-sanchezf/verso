/**
 * Step 3: "Look right?"
 *
 * The step Beli does not have, and the reason the flow is worth trusting: one
 * careless tap during the comparisons would otherwise misplace a game silently
 * and forever (rule 13). So the placement is shown in context — the games it
 * now sits between, with the scores they will all have after the write — and
 * the two nudges move it a position at a time before anything is written.
 *
 * Nothing here touches the database. Done is the one write in the whole flow.
 */

import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Cover, ErrorLine, Skeleton, Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import { scoreText, TIER_IN_SENTENCE, type LogGame } from './game';
import { canNudge, provisionalList, type ConfirmState } from './machine';
import { neighborRows, type NeighborRow } from './placement';

export interface ConfirmStepProps {
  state: ConfirmState;
  newGame: LogGame;
  /** The tier's ranked games by id, for the neighbours' titles and covers. */
  gamesById: ReadonlyMap<string, LogGame>;
  /** Games in the tiers above this one, or null while that is still unknown. */
  above: number | null;
  onNudge: (delta: number) => void;
  onDone: () => void;
  saving: boolean;
  /** A failed write; Done stays enabled so it can be tried again. */
  error: string | null;
}

export function ConfirmStep({
  state,
  newGame,
  gamesById,
  above,
  onNudge,
  onDone,
  saving,
  error,
}: ConfirmStepProps) {
  const theme = useTheme();

  const ids = provisionalList(state).map((item) => item.id);
  const rows = neighborRows({
    tier: state.insertion.tier,
    ids,
    newIndex: state.insertAt,
    // Only used for the rank numbers, and those are drawn as skeletons until
    // the tiers above have been counted, so the zero never reaches the screen.
    above: above ?? 0,
  });

  const wasEmpty = state.insertion.list.length === 0;
  const tierName = TIER_IN_SENTENCE[state.insertion.tier];
  const rank = above === null ? null : above + state.insertAt + 1;

  const subtitle = wasEmpty
    ? `First in ${tierName}.`
    : rank === null
      ? `${newGame.title} lands in ${tierName}. Nudge it if that feels off.`
      : `${newGame.title} lands at #${rank} in ${tierName}. Nudge it if that feels off.`;

  return (
    /*
      `collapsable={false}` on this view and on the footer below is what makes
      the step draw at all inside the native form sheet.
      react-native-screens takes over the layout of a form sheet that contains a
      scroll view and handles at most two subviews of the sheet's container;
      React Native flattens away plain layout-only `View`s, so this step's
      wrapper disappeared and the sheet saw three siblings (the scroll view, the
      error line and Done) instead of two. It logged
      "FormSheet with ScrollView expects at most 2 subviews. Got 3" and laid the
      scroll view's content out at zero height — a full-height sheet with
      nothing in it but the Done button, which is exactly what the first real
      run of this flow showed.

      Two subviews now, both kept out of the flattener: the scroll view, and one
      footer holding the error line and Done.
    */
    <View style={styles.fill} collapsable={false}>
      {/*
        Done is outside the scroll view so it is reachable on a short screen;
        the placement above it scrolls only if it has to, and on every phone the
        frames cover it does not.
      */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ gap: theme.space[1] + 2, paddingBottom: theme.space[5] }}>
          <Text style="title-1">Look right?</Text>
          <Text size={15} color="text/secondary">
            {subtitle}
          </Text>
        </View>

        <View>
          {rows.map((row) => (
            <NeighborListRow
              key={row.id}
              row={row}
              game={row.isNew ? newGame : gamesById.get(row.id)}
              showRank={above !== null}
            />
          ))}
        </View>

        <View style={[styles.nudges, { paddingTop: theme.space[5], gap: theme.space[3] }]}>
          <Button
            label="▲ Move up"
            variant="secondary"
            size="small"
            style={styles.nudge}
            disabled={!canNudge(state, -1)}
            onPress={() => onNudge(-1)}
          />
          <Button
            label="▼ Move down"
            variant="secondary"
            size="small"
            style={styles.nudge}
            disabled={!canNudge(state, 1)}
            onPress={() => onNudge(1)}
          />
        </View>
      </ScrollView>

      <View collapsable={false}>
        {error ? (
          <View style={{ paddingBottom: theme.space[3] }}>
            <ErrorLine message={error} align="start" />
          </View>
        ) : null}

        <Button label="Done" variant="contrast" disabled={saving} onPress={onDone} />
      </View>
    </View>
  );
}

function NeighborListRow({
  row,
  game,
  showRank,
}: {
  row: NeighborRow;
  game: LogGame | undefined;
  showRank: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          padding: theme.space[3],
          gap: theme.space[3],
          // A transparent border on the other rows, so the highlighted one does
          // not shift its neighbours sideways by two points.
          borderWidth: 2,
          borderColor: row.isNew ? theme.colors['brand/text'] : 'transparent',
          borderRadius: 14,
          backgroundColor: row.isNew ? theme.colors['bg/surface'] : 'transparent',
        },
      ]}>
      {showRank ? (
        <Text
          size={17}
          weight={row.isNew ? 700 : 400}
          color={row.isNew ? 'text/primary' : 'text/secondary'}
          layout={styles.rank}>
          {row.globalRank}
        </Text>
      ) : (
        <Skeleton width={22} height={17} radius={4} />
      )}
      <Cover width={40} radius={6} candidates={game?.candidates ?? []} />
      <Text
        size={16}
        weight={row.isNew ? 600 : 500}
        numberOfLines={1}
        layout={styles.title}>
        {game?.title ?? ''}
      </Text>
      <Text
        size={15}
        weight={row.isNew ? 700 : 400}
        color={row.isNew ? 'text/primary' : 'text/secondary'}>
        {scoreText(row.score)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /** Fills the height when the placement is short, so Done sits at the bottom. */
  scroll: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rank: { width: 22 },
  title: { flex: 1 },
  nudges: { flexDirection: 'row' },
  nudge: { flex: 1 },
});
