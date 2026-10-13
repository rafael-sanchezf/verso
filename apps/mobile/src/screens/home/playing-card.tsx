/**
 * The two Playing cards, and the long press that turns either into a menu.
 *
 * A tap opens the game page; a long press offers the three things you do to a
 * game you are in the middle of. That second gesture is the quick version of
 * the core loop — "several ways to say 'I finished this'... a long press on the
 * Playing tile on Home" (ui-principles.md) — so it has to feel like the system
 * menu it is imitating, not like a sheet somebody drew.
 *
 * Which is why this is `Link` with `Link.Menu` rather than the overlay the
 * frame draws. home.md says so outright ("Use the native context menu... the
 * frame is the intent, not a custom overlay"): iOS lifts the card, dims what is
 * behind it, and puts the menu on whichever side it fits, and every one of
 * those is a system behaviour that a hand-built overlay gets subtly wrong.
 * Three consequences, all listed in the PR:
 *
 * - The menu's icons are SF Symbols, because a UIKit menu takes no other kind.
 *   `checkmark`, `clock` and `square.stack` are the system's own versions of
 *   the Lucide `check`, `clock` and `layers` the spec names.
 * - The menu's type and color are the system's. The frame's "16 semibold in
 *   the accent green" cannot be asked for and should not be: a context menu that
 *   does not look like every other context menu on the phone reads as a
 *   website.
 * - Off iOS the menu is not rendered at all (expo-router drops it) and the card
 *   is a plain link. V0 is an iOS app; Android gets its own pass with its own
 *   convention.
 */

import { coverCandidates, type EntryRow } from '@verso/api';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { sayJoined } from '@/screens/game/phrase';
import { Cover, Text, useTheme } from '@/ui';

import { playingSubtitle } from './rules';
import type { PlayingActions } from './use-home-data';

export interface PlayingCardProps {
  row: EntryRow;
  actions: PlayingActions;
}

/**
 * The card you are most likely to want: the game you started last, with its
 * cover big enough to recognise across the room.
 */
export function PlayingHero({ row, actions }: PlayingCardProps) {
  const t = useT();
  const theme = useTheme();
  const parts = playingSubtitle(row);
  const subtitle = parts ? sayJoined(t, parts) : null;

  return (
    <PlayingCardLink row={row} actions={actions}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.lg,
            padding: theme.space[3],
            gap: theme.space[4],
          },
        ]}>
        <Cover
          width={96}
          radius={theme.radius.sm}
          candidates={coverCandidates(row)}
          accessibilityLabel={row.title}
        />
        <View style={[styles.text, { gap: theme.space[1] }]}>
          {/* No `numberOfLines`: the spec says the hero's title wraps, and a
              long title truncated to one line is the one on the shelf you
              cannot read. */}
          <Text size={17} weight={600}>
            {row.title}
          </Text>
          {subtitle ? (
            <Text size={15} color="text/secondary">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </PlayingCardLink>
  );
}

/**
 * Everything else you are playing: cover, title, nothing else.
 *
 * Decided in Phase 3, in favour of the frame. home.md contradicted itself —
 * its Layout section gives the small card "Cover 36 (radius 6), title 15 medium
 * on one line" and its Data section names a "small-card subtitle" — and #31
 * shipped the layout and left the question open.
 *
 * The frame wins for a reason that survives the contradiction: two of these sit
 * side by side in half the screen's width, so the subtitle would be
 * `playingSubtitle` truncated to about eighteen characters. "PC, PS5 · 14 h
 * played" becomes "PC, PS5 · 14 h…", which is not a fact, it is the shape of
 * one. The hero above carries the same subtitle in full, and the hero is the
 * game the user is actually in the middle of; these are the also-rans, and the
 * title is what identifies them.
 *
 * `playingSubtitle` is one line away in `rules.ts`, tested, and used by the
 * hero, if Rafa wants it here after seeing it.
 */
export function PlayingSmallCard({ row, actions }: PlayingCardProps) {
  const theme = useTheme();

  return (
    <PlayingCardLink row={row} actions={actions}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.md,
            paddingHorizontal: 10,
            paddingVertical: theme.space[2],
            gap: 10,
          },
        ]}>
        <Cover width={36} radius={6} candidates={coverCandidates(row)} accessibilityLabel={row.title} />
        <Text size={15} weight={500} numberOfLines={1} layout={styles.fill}>
          {row.title}
        </Text>
      </View>
    </PlayingCardLink>
  );
}

/**
 * The link, the trigger and the menu around whichever card was passed in.
 *
 * `asChild` so the card itself is the pressable thing rather than a `Text` with
 * a card inside it. Two constraints come from that, both from expo-router's
 * Radix `Slot`: the trigger's own `style` prop may not be an array (the shim
 * throws in development), and it may not be a function, because the merge
 * spreads it into an object. So the `Pressable` carries no style at all and the
 * card inside it carries all of them, with the pressed state coming through the
 * child function.
 */
function PlayingCardLink({
  row,
  actions,
  children,
}: PlayingCardProps & { children: React.ReactNode }) {
  const t = useT();
  const id = row.mediaItemId;

  return (
    <Link
      href={{ pathname: '/game/[id]', params: { id, from: 'Home' } }}
      push
      asChild>
      <Link.Trigger>
        <Pressable accessibilityRole="button" accessibilityLabel={row.title}>
          {({ pressed }) => <View style={pressed ? styles.pressed : undefined}>{children}</View>}
        </Pressable>
      </Link.Trigger>

      <Link.Menu>
        <Link.MenuAction icon="checkmark" onPress={() => actions.markAsFinished(id)}>
          {t('browse.home.playing.markAsFinished')}
        </Link.MenuAction>
        <Link.MenuAction icon="clock" onPress={() => actions.logHours(id)}>
          {t('browse.home.playing.logHours')}
        </Link.MenuAction>
        <Link.MenuAction icon="square.stack" onPress={() => actions.moveToBacklog(id)}>
          {t('browse.home.playing.moveToBacklog')}
        </Link.MenuAction>
      </Link.Menu>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  fill: { flex: 1 },
  pressed: { opacity: 0.7 },
});
