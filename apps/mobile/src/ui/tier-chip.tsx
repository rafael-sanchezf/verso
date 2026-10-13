/**
 * Which tier a game landed in, as a filled chip with an icon and a sentence.
 *
 * The fill is the tier's deep solid and the icon and the words sit on it in
 * white (`tier/label`), the same in light and dark (decision 29, option A:
 * 5.8 to 7.0:1). The words carry the meaning and the icon separates the four
 * without color, which option A makes mandatory: under red-green color
 * blindness the four solids sit 1 to 4 units apart (rule 5). The labels are
 * the ones decided in ui-principles.md and are not paraphrased anywhere:
 * "Loved it", "Liked it", "It was fine", "Didn't like it".
 */

import { TIERS, type Tier } from '@verso/core';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useT, type TranslationKey } from '@/lib/i18n';

import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useTheme, type ColorToken } from './theme';

/**
 * The words for each tier, as dictionary keys (`shell.tiers`, spanish-build.md
 * wave 2): a screen shows one through `t(TIER_LABELS[tier])`. The single
 * source; nothing else spells these.
 */
export const TIER_LABELS: Readonly<Record<Tier, TranslationKey>> = {
  loved: 'shell.tiers.loved',
  liked: 'shell.tiers.liked',
  fine: 'shell.tiers.fine',
  disliked: 'shell.tiers.disliked',
};

/**
 * The Lucide glyph each tier carries on its chip, its row in the log flow, and
 * the Ranking divider: what tells the four apart without color.
 */
export const TIER_ICONS: Readonly<Record<Tier, IconName>> = {
  loved: 'heart',
  liked: 'thumbs-up',
  fine: 'meh',
  disliked: 'thumbs-down',
};

/** Best first, as every list in the app orders them. */
export const TIER_ORDER: readonly Tier[] = TIERS;

export function tierColor(tier: Tier): ColorToken {
  return `tier/${tier}` as ColorToken;
}

export interface TierChipProps {
  tier: Tier;
  style?: StyleProp<ViewStyle>;
}

export function TierChip({ tier, style }: TierChipProps) {
  const t = useT();
  const theme = useTheme();

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: theme.colors[tierColor(tier)],
          borderRadius: theme.radius.pill,
          paddingLeft: 10,
          paddingRight: theme.space[3],
          paddingVertical: 5,
          gap: 6,
        },
        style,
      ]}>
      <Icon name={TIER_ICONS[tier]} size={14} color="tier/label" />
      <Text size={13} weight={600} color="tier/label">
        {t(TIER_LABELS[tier])}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});
