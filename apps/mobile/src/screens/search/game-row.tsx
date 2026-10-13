/**
 * One game in a list on Search: Popular and results are the same row.
 *
 * `ListRow` already is this row — 44pt cover, title 16 medium, subtitle 13
 * `text/secondary`, vertical padding 10, gap 12 — so the only thing here is the
 * trailing button and what it means. It is its own component because the tap
 * targets differ: the row opens the game, the pill opens the add-to sheet, and
 * a pill that inherited the row's press would put the sheet one misjudged tap
 * away from every title in the list.
 *
 * In the Playing intent (specs/search.md) the same pill carries `play` instead
 * of the plus and marks the game Playing on the spot; the row itself still
 * opens the game page. In the add-many intent (specs/onboarding.md, "The
 * doors") it is a check circle: a plus on `bg/surface` until the game is
 * added, then `brand/primary` with the check in `brand/on-primary`, as the
 * primary button. Once tracked, the pill's check is in `brand/text`.
 */

import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { useT } from '@/lib/i18n';
import { Icon, ListRow } from '@/ui';
import { useTheme } from '@/ui/theme';

/**
 * What the trailing pill does. `add` opens the add-to sheet (plain Search);
 * `play` marks the game Playing in one tap (the Playing intent); `addmany`
 * marks it played and adds it to the batch (the add-many intent).
 */
export type GameRowControl = 'add' | 'play' | 'addmany';

export interface GameRowProps {
  title: string;
  subtitle: string | null;
  /** From `coverCandidates(row)`. */
  candidates: readonly string[];
  /**
   * Already in the caller's library. The add pill shows a `check` instead of a
   * `plus` — not drawn, the convention specs/search.md asks for — and still
   * opens the sheet, because the sheet is also how a status is changed. The
   * play pill ignores it: marking a tracked game Playing is the same one tap.
   */
  tracked?: boolean;
  /** Defaults to `add`. */
  control?: GameRowControl;
  /** This row's write is in flight: a spinner in the pill. */
  pending?: boolean;
  /** Some row's write is in flight: the pill does nothing until it lands. */
  disabled?: boolean;
  /** Add-many only: already added in this visit, so the circle is filled and does nothing. */
  added?: boolean;
  onPress: () => void;
  onControl: () => void;
  /** A film's row: the 2:3 poster and the site's Semi Bold title (frames 263:79, 264:79). */
  film?: boolean;
}

export function GameRow({
  title,
  subtitle,
  candidates,
  tracked = false,
  control = 'add',
  pending = false,
  disabled = false,
  added = false,
  onPress,
  onControl,
  film = false,
}: GameRowProps) {
  return (
    <ListRow
      coverWidth={44}
      coverRadius={6}
      coverAspect={film ? 'poster' : 'cover'}
      titleWeight={film ? 600 : 500}
      candidates={candidates}
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      trailing={
        control === 'addmany' ? (
          <AddManyCircle title={title} added={added} pending={pending} disabled={disabled} onPress={onControl} />
        ) : (
          <ControlPill
            title={title}
            control={control}
            tracked={tracked}
            pending={pending}
            disabled={disabled}
            onPress={onControl}
          />
        )
      }
    />
  );
}

function ControlPill({
  title,
  control,
  tracked,
  pending,
  disabled,
  onPress,
}: {
  title: string;
  control: GameRowControl;
  tracked: boolean;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const theme = useTheme();

  const label =
    control === 'play'
      ? t('browse.search.row.markPlaying', { title })
      : tracked
        ? t('browse.search.row.inLibrary', { title })
        : t('browse.search.row.add', { title });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      // The pill is 34pt wide and 26 tall; the slop brings it to the 44 iOS asks
      // for without making it look like a button for the whole row.
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space[2],
          paddingVertical: theme.space[1],
        },
        pressed && styles.pressed,
      ]}>
      {pending ? (
        // In the glyph's 18pt box, so the pill keeps its size while it spins.
        <ActivityIndicator size="small" color={theme.colors['text/secondary']} style={styles.glyph} />
      ) : control === 'play' ? (
        <Icon name="play" size={18} color="text/primary" />
      ) : (
        <Icon
          name={tracked ? 'check' : 'plus'}
          size={18}
          color={tracked ? 'brand/text' : 'text/primary'}
        />
      )}
    </Pressable>
  );
}

/** The add-many intent's control: a plus until added, then the filled check. */
function AddManyCircle({
  title,
  added,
  pending,
  disabled,
  onPress,
}: {
  title: string;
  added: boolean;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        added ? t('browse.search.row.addedLabel', { title }) : t('browse.search.row.addAsPlayed', { title })
      }
      accessibilityState={{ disabled: disabled || pending || added, busy: pending, selected: added }}
      disabled={disabled || pending || added}
      // A 28pt circle; the slop brings it to 44.
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.circle,
        { backgroundColor: added ? theme.colors['brand/primary'] : theme.colors['bg/surface'] },
        pressed && styles.pressed,
      ]}>
      {pending ? (
        <ActivityIndicator size="small" color={theme.colors['text/secondary']} style={styles.glyph} />
      ) : (
        <Icon
          name={added ? 'check' : 'plus'}
          size={added ? 16 : 18}
          color={added ? 'brand/on-primary' : 'text/primary'}
          strokeWidth={added ? 2.5 : 2}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { width: 18, height: 18 },
  pressed: { opacity: 0.7 },
});
