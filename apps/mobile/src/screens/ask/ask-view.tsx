/**
 * The ask sheet, drawn: `Ask · The question` (257:44) and `Ask · The picks`
 * (258:54) on the page `Site round · movies`, in the site's numbers where the
 * two disagree (ask-moment.tsx; movies-build.md, "Rules for every PR").
 *
 * Presentational only: the state comes from `useAsk` (ask-screen.tsx) or, in
 * development, from the fixtures in `app/ask-preview.tsx`, which is how the
 * four states are looked at in a browser without a stack.
 *
 * Motion is the site's, in Reanimated: the question rises, the trace's lines
 * pass one by one with the running one in the brand green, then the label and
 * the three picks rise in. Reanimated's entering animations follow the
 * system's Reduce Motion setting, so under it the screen is simply there.
 */

import { coverCandidates, SUGGEST_SQL_MODEL, type SuggestPick } from '@verso/api';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Cover, ErrorLine, Icon, Pressed, Sheet, Text, TextButton, useTheme } from '@/ui';

import { askChipLabel, askQuestion, picksCaption, summaryLabel, type AskMedium } from './trace';
import type { AskPhase } from './use-ask';

/** How far apart the trace's lines arrive. Three lines fill `TRACE_MIN_MS`. */
const TRACE_STEP_MS = 600;
/** The pick card's poster, the frame's 56. */
const POSTER_WIDTH = 56;

export interface AskViewProps {
  medium: AskMedium;
  note: string;
  onChangeNote: (note: string) => void;
  phase: AskPhase;
  onSend: () => void;
  onClose: () => void;
  onChange: () => void;
  onAnotherThree: () => void;
  onRetry: () => void;
  onOpenPick: (pick: SuggestPick) => void;
  onConsent: (allowed: boolean) => void;
  /** The request carried the person's services, so the caption may say so. */
  onServices: boolean;
  /** Focus the field when the sheet opens. Off in the preview, where the keyboard would cover the states. */
  autoFocus?: boolean;
  /** No entering motion and the whole trace at once: the preview, so a screenshot shows a state settled. */
  still?: boolean;
}

export function AskView(props: AskViewProps) {
  const theme = useTheme();
  const { phase } = props;
  const answered = phase.kind === 'picks' || phase.kind === 'limit' || phase.kind === 'empty';

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <TopRow medium={props.medium} onClose={props.onClose} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[8] }}>
        {answered ? <Answer {...props} /> : <Question {...props} />}
      </ScrollView>

      <ConsentSheet visible={phase.kind === 'consent'} onAnswer={props.onConsent} />
    </SafeAreaView>
  );
}

/** The close at the left, the medium at the right, 44 tall. */
function TopRow({ medium, onClose }: { medium: AskMedium; onClose: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.topRow, { paddingHorizontal: theme.space[4] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={11} onPress={onClose}>
        <Icon name="x" size={22} />
      </Pressable>
      <View
        style={[
          styles.chip,
          { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.pill },
        ]}>
        <Icon name={medium === 'movie' ? 'film' : 'gamepad-2'} size={14} color="brand/text" strokeWidth={2.25} />
        <Text size={13} weight={600}>
          {askChipLabel(medium)}
        </Text>
      </View>
    </View>
  );
}

/** The question, the field and, once sent, the trace. */
function Question({ medium, note, onChangeNote, phase, onSend, onRetry, autoFocus, still }: AskViewProps) {
  const theme = useTheme();
  const thinking = phase.kind === 'thinking';

  return (
    <>
      <Animated.View entering={still ? undefined : FadeInDown.duration(320)}>
        <Text style="large-title" tracking={-0.021} layout={{ marginTop: 14 }} accessibilityRole="header">
          {askQuestion(medium)}
        </Text>
      </Animated.View>

      <Animated.View
        entering={still ? undefined : FadeInDown.duration(320).delay(120)}
        style={[
          styles.field,
          {
            marginTop: 18,
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.lg,
            gap: 10,
          },
        ]}>
        <TextInput
          value={note}
          onChangeText={onChangeNote}
          editable={!thinking}
          autoFocus={autoFocus}
          placeholder={medium === 'movie' ? 'something for the whole family' : 'something to play with a friend'}
          placeholderTextColor={theme.colors['text/secondary']}
          returnKeyType="send"
          onSubmitEditing={onSend}
          maxLength={280}
          accessibilityLabel={askQuestion(medium)}
          selectionColor={theme.colors['brand/text']}
          style={[
            styles.input,
            {
              color: theme.colors['text/primary'],
              fontFamily: 'Inter_400Regular',
              fontSize: 17,
              lineHeight: 22,
            },
            // The browser draws its own focus ring around the field; the
            // surface is the field's edge here.
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          accessibilityState={{ disabled: thinking }}
          disabled={thinking}
          hitSlop={4}
          onPress={onSend}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: theme.colors['brand/primary'] },
            (pressed || thinking) && styles.dim,
          ]}>
          <Icon name="arrow-up" size={20} color="brand/on-primary" strokeWidth={2.5} />
        </Pressable>
      </Animated.View>

      {phase.kind === 'thinking' ? <Trace lines={phase.trace} still={still} /> : null}
      {phase.kind === 'error' ? (
        <ErrorLine message="Couldn't get recommendations." onRetry={onRetry} style={{ marginTop: 18 }} />
      ) : null}
    </>
  );
}

