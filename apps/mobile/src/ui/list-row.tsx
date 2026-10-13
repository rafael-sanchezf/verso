/**
 * The row that Search, Next, Ranking and Profile are all made of: a cover, one
 * to three lines, something on the right.
 *
 * The three lines are separate props rather than children because their sizes
 * and colors are fixed by the specs and identical on every screen — the only
 * thing that varies is which fact each screen puts on which line, and that
 * decision belongs to the screen (rule 9's fallback chains), not here.
 *
 * On web a row with `onPress` dims under the pointer and draws the keyboard's
 * focus ring, both from `Pressed` (`interaction.ts`).
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressed } from './button';
import { Cover, type CoverAspect } from './cover';
import { Text } from './text';
import { useTheme } from './theme';

export interface ListRowProps {
  /** Cover width in points; the height follows. Omit for a row with no art. */
  coverWidth?: number;
  coverRadius?: number;
  /** `poster` for a film's 2:3 poster; a game's IGDB box by default. */
  coverAspect?: CoverAspect;
  /** The title's weight: 500 by default, 600 where the site's rows set it (films). */
  titleWeight?: 500 | 600;
  /** From `coverCandidates(row)`. */
  candidates?: readonly string[];
  title: string;
  /** 13 `text/secondary`. Nothing renders when it is null (rule 20). */
  subtitle?: string | null;
  /** 12 `text/secondary`. */
  detail?: string | null;
  /** A score badge, a button, a chevron, a drag handle. */
  trailing?: ReactNode;
  /** Before the cover: the rank number in Ranking, the date column on Home. */
  leading?: ReactNode;
  titleLines?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({
  coverWidth,
  coverRadius = 6,
  coverAspect,
  titleWeight = 500,
  candidates = [],
  title,
  subtitle,
  detail,
  trailing,
  leading,
  titleLines = 1,
  onPress,
  onLongPress,
  style,
}: ListRowProps) {
  const theme = useTheme();

  return (
    <Pressed
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, { paddingVertical: 10, gap: theme.space[3] }, style]}>
      {leading}
      {coverWidth ? (
        <Cover
          width={coverWidth}
          radius={coverRadius}
          aspect={coverAspect}
          candidates={candidates}
          accessibilityLabel={title}
        />
      ) : null}

      <View style={[styles.text, { gap: 2 }]}>
        <Text size={16} weight={titleWeight} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text size={13} color="text/secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text size={12} color="text/secondary" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>

      {trailing}
    </Pressed>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    // Without this a long unbroken title pushes the trailing slot off the edge
    // instead of ellipsizing.
    minWidth: 0,
  },
});
