/**
 * One screen of the tier pass (specs/batch-session.md, "Untiered items"): the
 * game's cover, then the log flow's tier sheet as it is, "How was {title}?"
 * over its four rows. A tap gives the game its tier and the next game fades
 * in; nothing is written until the review's Done.
 *
 * `TierStep` is the log flow's own component, reused rather than redrawn, so
 * the four tier rows read the same wherever a tier is chosen.
 */

import type { Tier } from '@verso/core';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Cover, useTheme } from '@/ui';

import { TierStep } from '../../log/tier-step';
import type { SessionGame } from './games';

/** The comparison card's cover width, so a game looks the same in both steps. */
const COVER_WIDTH = 140;

export interface TierPassStepProps {
  game: SessionGame;
  /** Changes with every game, so the next one fades in. */
  index: number;
  onChoose: (tier: Tier) => void;
}

export function TierPassStep({ game, index, onChoose }: TierPassStepProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <ScrollView
      contentContainerStyle={[styles.stage, { paddingHorizontal: theme.space[4], paddingBottom: theme.space[6] }]}
      showsVerticalScrollIndicator={false}>
      <Animated.View
        key={`tier-pass-${index}`}
        entering={reduceMotion ? undefined : FadeIn.duration(220)}
        style={{ gap: theme.space[4] }}>
        <View style={styles.cover}>
          <Cover width={COVER_WIDTH} radius={10} candidates={game.candidates} accessibilityLabel={game.title} />
        </View>
        <TierStep title={game.title} pending={null} onChoose={onChoose} />
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stage: { flexGrow: 1, justifyContent: 'center' },
  cover: { alignItems: 'center' },
});