/**
 * The trace: each line arrives on a timer while the function runs, the newest
 * one checked in the brand green as the one running, the others in gray. The
 * last stays green until the answer replaces the whole block.
 */
function Trace({ lines, still }: { lines: readonly string[]; still?: boolean }) {
  const theme = useTheme();
  const [reached, setReached] = useState(still ? lines.length : 1);

  useEffect(() => {
    if (reached >= lines.length) return;
    const timer = setTimeout(() => setReached((count) => count + 1), TRACE_STEP_MS);
    return () => clearTimeout(timer);
  }, [reached, lines.length]);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ marginTop: 18, gap: theme.space[2], paddingHorizontal: theme.space[1] }}>
      {lines.slice(0, reached).map((line, index) => {
        const running = index === reached - 1;
        return (
          <Animated.View key={line} entering={still ? undefined : FadeIn.duration(240)} style={styles.traceRow}>
            <Icon name="check" size={16} strokeWidth={2.5} color={running ? 'brand/text' : 'text/secondary'} />
            <Text style="subheadline">{line}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The collapsed question, then the picks, the limit, or nothing that fits. */
function Answer({ medium, note, phase, onChange, onAnotherThree, onOpenPick, onServices, still }: AskViewProps) {
  const theme = useTheme();

  return (
    <>
      <View style={[styles.summary, { marginTop: 14, gap: theme.space[3] }]}>
        <View
          style={[
            styles.summaryPill,
            { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.pill },
          ]}>
          <Text style="subheadline" numberOfLines={1}>
            {summaryLabel(note)}
          </Text>
        </View>
        <TextButton label="Change" color="brand/text" size={15} weight={400} onPress={onChange} />
      </View>

      {phase.kind === 'empty' ? (
        <Text style="subheadline" color="text/secondary" layout={{ marginTop: 24 }}>
          Nothing on your list fits that yet. Try other words.
        </Text>
      ) : null}

      {phase.kind === 'limit' ? (
        <Animated.View entering={still ? undefined : FadeInDown.duration(320)} style={{ marginTop: 24, gap: theme.space[1] }}>
          <Text style="title-3" accessibilityRole="header">
            That's all for today
          </Text>
          <Text style="subheadline" color="text/secondary">
            You've asked as many times as a day allows. These are the engine's top three, with plain reasons.
          </Text>
        </Animated.View>
      ) : null}

      {phase.kind === 'picks' || phase.kind === 'limit' ? (
        <>
          <Animated.View entering={still ? undefined : FadeIn.duration(240)}>
            <Text style="subheadline" weight={600} color="text/secondary" layout={{ marginTop: 24 }}>
              Our recommendations, with the reason
            </Text>
          </Animated.View>

          <View style={{ marginTop: 10, gap: 10 }}>
            {phase.picks.map((pick, index) => (
              // Keyed by position and id together, so "Another three" rises in afresh.
              <Animated.View key={`${index}-${pick.mediaItemId}`} entering={still ? undefined : FadeInDown.duration(360).delay(80 + index * 90)}>
                <PickCard medium={medium} pick={pick} number={index + 1} onPress={() => onOpenPick(pick)} />
              </Animated.View>
            ))}
          </View>

          <Button
            label={phase.loadingMore ? 'Finding three more…' : phase.exhausted ? 'No more picks for this' : 'Another three'}
            variant="secondary"
            size="compact"
            disabled={phase.loadingMore || phase.exhausted}
            onPress={onAnotherThree}
            style={{ marginTop: theme.space[4] }}
          />
          {phase.moreFailed ? (
            <ErrorLine
              message="Couldn't get three more."
              onRetry={onAnotherThree}
              align="center"
              style={{ marginTop: theme.space[2] }}
            />
          ) : null}
          <Text style="footnote" color="text/secondary" align="center" layout={{ marginTop: theme.space[2] }}>
            {picksCaption(medium, onServices)}
          </Text>
          {__DEV__ && phase.kind === 'picks' && (phase.fallback || phase.modelVersion === SUGGEST_SQL_MODEL || phase.modelVersion === 'plain') ? (
            <Text style="caption" color="text/secondary" align="center" layout={{ marginTop: theme.space[1] }}>
              {`Development: ${phase.modelVersion}${phase.fallback ? ', the model fell back to SQL' : ''}`}
            </Text>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** One pick: the poster, the number in the brand green and the title, the reason. */
function PickCard({
  medium,
  pick,
  number,
  onPress,
}: {
  medium: AskMedium;
  pick: SuggestPick;
  number: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressed
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.lg, padding: 12, gap: 12 },
      ]}>
      <PickPoster medium={medium} coverImageId={pick.coverImageId} />
      <View style={styles.cardText}>
        <View style={[styles.cardTitle, { gap: theme.space[2] }]}>
          <Text style="headline" color="brand/text" layout={styles.number}>
            {String(number)}
          </Text>
          <Text style="headline" layout={styles.shrink}>
            {pick.title}
          </Text>
        </View>
        <Text style="subheadline" color="text/secondary" layout={{ marginTop: 3 }}>
          {pick.reason}
        </Text>
      </View>
    </Pressed>
  );
}

/**
 * The art whole at its own shape (rule 29): a film's TMDB poster at 2:3, a
 * game's cover through `Cover` at IGDB's. The app builds TMDB's image URL from
 * the stored path, which needs no credential (tmdb-setup.md); the Watchlist's
 * `PosterCard` (PR 2) will own this when it lands.
 */
function PickPoster({ medium, coverImageId }: { medium: AskMedium; coverImageId: string | null }) {
  const theme = useTheme();
  if (medium === 'game') {
    return <Cover width={POSTER_WIDTH} radius={6} candidates={coverCandidates({ coverImageId, externalIds: null })} />;
  }
  const uri = tmdbPosterUrl(coverImageId);
  return (
    <View
      style={[
        styles.poster,
        {
          backgroundColor: theme.colors['bg/placeholder'],
          borderColor: theme.colors['border/separator'],
        },
      ]}>
      {uri ? <Image source={{ uri }} style={styles.fillImage} contentFit="cover" transition={120} /> : null}
    </View>
  );
}

/** `w185` is the smallest TMDB size above the card's 56 points at 3x. */
export function tmdbPosterUrl(path: string | null): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  return `https://image.tmdb.org/t/p/w185${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

/**
 * The permission step (decision 24, Apple 5.1.2(i)): what leaves the device
 * and to whom, before the first call that sends it. "Not now" does not block:
 * the picks come from the plain path with the engine's own reasons.
 */
function ConsentSheet({ visible, onAnswer }: { visible: boolean; onAnswer: (allowed: boolean) => void }) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onDismiss={() => onAnswer(false)} dismissOnBackdropPress={false}>
      <View style={{ gap: theme.space[3], paddingTop: theme.space[2] }}>
        <Text style="title-3" accessibilityRole="header">
          Before your first recommendation
        </Text>
        <Text style="subheadline" color="text/secondary">
          To write the reason behind each pick, Verso sends your question, your ranked list and your notes to an AI
          model. Not now still shows picks, with plainer reasons.
        </Text>
        <View style={{ gap: theme.space[2], marginTop: theme.space[2] }}>
          <Button label="Allow" onPress={() => onAnswer(true)} />
          <Button label="Not now" variant="secondary" onPress={() => onAnswer(false)} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5 },
  field: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 16, paddingRight: 8 },
  input: { flex: 1, minHeight: 36, paddingVertical: 0 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
  traceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryPill: { flexShrink: 1, paddingVertical: 8, paddingHorizontal: 12 },
  card: { flexDirection: 'row', alignItems: 'flex-start' },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { flexDirection: 'row', alignItems: 'baseline' },
  number: { fontVariant: ['tabular-nums'] },
  shrink: { flexShrink: 1 },
  poster: {
    width: POSTER_WIDTH,
    height: (POSTER_WIDTH * 3) / 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  fillImage: { width: '100%', height: '100%' },
});
