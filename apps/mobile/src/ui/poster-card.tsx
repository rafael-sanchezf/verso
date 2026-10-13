/**
 * The poster is the card (decision 28, rule 29, rule 36): a film's 2:3 poster
 * drawn whole, and nothing under it. The site's `pickCard`
 * (apps/site/src/components/movie-screens.tsx) as a native component.
 *
 * The facts are optional: Home's rows put the service, genre, year and
 * duration on the poster's foot as small white pills over a scrim; the
 * Watchlist puts none (Rafa's letters on the site round, 2026-10-12: where a
 * film streams is the movie page's fact, not the grid's), and Profile puts the
 * score alone. Nothing ever says the title: the poster does, and the screen
 * reader hears it from `accessibilityLabel`.
 *
 * The scrim is a flat 40% band under the pills rather than the site's linear
 * gradient, because the app carries no gradient library and a third-party SDK
 * for one band is not worth it (decision 21 is about data, but the rule of
 * thumb is the same). It only draws when there are facts.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressed } from './button';
import { Cover, posterHeight } from './cover';
import { Text } from './text';
import { ThemeScope, themeFor, useTheme } from './theme';

export interface PosterCardProps {
  /** Points; the height is 3/2 of it. */
  width: number;
  /** From `coverCandidates(row)`. */
  candidates: readonly string[];
  /** The film's title, for the screen reader. Never drawn. */
  title: string;
  /** The pills on the poster's foot, in order. None by default. */
  facts?: readonly string[];
  /** 12 at the large size (150 and up), 8 below, as the site draws them. */
  radius?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** The light theme the pills always draw in. */
const LIGHT = themeFor('light');

export function PosterCard({
  width,
  candidates,
  title,
  facts = [],
  radius,
  onPress,
  onLongPress,
  style,
}: PosterCardProps) {
  const theme = useTheme();
  const large = width >= 150;
  const corner = radius ?? (large ? 12 : 8);
  const inset = large ? 7 : 5;

  return (
    <Pressed onPress={onPress} onLongPress={onLongPress} style={[{ width, height: posterHeight(width) }, style]}>
      <Cover width={width} radius={corner} aspect="poster" candidates={candidates} accessibilityLabel={title} />
      {facts.length > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.scrim,
            { borderBottomLeftRadius: corner, borderBottomRightRadius: corner, padding: inset, gap: 3 },
          ]}>
          {/*
            The pills are light in both schemes, as the site draws them: a
            light pill over the scrim reads on any poster, and the dark canvas
            made them black blots in dark mode.
          */}
          <ThemeScope scheme="light">
            {facts.map((fact) => (
              <View
                key={fact}
                style={{
                  backgroundColor: LIGHT.colors['bg/canvas'],
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: large ? 5 : 4.5,
                }}>
                <Text size={large ? 9.5 : 8.5} weight={600} numberOfLines={1}>
                  {fact}
                </Text>
              </View>
            ))}
          </ThemeScope>
        </View>
      ) : null}
    </Pressed>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
});
