/**
 * The joint Profile's parts (movies-build.md, PR 5; frames 266:135, 267:112,
 * 275:136): the switcher under the identity row, the Friends door, a medium's
 * section with its row of posters, a line of activity, and the header with a
 * trailing link they share.
 */

import { coverCandidates, type ActivityEvent } from '@verso/api';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MEDIUM_WORDS, type LiveMedium } from '@/state/medium';
import { assembleRanking } from '@/screens/ranking/model';
import { Button, Chip, Cover, Icon, PosterCard, Sheet, Skeleton, Text, textStyles } from '@/ui';
import { useTheme } from '@/ui/theme';

import { useRanking } from './data';
import { activityLine, viewWords, type ProfileView } from './model';

// ---------------------------------------------------------------------------
// The switcher
// ---------------------------------------------------------------------------

/**
 * Home's switcher pattern, at Profile's size (Rafa's letters of 2026-10-12:
 * "little icons", never tabs that multiply). The active view is a brand pill
 * with its icon and word; the others are 32 surface circles with their icon,
 * in a fixed order (All, then the media as the questionnaire lists them), so
 * nothing jumps when the pick changes.
 */
export function ProfileSwitcher({
  options,
  value,
  onChange,
}: {
  options: readonly ProfileView[];
  value: ProfileView;
  onChange: (view: ProfileView) => void;
}) {
  const theme = useTheme();
  if (options.length === 0) return null;

  return (
    <View style={[styles.row, { gap: 10 }]} accessibilityRole="tablist">
      {options.map((option) => {
        const { word, icon } = viewWords(option);
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={word}
            hitSlop={6}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              active
                ? [
                    styles.pill,
                    {
                      backgroundColor: theme.colors['brand/primary'],
                      borderRadius: theme.radius.pill,
                      gap: 6,
                    },
                  ]
                : [styles.circle, { backgroundColor: theme.colors['bg/surface'] }],
              pressed ? styles.pressed : undefined,
            ]}>
            <Icon name={icon} size={active ? 16 : 17} color={active ? 'brand/on-primary' : 'text/secondary'} />
            {active ? (
              <Text size={15} weight={600} color="brand/on-primary">
                {word}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/** A section title at 20 Semi Bold, with an optional trailing text or link at 15. */
export function SectionHeader({
  title,
  trailing,
  trailingColor = 'text/secondary',
  onPress,
  accessibilityLabel,
}: {
  title: string;
  trailing?: string | null;
  trailingColor?: 'text/secondary' | 'brand/text';
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.row, styles.between]}>
      <Text size={20} weight={600} numberOfLines={1} layout={textStyles.fill}>
        {title}
      </Text>
      {trailing ? (
        onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? trailing}
            hitSlop={12}
            onPress={onPress}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
            <Text size={15} color={trailingColor}>
              {trailing}
            </Text>
          </Pressable>
        ) : (
          <Text size={15} color={trailingColor} numberOfLines={1}>
            {trailing}
          </Text>
        )
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

/**
 * The Friends door (VER-166): the header with the count, "Find friends", and
 * nothing else. Follows come in V2, so the count is 0 and the chip opens a
 * sheet that says so. The Suggested rows the frames draw are never drawn
 * here: there is no suggestions read, and Rafa's rule is to show nothing
 * rather than suggest blind.
 */
export function FriendsDoor() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 12 }}>
      <SectionHeader
        title="Friends"
        trailing="0 ›"
        onPress={() => setOpen(true)}
        accessibilityLabel="Friends, none yet"
      />
      <View style={styles.row}>
        <Chip label="Find friends" icon="user-plus" size={15} weight={500} onPress={() => setOpen(true)} />
      </View>

      <Sheet visible={open} onDismiss={() => setOpen(false)}>
        <View style={{ gap: theme.space[3], paddingBottom: theme.space[3] }}>
          <Text style="title-3" align="center">
            Friends are coming
          </Text>
          <Text size={15} color="text/secondary" align="center">
            Following friends and seeing what they rank comes with the next release.
          </Text>
          <Button label="OK" variant="secondary" onPress={() => setOpen(false)} />
        </View>
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// A medium's section
// ---------------------------------------------------------------------------

/** The cards in a section's row: four in view at 402 wide, the row scrolls to ten. */
export const SECTION_CARD_WIDTH = 100;
const SECTION_ROW_LIMIT = 10;

/**
 * A medium's section (the brief, the page, item 4): its title and counts,
 * then the top of its ranked list as posters with the score alone on the
 * pill (round three), each pushing the item's page; "See all" goes to that
 * medium's Ranking. The ranked list is the Ranking tab's own read.
 */
export function MediumSection({
  medium,
  title,
  counts,
  onSeeAll,
  onOpen,
}: {
  medium: LiveMedium;
  title: string;
  /** "48 ranked · 12 backlog" on All; null shows "See all" instead. */
  counts: string | null;
  onSeeAll: () => void;
  onOpen: (id: string, medium: LiveMedium) => void;
}) {
  const theme = useTheme();
  const ranking = useRanking(medium);
  const items = ranking.data ? assembleRanking(ranking.data).slice(0, SECTION_ROW_LIMIT) : null;
  const noun = MEDIUM_WORDS[medium].noun;

  return (
    <View style={{ gap: 12 }}>
      <SectionHeader
        title={title}
        trailing={counts ?? 'See all'}
        onPress={onSeeAll}
        accessibilityLabel={`See all ranked ${MEDIUM_WORDS[medium].plural.toLowerCase()}`}
      />
      {items === null ? (
        <View style={[styles.row, { gap: 8 }]}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} width={SECTION_CARD_WIDTH} height={SECTION_CARD_WIDTH * 1.5} radius={8} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <Text size={15} color="text/secondary">
          {`No ${noun}s ranked yet.`}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -theme.space[4] }}
          contentContainerStyle={{ paddingHorizontal: theme.space[4], gap: 8 }}>
          {items.map((item) => (
            <PosterCard
              key={item.mediaItemId}
              width={SECTION_CARD_WIDTH}
              candidates={coverCandidates(item.row)}
              title={`${item.title}, ${item.score.toFixed(1)}`}
              facts={[item.score.toFixed(1)]}
              onPress={() => onOpen(item.mediaItemId, medium)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// A line of activity
// ---------------------------------------------------------------------------

/**
 * One line of Recent or of the Activity list: the small poster, the line in
 * the verb rule ("Ranked Dune: Part Two · 9.6", never a rank number), and the
 * time or the day at the right.
 */
export function ActivityRow({
  event,
  trailing,
  onPress,
}: {
  event: ActivityEvent;
  trailing: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { paddingVertical: 10, gap: theme.space[3] }, pressed ? styles.pressed : undefined]}>
      <Cover width={32} radius={4} aspect="poster" candidates={coverCandidates(event)} />
      <Text size={15} numberOfLines={1} layout={textStyles.fill}>
        {activityLine(event)}
      </Text>
      <Text size={13} color="text/secondary" numberOfLines={1}>
        {trailing}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between', gap: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, minHeight: 32 },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
