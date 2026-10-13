/**
 * The filter sheet's Length: a slider over six stops, 1 h to Any in half
 * hours, with a tick and a label under each and the choice above the knob
 * ("Under 2 h"), as `Watchlist · Filters` (273:53) draws it after round three.
 *
 * A responder rather than a gesture-handler pan, because the sheet is a React
 * Native `Modal` and the gesture handler needs its own root view inside one;
 * the responder works there and on the web alike. It snaps to the nearest
 * stop as the finger moves. For VoiceOver it is one adjustable element that
 * steps a stop at a time.
 */

import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { Text, useTheme } from '@/ui';

import { LENGTH_STOPS, lengthLabel, stopLabel } from './filters';

const KNOB = 28;
const LABEL_WIDTH = 52;

export function LengthSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (maxMinutes: number | null) => void;
}) {
  const theme = useTheme();
  const track = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const origin = useRef(0);

  const index = Math.max(0, LENGTH_STOPS.indexOf(value));
  const last = LENGTH_STOPS.length - 1;
  const usable = Math.max(0, width - KNOB);
  const xOf = (i: number) => KNOB / 2 + (usable * i) / last;
  const knobX = xOf(index);

  const pick = (pageX: number) => {
    if (usable <= 0) return;
    const ratio = (pageX - origin.current - KNOB / 2) / usable;
    const next = Math.min(last, Math.max(0, Math.round(ratio * last)));
    if (next !== index) onChange(LENGTH_STOPS[next] ?? null);
  };

  const begin = (event: GestureResponderEvent) => {
    const { pageX } = event.nativeEvent;
    track.current?.measureInWindow((x) => {
      origin.current = x;
      pick(pageX);
    });
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={{ gap: theme.space[2] }}>
      <View style={styles.titleRow}>
        <Text
          size={15}
          weight={600}
          align="center"
          numberOfLines={1}
          // Over the knob, kept inside the track at either end.
          layout={[styles.title, { left: Math.min(Math.max(0, knobX - 60), Math.max(0, width - 120)) }]}>
          {lengthLabel(value)}
        </Text>
      </View>

      <View
        ref={track}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Length"
        accessibilityValue={{ text: lengthLabel(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          const next = Math.min(last, Math.max(0, index + step));
          onChange(LENGTH_STOPS[next] ?? null);
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={begin}
        onResponderMove={(event) => pick(event.nativeEvent.pageX)}
        style={styles.track}>
        <View style={[styles.rail, { backgroundColor: theme.colors['bg/placeholder'] }]} />
        <View style={[styles.fill, { width: knobX, backgroundColor: theme.colors['brand/primary'] }]} />
        <View
          pointerEvents="none"
          style={[
            styles.knob,
            {
              left: knobX - KNOB / 2,
              // White in both schemes, as iOS draws a slider's thumb; the
              // token that is white in both is the label on the brand fill.
              backgroundColor: theme.colors['brand/on-primary'],
              borderColor: theme.colors['border/separator'],
            },
          ]}
        />
      </View>

      <View style={styles.ticks} pointerEvents="none">
        {LENGTH_STOPS.map((stop, i) => (
          <View key={String(stop)} style={[styles.tick, { left: xOf(i) - LABEL_WIDTH / 2 }]}>
            <View style={[styles.mark, { backgroundColor: theme.colors['border/separator'] }]} />
            <Text size={12} color="text/secondary" align="center" numberOfLines={1}>
              {stopLabel(stop)}
            </Text>
          </View>
        ))}
      </View>
      <Text size={11} color="text/secondary">
        Runtime, by TMDB
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { height: 20 },
  title: { position: 'absolute', width: 120 },
  track: { height: KNOB, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2 },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2 },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.2)',
  },
  ticks: { height: 26 },
  tick: { position: 'absolute', width: LABEL_WIDTH, alignItems: 'center', gap: 3 },
  mark: { width: 1, height: 6 },
});
