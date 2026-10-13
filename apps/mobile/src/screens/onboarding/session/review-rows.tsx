/**
 * The review's rows (specs/batch-session.md, "The review"), drawn as the
 * Ranking rows are: the global rank, a 40pt cover, the title over "{year} ·
 * {genre}", the score on the right.
 *
 * - A ranked row has no background and no handle; a blank column the
 *   handle's width keeps the scores in one column.
 * - A new row sits on `brand/text` at 12% (an underlay, so the color token
 *   stays a token; the text value so the tint still shows on the dark canvas),
 *   radius 8, and carries the `≡` handle at the end. Ranked
 *   rows share its padding without the fill, so the columns align.
 * - A provisional row (`placedBy: 'prior'`) shows "≈ {score}" in place of the
 *   badge: the guess placed it, and it says so (guidelines, principle 10).
 * - A collapsed stretch is one row, "· · ·  {k} more  · · ·", that expands in
 *   place on tap.
 *
 * The handle is the only place a drag starts, and only on a new row: the
 * ranked rows' order belongs to the Ranking tab. VoiceOver cannot drag, so a
 * new row also offers "Move up" and "Move down" as accessibility actions.
 */

import type { Tier } from '@verso/core';
import { StyleSheet, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { useT } from '@/lib/i18n';
import { Cover, ScoreBadge, Text, TierChip, TIER_LABELS, useTheme } from '@/ui';

import { scoreText } from '../../log/game';
import { gameSubtitle, type SessionGame } from './games';
import type { ReviewToken } from './review-model';

/** The handle's touch target, which is also the blank column on a ranked row. */
const HANDLE_SIZE = 44;
const COVER_WIDTH = 40;

type RowToken = Extract<ReviewToken, { kind: 'row' }>;
type StretchToken = Extract<ReviewToken, { kind: 'stretch' }>;

export interface ReviewRowProps {
  token: RowToken;
  game: SessionGame | undefined;
  /** Off once Done has started writing: a row must not move under a write. */
  movable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
}

export function ReviewRow({ token, game, movable, canMoveUp, canMoveDown, onMove }: ReviewRowProps) {
  const t = useT();
  const theme = useTheme();
  const title = game?.title ?? '';
  const subtitle = game ? gameSubtitle(game) : null;
  const draggable = token.isNew && movable;

  const score = token.provisional
    ? t('onboarding.review.placedAbout', { score: scoreText(token.score) })
    : scoreText(token.score);
  const label = t(token.isNew ? 'onboarding.review.rowLabelNew' : 'onboarding.review.rowLabel', {
    rank: token.rank,
    title,
    score,
  });

  const actions = draggable
    ? [
        ...(canMoveUp ? [{ name: 'moveUp', label: t('onboarding.review.moveUp') }] : []),
        ...(canMoveDown ? [{ name: 'moveDown', label: t('onboarding.review.moveDown') }] : []),
      ]
    : [];

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityActions={actions}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'moveUp') onMove(-1);
        if (event.nativeEvent.actionName === 'moveDown') onMove(1);
      }}
      style={[styles.row, { gap: theme.space[3] }]}>
      {token.isNew ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: theme.colors['brand/text'] }]}
        />
      ) : null}

      <Text size={17} weight={700} color="text/secondary" align="right" numberOfLines={1} layout={styles.rank}>
        {token.rank}
      </Text>
      <Cover width={COVER_WIDTH} radius={6} candidates={game?.candidates ?? []} />
      <View style={[styles.text, { gap: 2 }]}>
        <Text size={16} weight={500} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text size={13} color="text/secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {token.provisional ? (
        <Text size={15} weight={600} color="text/secondary">
          ≈ {scoreText(token.score)}
        </Text>
      ) : (
        <ScoreBadge score={token.score} />
      )}

      {draggable ? (
        <Sortable.Handle>
          <View accessibilityLabel={t('onboarding.review.drag', { title })} style={styles.handle}>
            <Text size={16} color="text/secondary">
              ≡
            </Text>
          </View>
        </Sortable.Handle>
      ) : (
        <View style={styles.handle} />
      )}
    </View>
  );
}

/** A run of ranked rows folded into one: tap to see them. */
export function StretchRow({ token, onExpand }: { token: StretchToken; onExpand: () => void }) {
  const t = useT();
  const count = token.ids.length;

  return (
    <Sortable.Touchable
      accessibilityRole="button"
      accessibilityLabel={t('onboarding.review.stretchLabel', { count })}
      onTap={onExpand}>
      <View style={styles.stretch}>
        <Text size={13} color="text/secondary" align="center">
          {t('onboarding.review.stretch', { count })}
        </Text>
      </View>
    </Sortable.Touchable>
  );
}

/**
 * The tier's divider: the `TierChip` (its icon and words), then a hairline to the
 * edge (specs/batch-session.md: "the `TierChip` and a hairline").
 */
export function ReviewDivider({ tier }: { tier: Tier }) {
  const t = useT();
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t(TIER_LABELS[tier])}
      style={[styles.divider, { gap: 10, paddingTop: theme.space[4], paddingBottom: theme.space[2] }]}>
      <TierChip tier={tier} />
      <View style={[styles.hairline, { backgroundColor: theme.colors['border/separator'] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // The new row's fill box; ranked rows share it so the columns align.
    paddingVertical: 6,
    paddingLeft: 8,
    borderRadius: 8,
  },
  fill: { opacity: 0.12, borderRadius: 8 },
  rank: { width: 28 },
  text: { flex: 1, minWidth: 0 },
  // 44 by 44, glyph centred; the row's right padding is the handle's own.
  handle: { width: HANDLE_SIZE, height: HANDLE_SIZE, alignItems: 'center', justifyContent: 'center' },
  stretch: { minHeight: HANDLE_SIZE, justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center' },
  hairline: { flex: 1, height: StyleSheet.hairlineWidth },
});
