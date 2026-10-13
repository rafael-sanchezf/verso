/**
 * Box art.
 *
 * `coverCandidates(row)` in `@verso/api` returns every URL worth trying, best
 * first, because neither source is complete: IGDB has no cover for some games
 * and Steam's older apps are missing the library art. This walks that list.
 *
 * It has to be done by hand. `expo-image` accepts an array of sources, but it
 * picks between them by size and screen scale — it is a responsive picker, not
 * a fallback chain, and a 404 on the chosen one is simply a broken image. So
 * the component holds an index and advances it on `onError`, which costs
 * nothing in the usual case where the first URL works.
 *
 * The height is derived from the width rather than passed: two callers rounding
 * the same ratio differently is how a row of covers ends up a pixel out of
 * line. The art is never squeezed into a slot of another shape (rule 29) — the
 * layout adapts to the cover, and the only thing allowed to cut a cover off is
 * the screen edge.
 *
 * Every cover also carries its edge (rule 30): a hairline `border/separator`
 * and a soft shadow, in light and in dark, so Outer Wilds' black art does not
 * sink into the dark canvas and a white box does not sink into the light one.
 * Drawn here once, so no caller has to remember it.
 */

import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ColorScheme } from './theme';

/**
 * The real proportions of a cover, in the source pixels they come from.
 *
 * IGDB's `t_cover_big` is 264 × 374 — the size the IGDB image API documents for
 * that thumbnail, and what the CDN actually serves for every `co…` id in the
 * catalog. That is 1:1.4167, not the 3:4 the Figma frames drew. Deriving the box
 * from 3:4 and filling it meant about 6% off the top and bottom of every cover
 * in the app, which is a crop, and rule 29 says there is none. So the box takes
 * the art's own shape and the layout adapts to it.
 *
 * Steam's library art, the fallback for the games IGDB has no cover for, is
 * 600 × 900 (2:3) — taller still, so `contentFit: 'cover'` trims a sliver off
 * its width rather than letterboxing it. That is the rarer source by a long way
 * and the alternative is bars on every IGDB cover instead; if the sliver ever
 * shows, the fix is a per-source ratio, not a per-slot one.
 */
export const COVER_ASPECT = { width: 264, height: 374 } as const;

/**
 * How tall a cover of this width is, in whole points.
 *
 * Exported because anything that mirrors a cover's size — a skeleton, a fixed
 * row height, a card that has to reserve the space — has to get the same number
 * from the same place. Hardcoding it is how a ratio change leaves half the app
 * a few points out of line.
 */
export function coverHeight(width: number): number {
  return Math.round((width * COVER_ASPECT.height) / COVER_ASPECT.width);
}

/**
 * A film poster's proportions: TMDB serves posters at 2:3 (`w342` is 342 ×
 * 513), so a film's box is 2:3 and the art fills it whole (rule 29). Games
 * keep the IGDB box above; a screen says which it is drawing with `aspect`.
 */
export const POSTER_ASPECT = { width: 2, height: 3 } as const;

/** How tall a poster of this width is, in whole points. */
export function posterHeight(width: number): number {
  return Math.round((width * POSTER_ASPECT.height) / POSTER_ASPECT.width);
}

/** Which box a cover is drawn in: a game's IGDB cover, or a film's 2:3 poster. */
export type CoverAspect = 'cover' | 'poster';

/** The height for either box. */
export function artHeight(width: number, aspect: CoverAspect = 'cover'): number {
  return aspect === 'poster' ? posterHeight(width) : coverHeight(width);
}

export interface CoverProps {
  /** Points. The height comes from `coverHeight(width)`. */
  width: number;
  /** Corner radius in points; the frames use 4, 6, 8 and 10 depending on size. */
  radius?: number;
  /** From `coverCandidates(row)`. An empty list draws the placeholder. */
  candidates: readonly string[];
  /** For the screen reader; a cover with no label is noise. */
  accessibilityLabel?: string;
  /** `poster` for a film (2:3); the IGDB box otherwise. */
  aspect?: CoverAspect;
  style?: StyleProp<ViewStyle>;
}

/**
 * The soft half of the edge, per platform.
 *
 * iOS derives a shadow from the layer's own shape, so the shadowed view has to
 * keep its background and its radius and must not clip: `overflow: 'hidden'`
 * sets `masksToBounds`, and a masked layer shows no shadow at all. That is why
 * the shadow sits on the outer view here and the art is clipped by an inner
 * one — the shadow then traces the rounded rect instead of a square around it.
 *
 * Android has no per-corner shadow worth the trouble, and `elevation` is the
 * platform's own answer: it takes its outline from the rounded background, and
 * 2 is the resting-card step. Chosen over a border alone so a cover still lifts
 * off the canvas there. The hairline carries the rest of the edge everywhere.
 *
 * Web gets `boxShadow` rather than the `shadow*` props, which react-native-web
 * deprecates and warns about on every render.
 */
function shadowFor(scheme: ColorScheme): ViewStyle {
  const opacity = scheme === 'dark' ? 0.5 : 0.18;

  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOpacity: opacity,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 2 },
    default: { boxShadow: `0px 2px 4px rgba(0, 0, 0, ${opacity})` },
  });
}

export function Cover({ width, radius, candidates, accessibilityLabel, aspect = 'cover', style }: CoverProps) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);

  // A recycled row (a FlatList reusing a cell for a different game) gets a new
  // list while the component stays mounted; without this it would keep the old
  // row's failure count and skip straight past the new game's good first URL.
  const key = candidates.join('|');
  useEffect(() => setIndex(0), [key]);

  const height = artHeight(width, aspect);
  const borderRadius = radius ?? theme.radius.sm;
  const uri = candidates[index];

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          // Opaque, and not only for the placeholder: an iOS shadow is drawn
          // from the layer's background, and a transparent one has none.
          backgroundColor: theme.colors['bg/placeholder'],
        },
        shadowFor(theme.scheme),
        style,
      ]}>
      <View
        style={[
          styles.clip,
          {
            borderRadius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors['border/separator'],
          },
        ]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            // The box is already the IGDB cover's own shape, so this fills it
            // exactly and trims nothing. It stays `cover` rather than `contain`
            // for the Steam fallback, which is 2:3: a sliver off its width is
            // better than letterboxing every IGDB cover in the app.
            contentFit="cover"
            // Short enough to hide a cache hit's flash, short enough not to feel
            // like an animation when a list scrolls.
            transition={120}
            accessibilityLabel={accessibilityLabel}
            onError={() => setIndex((current) => current + 1)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the shadowed parent and does the clipping it cannot do itself.
  clip: { flex: 1, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
