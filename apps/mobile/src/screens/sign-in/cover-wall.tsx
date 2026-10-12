/**
 * The wall of covers behind the sign-in sheet.
 *
 * Three columns of box art running off the top of the screen, with the sheet
 * floating over it. The point is that the first thing anyone sees of this app
 * is games, not a form (rule 14: empty states are screens).
 *
 * Bare, since Rafa's reaction to the fidelity round on 2026-09-16: no label and
 * no headline over it (signed-out.md Layout). Every cover is drawn whole at its
 * own ratio through the `Cover` primitive — 120 wide and, at IGDB's 264 × 374,
 * 170 tall — so none of the art is cut to fit a slot (rule 29) and each one
 * carries its hairline and shadow (rule 30). The stagger comes from starting
 * each column at a different negative offset rather than from the frame's
 * alternating heights: the screen clips the top row, the image is never
 * clipped.
 *
 * It does not scroll and it does not move with the keyboard: the sheet rises
 * over it. Nothing here is interactive, and the whole thing is hidden from the
 * screen reader — fifteen unlabelled pictures would be fifteen stops on the way
 * to the email field for no gain.
 */

import { popularGames } from '@verso/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Cover } from '@/ui';
import { useTheme } from '@/ui/theme';

import {
  COLUMN_TOP_OFFSETS,
  coverColumns,
  popularCoverUrls,
  SIGNED_OUT_COVERS,
  WALL_SLOTS,
} from './covers';

/** Points. 3 × 120 + 2 × 8 + 2 × 12 of side padding is 400 of the 402 frame. */
const COVER_WIDTH = 120;

/** The frame's cover radius on this screen. */
const COVER_RADIUS = 10;

export function CoverWall() {
  const theme = useTheme();

  /**
   * The catalog's most-rated games, readable with no account because
   * `popular_games` is `security definer`.
   *
   * `staleTime: Infinity` for the same reason Search's Popular section has it:
   * the most-rated games in the catalog cannot move while someone is typing a
   * password. One retry, because this is decoration with a good fallback and a
   * signed-out screen should not spend its first seconds retrying a wall.
   */
  const popular = useQuery({
    queryKey: queryKeys.popular(WALL_SLOTS),
    queryFn: () => popularGames(supabase, WALL_SLOTS),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  // The hardcoded fifteen while the read is in flight and if it fails
  // (signed-out.md). Never an error state: the wall is decoration, and a
  // sign-in screen has nowhere sensible to put an error line.
  //
  // Deferred, per signed-out.md Data: "Once the other catalogs have covers, the
  // wall shows the medium in view or ... cycles through the four media"; games
  // only until then.
  const columns = useMemo(() => {
    const live = popularCoverUrls(popular.data ?? []);
    return coverColumns(live.length > 0 ? live : SIGNED_OUT_COVERS);
  }, [popular.data]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        styles.wall,
        {
          // In the style rather than as a prop: `props.pointerEvents` is
          // deprecated and react-native-web warns about it on every render.
          // The style form has worked on native since RN 0.71.
          pointerEvents: 'none',
          backgroundColor: theme.colors['bg/canvas'],
          paddingHorizontal: theme.space[3],
        },
      ]}>
      <View style={[styles.columns, { gap: theme.space[2] }]}>
        {columns.map((column, index) => (
          <View
            key={index}
            style={[
              styles.column,
              { gap: theme.space[2], marginTop: COLUMN_TOP_OFFSETS[index] ?? 0 },
            ]}>
            {column.map((url, row) => (
              <Cover
                key={`${index}-${row}`}
                width={COVER_WIDTH}
                radius={COVER_RADIUS}
                candidates={[url]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The screen is what cuts the top row off; nothing inside is ever squeezed.
  wall: { overflow: 'hidden' },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { width: COVER_WIDTH },
});
