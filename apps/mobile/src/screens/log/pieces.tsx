/**
 * The small pieces this flow needs and `@/ui` does not have.
 *
 * `GenreTag`, the cue beside the comparison cards: `Chip` is the pill
 * primitive, but the frame's cue is `bg/placeholder` with a `text/secondary`
 * label at 12 semibold, and `Chip` has neither that fill nor a secondary label.
 *
 * `ProgressDots`, step 2's top-row progress row (specs/log-flow.md, step 2;
 * rule 33): one 6pt dot per expected question, gap 6, filled `text/primary`
 * for each answered one and `border/separator` for the rest. The dropped
 * "1 of ~3" text was also what VoiceOver read, so the row carries the same
 * information as a `progressbar` instead of going silent.
 *
 * `ErrorLine` and `SkeletonBlock` used to live here too — this flow's copies of
 * the two states specs/README.md defines for every screen and the frames never
 * drew. Phase 3 promoted one of each into `@/ui`, where `SkeletonBlock` is
 * called `Skeleton`, and this flow imports them from there.
 */

import { StyleSheet, View, type AccessibilityValue } from 'react-native';

import { Text } from '@/ui';
import { useTheme } from '@/ui/theme';

/** The shared genre between the two games, as a pill under each cover. */
export function GenreTag({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: theme.colors['bg/placeholder'],
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space[2],
          paddingVertical: 3,
        },
      ]}>
      <Text size={12} weight={600} color="text/secondary">
        {label}
      </Text>
    </View>
  );
}

export interface ProgressDotsProps {
  /** `progress(insertion).answered`, which "can't compare" can push past `total`. */
  answered: number;
  /** `progress(insertion).expected`, fixed at `maxQuestions` for the tier: how many dots to draw. */
  total: number;
  /**
   * "Question 2 of 5", built by the caller from `progress(insertion).current`
   * and the nudged `.total` (not this component's own `total`, which is the
   * dot count and does not grow past the estimate the way the label's total
   * does) so VoiceOver never reads a question number past the tilde-total the
   * old counter text used to show.
   */
  accessibilityLabel: string;
  /** `{ min: 0, max: <the nudged total>, now: <current question> }`, same reasoning as above. */
  accessibilityValue: AccessibilityValue;
}

/**
 * The dots row above the tier chip in step 2's top row.
 *
 * The row never draws more dots than `total`, so the fill count is clamped to
 * it rather than letting the row overflow. Visually the dots carry no text;
 * `accessibilityRole="progressbar"` plus the label and value passed in give
 * VoiceOver the same "N of M" information the dropped counter text used to.
 */
export function ProgressDots({ answered, total, accessibilityLabel, accessibilityValue }: ProgressDotsProps) {
  const theme = useTheme();
  const filled = Math.min(answered, total);

  return (
    <View
      style={styles.dots}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityValue}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            { backgroundColor: theme.colors[index < filled ? 'text/primary' : 'border/separator'] },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'center' },
  // 6 and 6: the frame's dot size and gap, not on the spacing scale.
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
