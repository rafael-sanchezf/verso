/**
 * Link Steam (specs/onboarding.md, "Link Steam", frame 136:153), for PC
 * players only, after the review: imports accelerate, they do not gate
 * (guidelines principle 9), so this comes after the deck has done its work and
 * "Not now" is a real button of the same size.
 *
 * "Link Steam" is the Steam folder's own flow (`LinkSteamButton`, PR #71).
 * On a linked return the import runs at once and its answer moves this screen
 * on, through the same exported screens Settings → Steam uses, with their
 * exits pointed at the tabs: the games the import found (`SteamCandidatesScreen`),
 * or the privacy checklist when Steam is not sharing (`SteamPrivacyScreen`).
 * A rate limit, a lost link or a failure stays here as one line with a retry.
 *
 * The step decides for itself whether it applies, the same rule the review
 * uses to send the user here (gate.ts, `offersSteam`): a player without PC, or
 * with a link already, goes straight on. Every way out ends the games path
 * (flow.ts): Home, or the movies path when both were picked. No header and
 * no `x`.
 */

import { getMyProfile } from '@verso/api';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import {
  LinkSteamButton,
  SteamCandidatesScreen,
  SteamPrivacyScreen,
  useSteamAccount,
  useSteamImport,
} from '@/screens/steam';
import { Button, ErrorLine, Icon, Text, useTheme } from '@/ui';

import { offersSteam } from './gate';
import { TitleBlock } from './pieces';
import { useFinishPath } from './use-flow';

type Phase = 'offer' | 'importing' | 'privacy' | 'candidates';

export function SteamStepScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const profile = useQuery({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) });
  const link = useSteamAccount();
  const [phase, setPhase] = useState<Phase>('offer');

  // The end of the games path: Home, or the movies path for someone who
  // picked both (flow.ts).
  const finishPath = useFinishPath();
  const toTabs = () => finishPath('game');

  const showCandidates = (playtimeHidden: boolean) => {
    // The candidates screen reads `hidden` off its route, as it does in Settings.
    if (playtimeHidden) router.setParams({ hidden: '1' });
    setPhase('candidates');
  };

  const importer = useSteamImport('steam', (move) => {
    if (move.kind === 'candidates') showCandidates(move.playtimeHidden);
    else setPhase('privacy');
  });

  // Decided once, on arrival: the link this screen makes must not send the
  // user away before its import has run.
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !profile.data || link.data === undefined) return;
    decided.current = true;
    if (!offersSteam(profile.data.platforms, link.data !== null)) finishPath('game');
  }, [profile.data, link.data, finishPath]);

  if (phase === 'privacy') {
    return (
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        <SteamPrivacyScreen onImported={showCandidates} onNotNow={toTabs} />
      </View>
    );
  }

  if (phase === 'candidates') {
    return (
      <View style={[styles.fill, { paddingTop: insets.top + theme.space[2] }]}>
        <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
          <TitleBlock title={t('onboarding.steam.fromSteam')} />
        </View>
        <SteamCandidatesScreen onDone={toTabs} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}
      contentContainerStyle={[
        styles.centre,
        {
          paddingTop: insets.top + theme.space[4],
          paddingBottom: insets.bottom + theme.space[4],
          paddingHorizontal: theme.space[4],
        },
      ]}>
      <View style={[styles.column, { gap: 14 }]}>
        {/* The Steam mark, until the fidelity round supplies it. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.mark, { backgroundColor: theme.colors['bg/placeholder'], borderRadius: theme.radius.md }]}
        />
        <Text size={28} weight={700} align="center" accessibilityRole="header">
          {t('onboarding.steam.title')}
        </Text>
        <Text size={15} color="text/secondary" align="center" layout={styles.body}>
          {t('onboarding.steam.body')}
        </Text>

        <View style={{ gap: theme.space[2], alignSelf: 'stretch' }}>
          <Line icon="list">{t('onboarding.steam.weRead')}</Line>
          <Line icon="shield">{t('onboarding.steam.weNeverRead')}</Line>
        </View>

        <View style={{ gap: theme.space[3], alignSelf: 'stretch', paddingTop: theme.space[2] }}>
          {phase === 'offer' ? (
            <LinkSteamButton
              onLinked={() => {
                setPhase('importing');
                importer.run();
              }}
            />
          ) : importer.pending ? (
            <View style={[styles.importing, { gap: theme.space[2] }]} accessibilityLiveRegion="polite">
              <ActivityIndicator color={theme.colors['text/secondary']} />
              <Text size={15} color="text/secondary">
                {t('onboarding.steam.reading')}
              </Text>
            </View>
          ) : importer.line ? (
            <ErrorLine message={importer.line} onRetry={importer.run} />
          ) : null}
          <Button label={t('onboarding.steam.notNow')} variant="secondary" onPress={toTabs} />
        </View>
      </View>
    </ScrollView>
  );
}

function Line({ icon, children }: { icon: 'list' | 'shield'; children: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.line, { gap: theme.space[2] }]}>
      <View style={styles.lineIcon}>
        <Icon name={icon} size={14} color="text/secondary" />
      </View>
      <Text size={13} color="text/secondary" layout={styles.fill}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  column: { width: '100%', maxWidth: 370, alignItems: 'center' },
  mark: { width: 56, height: 56 },
  body: { maxWidth: 330 },
  line: { flexDirection: 'row', alignItems: 'flex-start' },
  lineIcon: { paddingTop: 2 },
  importing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 50 },
});
