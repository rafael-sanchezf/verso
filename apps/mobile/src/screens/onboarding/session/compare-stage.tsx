/**
 * One question of the session (specs/batch-session.md, "The session"): the
 * tier chip, the prompt, the pair, the two escape hatches, and "Place the rest
 * for me" on every question.
 *
 * Everything is read off the engine's question: `comparisonPrompt` and
 * `genreCue` work on the `InsertionState` it carries, unchanged, so the screen
 * asks exactly what `nextQuestion` chose and names a genre only when the pair
 * shares one. The cards are the log flow's `CompareCard`; the new game is
 * always the left one.
 *
 * The stage sits centred in the space under the header, column gap 16. Each
 * answer replaces the chip, the prompt and the pair, and the question number
 * is their key, so React mounts the next one and it fades in; the hatches and
 * the stop line stay put. Reduce Motion: no fade.
 */

import { comparisonPrompt, genreCue, type BatchQuestion, type ComparisonOutcome } from '@verso/core';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Button, Text, TierChip, useTheme } from '@/ui';

import { CompareCard } from '../../log/compare-card';
import { NEW_GAME_SUBTITLE } from './batch-start';
import type { SessionGame } from './games';
import { TextAction } from './text-action';

export interface CompareStageProps {
  question: BatchQuestion;
  /** How many questions have been answered: the key of the one on screen. */
  answered: number;
  game: SessionGame;
  pivot: SessionGame;
  /** "ranked #12 · 8.9", or "just played" when the opponent is from this batch. */
  pivotSubtitle: string;
  onAnswer: (outcome: ComparisonOutcome) => void;
  onPlaceRest: () => void;
}

export function CompareStage({
  question,
  answered,
  game,
  pivot,
  pivotSubtitle,
  onAnswer,
  onPlaceRest,
}: CompareStageProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const prompt = comparisonPrompt(question.insertion);
  const cue = genreCue(question.insertion);

  return (
    <ScrollView
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.stage,
        { paddingHorizontal: theme.space[4], paddingBottom: theme.space[6], gap: theme.space[4] },
      ]}>
      <Animated.View
        key={`question-${answered}`}
        entering={reduceMotion ? undefined : FadeIn.duration(220)}
        style={{ gap: theme.space[4] }}>
        <TierChip tier={question.tier} style={styles.chip} />
        <Text size={22} weight={700} align="center">
          {prompt}
        </Text>
        <View style={[styles.pair, { gap: theme.space[3] }]}>
          <CompareCard game={game} subtitle={NEW_GAME_SUBTITLE} cue={cue} onPress={() => onAnswer('a')} />
          <CompareCard game={pivot} subtitle={pivotSubtitle} cue={cue} onPress={() => onAnswer('b')} />
        </View>
      </Animated.View>

      <View>
        <View style={[styles.hatches, { gap: theme.space[3] }]}>
          <Button
            label="Too close to call"
            variant="secondary"
            size="small"
            weight={500}
            style={styles.hatch}
            onPress={() => onAnswer('too_close')}
          />
          <Button
            label="Can't compare these"
            variant="secondary"
            size="small"
            weight={500}
            style={styles.hatch}
            onPress={() => onAnswer('cant_compare')}
          />
        </View>
        <View style={{ paddingTop: theme.space[2] }}>
          <TextAction label="Place the rest for me" onPress={onPlaceRest} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stage: { flexGrow: 1, justifyContent: 'center' },
  chip: { alignSelf: 'center' },
  pair: { flexDirection: 'row', alignItems: 'stretch' },
  hatches: { flexDirection: 'row' },
  hatch: { flex: 1 },
});
