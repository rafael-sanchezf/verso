/**
 * The deck row's slider: one gesture says "played, and how it was"
 * (specs/onboarding.md, `TierSlider`; decision 27, guidelines principle 6).
 *
 * Four hard stops, "Didn't like" on the left to "Loved" on the right, and no
 * value between them: a tap on the track snaps to the nearest stop, and a
 * horizontal pan moves the thumb with the finger and snaps on release. The pan
 * activates only on a horizontal move (`activeOffsetX`) and fails on a
 * vertical one, so a vertical drag still scrolls the deck. The fill and the
 * thumb are colored by interpolating the tier palette across the stops on the
 * UI thread (Reanimated `interpolateColor`), and the thumb carries the nearest
 * stop's glyph in white. The word after the track is `text/primary`, not the
 * tier's color: the deep tier solids of decision 29 are 3.0 to 3.6:1 on the
 * dark canvas, enough for the line and the thumb but not for words. Untouched,
 * the stops are hollow, there is no thumb, and the word reads "Slide".
 *
 * Reduce Motion: the thumb snaps to its stop with no travel, so the color
 * changes in one step instead of tweening, and the glyph does not pop in.
 * Following the finger during a drag is direct manipulation and stays.
 *
 * Accessibility: the row is one adjustable element, "How was {title}", whose
 * value is the word; increment and decrement move one stop (tier-scale.ts).
 * The 44pt row height is the touch target, larger than the drawn 24pt thumb.
 *
 * The axis words above the list (`TierAxis`) share this row's geometry, so the
 * words sit over the stops on any width. Built here rather than in `src/ui`:
 * the deck is its only user so far (said in the PR).
 */

import type { Tier } from '@verso/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ZoomIn,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useT } from '@/lib/i18n';
import { Icon, Text, tierPalette, useTheme } from '@/ui';

import {
  LAST_STOP,
  THUMB_SIZE,
  TIER_STOPS,
  TIER_THUMB_ICONS,
  TIER_WORDS,
  nearestStop,
  positionAtX,
  sliderWord,
  stepValue,
  stopIndex,
  tierAtStop,
  usableWidth,
  xAtPosition,
  type TierValue,
} from './tier-scale';

/** The frame's track is about 220 wide; narrower phones shrink it. */
const TRACK_MAX = 220;
/** Room for the widest word, "Didn't like" at 13 semibold. */
const WORD_WIDTH = 78;
const GAP = 12;
/** The touch target's height: the 44pt the HIG asks for. */
const ROW_HEIGHT = 44;
const LINE = 3;
const STOP = 10;
/** Each axis word's box, centered over its stop. */
const AXIS_WORD = 64;
const SNAP = { duration: 160 } as const;
const STOP_POSITIONS = [0, 1, 2, 3];

export interface TierSliderProps {
  value: TierValue;
  onChange: (tier: Tier) => void;
  /** The game's title, for the accessibility label. */
  title: string;
}

