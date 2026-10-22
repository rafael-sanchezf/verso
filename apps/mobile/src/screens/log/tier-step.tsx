/**
 * Step 1: "How was it?"
 *
 * The sheet opens here at its small detent, over the game page, and this is the
 * only question the flow asks before it starts comparing. Four rows, one per
 * tier, each a disc in the tier's solid carrying the tier's icon in white, and
 * the tier's own words — color is the signal, the label is the meaning (rule
 * 5), and the icon tells the four apart without color, which the deep solids
 * of decision 29 need (option A: icons on every tier surface).
 */

import type { Tier } from '@verso/core';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Icon, Pressed, Skeleton, Text, TIER_ICONS, TIER_LABELS, TIER_ORDER, tierColor } from '@/ui';
import { useTheme } from '@/ui/theme';

export interface TierStepProps {
  /** The game's title, or null while it is still loading. */
  title: string | null;
  /** The tier that was tapped and is waiting on its list, if any. */
  pending: Tier | null;
  onChoose: (tier: Tier) => void;
}

export function TierStep({ title, pending, onChoose }: TierStepProps) {
  const t = useT();
  return (
    // 10 is the frame's column gap and is not on the spacing scale.
    <View style={{ gap: 10 }}>
      {title === null ? (
        <Skeleton width="70%" height={24} style={styles.heading} />
      ) : (
        <Text size={20} weight={700} align="center">
          {t('browse.log.tierStep.howWas', { title })}
        </Text>
      )}

      {TIER_ORDER.map((tier) => (
        <TierRow
          key={tier}
          tier={tier}
          busy={pending === tier}
          disabled={pending !== null}
          onPress={() => onChoose(tier)}
        />
      ))}
    </View>
  );
}

function TierRow({
  tier,
  busy,
  disabled,
  onPress,
}: {
  tier: Tier;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const theme = useTheme();

  return (
    <Pressed
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.row,
        {
          backgroundColor: theme.colors['bg/surface'],
          // 14 sits between the `md` and `lg` tokens; it is the frame's number.
          borderRadius: 14,
          padding: 14,
          gap: theme.space[3],
        },
      ]}>
      <View style={[styles.dot, { backgroundColor: theme.colors[tierColor(tier)] }]}>
        <Icon name={TIER_ICONS[tier]} size={16} color="tier/label" />
      </View>
      <Text size={17} weight={600} layout={styles.label}>
        {t(TIER_LABELS[tier])}
      </Text>
      {busy ? (
        <ActivityIndicator color={theme.colors['text/secondary']} />
      ) : (
        <Icon name="chevron-right" size={16} color="text/secondary" />
      )}
    </Pressed>
  );
}

const styles = StyleSheet.create({
  heading: { alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
});
