/**
 * Step 2: the comparisons, at full height.
 *
 * Everything on this screen is read off the engine's state — the prompt, the
 * cue, which game is the opponent, how many questions are left — so the screen
 * asks exactly what the search decided to ask and cannot drift from it.
 *
 * The stage is laid out so the two cards' midpoint sits on the sheet's
 * midpoint, with the prompt directly above them and the escape hatches directly
 * below (approved 2026-09-16; rule 22, no dead space between the choice and the
 * way out). That is done with two flexible regions either side of the pair
 * rather than by measuring anything: the pair is the only inflexible child, so
 * the space above and below it is always equal.
 */

import { comparisonPrompt, genreCue, type ComparisonOutcome, type InsertionState, type Medium } from '@verso/core';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { filmComparisonWords } from '@/lib/film';
import { useT } from '@/lib/i18n';
import { Button, Icon, Text, TierChip } from '@/ui';
import { useTheme } from '@/ui/theme';

import { CompareCard } from './compare-card';
import type { LogGame } from './game';
import { progress } from './machine';
import { ProgressDots } from './pieces';

export interface CompareStepProps {
  /** Films read TMDB's genres and say "just watched"; games are the default. */
  medium?: Medium;
  insertion: InsertionState;
  /** The game being ranked: always the left card. */
  newGame: LogGame;
  /** `state.list[state.pivotIndex]`, joined back to its catalog row. */
  pivot: LogGame;
  /** "ranked #12 · 8.9", or the score alone until the tiers above have loaded. */
  pivotSubtitle: string;
  onAnswer: (outcome: ComparisonOutcome) => void;
  onClose: () => void;
}

export function CompareStep({
  medium = 'game',
  insertion,
  newGame,
  pivot,
  pivotSubtitle,
  onAnswer,
  onClose,
}: CompareStepProps) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The top row floats over the stage, so the prompt is kept clear of it by
  // padding rather than by guessing a number.
  const [topRowHeight, setTopRowHeight] = useState(0);

  // A film's genres are TMDB's, which core's IGDB table does not name.
  const filmWords = medium === 'movie' ? filmComparisonWords(insertion) : null;
  const prompt = filmWords ? filmWords.prompt : comparisonPrompt(insertion);
  const cue = filmWords ? filmWords.cue : genreCue(insertion);
  // Every answer replaces the pair; the question number is what makes React
  // mount a new one and fade it in.
  const question = insertion.records.length;
  const steps = progress(insertion);

  return (
    // `collapsable={false}`, like the confirm step: this is the native form
    // sheet's own content view, and a `View` carrying nothing but `flex: 1` is
    // flattened away, which leaves react-native-screens laying out the stage
    // and the top row directly and the stage with no height to centre in.
    <View style={styles.fill} collapsable={false}>
      <ScrollView
        style={styles.fill}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.stage,
          {
            paddingHorizontal: theme.space[4],
            paddingTop: Math.max(insets.top, theme.space[2]),
            paddingBottom: Math.max(insets.bottom, theme.space[4]),
          },
        ]}>
        <View style={[styles.above, { paddingTop: topRowHeight, paddingBottom: theme.space[4] }]}>
          <Animated.View key={`prompt-${question}`} entering={FadeIn.duration(220)}>
            <Text size={22} weight={700} align="center">
              {prompt}
            </Text>
          </Animated.View>
        </View>

        <Animated.View
          key={`pair-${question}`}
          entering={FadeIn.duration(220)}
          style={[styles.pair, { gap: theme.space[3] }]}>
          <CompareCard
            game={newGame}
            subtitle={medium === 'movie' ? t('browse.log.compare.justWatched') : t('browse.log.compare.justFinished')}
            cue={cue}
            onPress={() => onAnswer('a')}
          />
          <CompareCard game={pivot} subtitle={pivotSubtitle} cue={cue} onPress={() => onAnswer('b')} />
        </Animated.View>

        <View style={[styles.below, { paddingTop: theme.space[4] }]}>
          <View style={[styles.hatches, { gap: theme.space[3] }]}>
            <Button
              label={t('browse.log.compare.tooClose')}
              variant="secondary"
              size="small"
              style={styles.hatch}
              onPress={() => onAnswer('too_close')}
            />
            <Button
              label={t('browse.log.compare.cantCompare')}
              variant="secondary"
              size="small"
              style={styles.hatch}
              onPress={() => onAnswer('cant_compare')}
            />
          </View>
        </View>
      </ScrollView>

      {/*
        Drawn after the stage so it sits over it, and measured so the prompt
        stays clear. Taller than the old single-line row now that the dots sit
        above the tier chip (rule 33), which is why the prompt's clearance is
        measured rather than a fixed number: it grows with this block for free.
      */}
      <View
        collapsable={false}
        onLayout={(event) => setTopRowHeight(event.nativeEvent.layout.height)}
        style={[
          styles.topRow,
          {
            paddingHorizontal: theme.space[4],
            paddingTop: Math.max(insets.top, theme.space[2]),
            paddingBottom: theme.space[2],
            gap: theme.space[3],
          },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('browse.log.compare.close')}
          hitSlop={12}
          style={styles.closeButton}
          onPress={onClose}>
          <Icon name="x" size={20} />
        </Pressable>
        {/*
          Centered on the row, not on the space left over from the close
          button: a same-width blank view on the right balances the button on
          the left so the dots and chip sit on the row's true midpoint.
        */}
        <View style={[styles.center, { gap: theme.space[2] }]}>
          <ProgressDots
            answered={steps.answered}
            total={steps.expected}
            // The nudged `total` here, not `steps.expected`: this is what
            // VoiceOver reads, and it should never announce a question past
            // the same tilde-total the old counter text showed.
            accessibilityLabel={t('browse.log.compare.question', { current: steps.current, total: steps.total })}
            accessibilityValue={{ min: 0, max: steps.total, now: steps.current }}
          />
          <TierChip tier={insertion.tier} />
        </View>
        <View style={styles.closeButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /**
   * The stage fills the sheet, which is what centres the pair on it.
   *
   * It is a scroll view's content container with `flexGrow: 1`, and that is the
   * whole trick. The first version made the stage `position: 'absolute'` with
   * all four edges pinned, which on a real device drew the escape hatches on
   * top of the cards: inside a native form sheet nothing up the chain has a
   * resolved height for a `flex: 1` or an absolutely-pinned child to fill, so
   * `above` and `below` had no height to divide, all three regions collapsed to
   * the same place, and their contents painted over one another.
   *
   * A scroll view's content container is the one box in React Native that is
   * given a definite height regardless — its own height, or the content's,
   * whichever is larger — which is why the confirm step's layout survived the
   * same sheet and this one did not. `flexGrow: 1` hands that height to the two
   * flexible regions either side of the pair, and they do the centring the spec
   * asks for. It scrolls instead of overlapping on a phone too short for the
   * cards, which is the other thing the frames could not tell us.
   */
  stage: { flexGrow: 1 },
  above: { flex: 1, justifyContent: 'flex-end' },
  below: { flex: 1, justifyContent: 'flex-start' },
  pair: { flexDirection: 'row', alignItems: 'stretch' },
  hatches: { flexDirection: 'row' },
  hatch: { flex: 1 },
  /** Floats over the stage: it is chrome, not part of what is being centred. */
  topRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  /** The close icon's hit area, and its mirror on the right that balances it. */
  closeButton: { width: 20 },
  /** The dots-and-chip block, centred between the two `closeButton`-width columns. */
  center: { flex: 1, alignItems: 'center' },
});