export function TierSlider({ value, onChange, title }: TierSliderProps) {
  const t = useT();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const palette = tierPalette(theme);
  const colors = [palette.disliked, palette.fine, palette.liked, palette.loved];
  const hollow = theme.colors['bg/canvas'];
  const separator = theme.colors['border/separator'];

  const committed = stopIndex(value);
  const width = useSharedValue(0);
  const position = useSharedValue(committed ?? 0);
  const touched = useSharedValue(committed === null ? 0 : 1);
  const dragging = useSharedValue(0);
  /** Where the value already is, for a drag the scroll view takes back. -1 untouched. */
  const settled = useSharedValue(committed ?? -1);
  /** The stop under the finger while dragging, for the glyph and the word. */
  const [preview, setPreview] = useState<number | null>(null);
  /** A stop the gesture already animated to, so the effect below does not start it again. */
  const gestureTarget = useRef<number | null>(null);

  // A value set from outside (an accessibility step, a row reused for another
  // game) moves the thumb; one the gesture set is already on its way.
  useEffect(() => {
    settled.set(committed ?? -1);
    if (committed === null) {
      gestureTarget.current = null;
      touched.set(0);
      return;
    }
    touched.set(1);
    const fromGesture = gestureTarget.current === committed;
    gestureTarget.current = null;
    if (fromGesture) return;
    position.set(reduceMotion ? committed : withTiming(committed, SNAP));
  }, [committed, reduceMotion, position, settled, touched]);

  const commit = useCallback(
    (index: number) => {
      setPreview(null);
      const tier = tierAtStop(index);
      if (tier === value) return;
      gestureTarget.current = index;
      onChange(tier);
    },
    [onChange, value],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart((event) => {
      dragging.set(1);
      touched.set(1);
      position.set(positionAtX(event.x, width.get()));
    })
    .onUpdate((event) => {
      position.set(positionAtX(event.x, width.get()));
    })
    .onEnd((_event, success) => {
      if (!success) {
        // Taken back by the scroll view: return to where the value was.
        if (settled.get() < 0) touched.set(0);
        else position.set(reduceMotion ? settled.get() : withTiming(settled.get(), SNAP));
        return;
      }
      const target = nearestStop(position.get());
      position.set(reduceMotion ? target : withTiming(target, SNAP));
      scheduleOnRN(commit, target);
    })
    .onFinalize(() => {
      dragging.set(0);
    });

  const tap = Gesture.Tap().onEnd((event, success) => {
    if (!success) return;
    const target = nearestStop(positionAtX(event.x, width.get()));
    const fromUntouched = touched.get() === 0;
    touched.set(1);
    // From untouched there is nowhere to travel from: the thumb appears on its stop.
    position.set(reduceMotion || fromUntouched ? target : withTiming(target, SNAP));
    scheduleOnRN(commit, target);
  });

  const gesture = Gesture.Race(pan, tap);

  useAnimatedReaction(
    () => (dragging.get() ? nearestStop(position.get()) : -1),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setPreview, current < 0 ? null : current);
    },
  );

  const fillStyle = useAnimatedStyle(() => ({
    width: (position.get() / LAST_STOP) * usableWidth(width.get()),
    backgroundColor: interpolateColor(position.get(), STOP_POSITIONS, colors),
    opacity: touched.get(),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: xAtPosition(position.get(), width.get()) - THUMB_SIZE / 2 }],
    backgroundColor: interpolateColor(position.get(), STOP_POSITIONS, colors),
    opacity: touched.get(),
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    width.set(event.nativeEvent.layout.width);
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    if (action !== 'increment' && action !== 'decrement') return;
    const next = stepValue(value, action);
    if (next !== null && next !== value) onChange(next);
  };

  const shownIndex = preview ?? committed;
  const shownTier = shownIndex === null ? null : tierAtStop(shownIndex);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('onboarding.slider.howWas', { title })}
      accessibilityValue={{ text: t(sliderWord(shownTier)) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={[styles.row, { gap: GAP }]}>
      <GestureDetector gesture={gesture}>
        <View style={styles.track} onLayout={onLayout}>
          <View
            style={[
              styles.line,
              { backgroundColor: separator, left: THUMB_SIZE / 2, right: THUMB_SIZE / 2 },
            ]}
          />
          <Animated.View style={[styles.line, { left: THUMB_SIZE / 2 }, fillStyle]} />

          {TIER_STOPS.map((tier, index) => (
            <StopDot
              key={tier}
              index={index}
              position={position}
              touched={touched}
              width={width}
              colors={colors}
              hollow={hollow}
              separator={separator}
            />
          ))}

          <Animated.View style={[styles.thumb, thumbStyle]}>
            {shownTier ? (
              <Animated.View key={shownTier} entering={reduceMotion ? undefined : ZoomIn.duration(140)}>
                <Icon name={TIER_THUMB_ICONS[shownTier]} size={12} color="tier/label" strokeWidth={2.5} />
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
      </GestureDetector>

      {shownTier ? (
        <Text size={13} weight={600} numberOfLines={1} layout={styles.word}>
          {t(TIER_WORDS[shownTier])}
        </Text>
      ) : (
        <Text size={13} color="text/secondary" numberOfLines={1} layout={styles.word}>
          {t(sliderWord(null))}
        </Text>
      )}
    </View>
  );
}

/** One of the four stops: hollow until the fill reaches it, then the fill's color. */
function StopDot({
  index,
  position,
  touched,
  width,
  colors,
  hollow,
  separator,
}: {
  index: number;
  position: SharedValue<number>;
  touched: SharedValue<number>;
  width: SharedValue<number>;
  colors: string[];
  hollow: string;
  separator: string;
}) {
  const style = useAnimatedStyle(() => {
    const reached = touched.get() > 0 && position.get() >= index - 0.01;
    const color = interpolateColor(position.get(), STOP_POSITIONS, colors);
    return {
      transform: [{ translateX: xAtPosition(index, width.get()) - STOP / 2 }],
      backgroundColor: reached ? color : hollow,
      borderColor: reached ? color : separator,
    };
  });

  return <Animated.View style={[styles.stop, style]} />;
}

/**
 * The four words over the stops, above the deck's list. Decorative: each
 * slider's own value already says its word to a screen reader. `trailing` is
 * a word over the word column, right-aligned: the film deck's "Seen", over
 * the seen check at the end of each row's title line.
 */
export function TierAxis({ trailing }: { trailing?: string } = {}) {
  const t = useT();
  const [width, setWidth] = useState(0);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.row, { gap: GAP }]}>
      <View style={[styles.axis]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0
          ? TIER_STOPS.map((tier, index) => (
              <Text
                key={tier}
                size={11}
                color="text/secondary"
                align="center"
                numberOfLines={1}
                layout={[styles.axisWord, { left: xAtPosition(index, width) - AXIS_WORD / 2 }]}>
                {t(TIER_WORDS[tier])}
              </Text>
            ))
          : null}
      </View>
      <View style={styles.word}>
        {trailing ? (
          <Text size={11} color="text/secondary" align="right" numberOfLines={1}>
            {trailing}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  track: {
    flex: 1,
    maxWidth: TRACK_MAX,
    height: ROW_HEIGHT,
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    height: LINE,
    borderRadius: LINE / 2,
    top: (ROW_HEIGHT - LINE) / 2,
  },
  stop: {
    position: 'absolute',
    left: 0,
    top: (ROW_HEIGHT - STOP) / 2,
    width: STOP,
    height: STOP,
    borderRadius: STOP / 2,
    borderWidth: 1,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (ROW_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: { width: WORD_WIDTH },
  axis: {
    flex: 1,
    maxWidth: TRACK_MAX,
    height: 16,
  },
  axisWord: {
    position: 'absolute',
    top: 0,
    width: AXIS_WORD,
  },
});
