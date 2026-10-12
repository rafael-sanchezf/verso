/**
 * The privacy checklist: what to change on Steam when an import comes back
 * `private_profile`.
 *
 * Steam answers "what does this account own?" with nothing at all unless the
 * profile's Game details are Public, and with zero hours for every game when
 * "Always keep my total playtime private" is ticked
 * (docs/research/game-data-sources.md 4.3). So three steps, in the order
 * Steam's own pages put them: get to Privacy Settings (Profile, Edit Profile,
 * Privacy Settings, with a link straight there), set Game details to Public,
 * untick the playtime box. Step 2 also says that My profile has to be Public:
 * Steam will not set Game details above the profile's own level, and a user
 * who only changes the one dropdown finds it will not move.
 *
 * Then two real buttons (bulk-entry-build.md): "Try again" runs the import
 * again, "Not now" goes back. Neither is a text link, and neither is the
 * default by being bigger: the primary fill is the one action the screen is
 * for, the secondary sits under it at the same size. A second `private_profile`
 * stays here as one line; a success replaces this screen with the games, so
 * back from them returns to the Steam screen rather than to a checklist that
 * no longer applies. The line has no Retry of its own: "Try again" is right
 * above it.
 *
 * A rate limit is the likely answer to the first "Try again": the import that
 * sent the user here already spent the ten-minute slot (import-outcome.ts).
 * The line says when.
 */

import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorLine, Text, useTheme } from '@/ui';

import { STEAM_PRIVACY_SETTINGS_URL } from './import-outcome';
import { LinkText } from './link-text';
import { useSteamImport } from './use-steam-import';

export interface SteamPrivacyScreenProps {
  /**
   * Where a successful "Try again" goes. Defaults to replacing this screen with
   * `/settings/steam/candidates`; the onboarding (onboarding.md, Link Steam)
   * renders this screen in its own stack and sends it to its own.
   */
  onImported?: (playtimeHidden: boolean) => void;
  /** "Not now". Defaults to back, or to `/settings/steam` with nothing to go back to. */
  onNotNow?: () => void;
}

export function SteamPrivacyScreen({ onImported, onNotNow }: SteamPrivacyScreenProps = {}) {
  const theme = useTheme();
  const router = useRouter();

  const importer = useSteamImport('privacy', (move) => {
    if (move.kind !== 'candidates') return;
    if (onImported) {
      onImported(move.playtimeHidden);
      return;
    }
    router.replace({
      pathname: '/settings/steam/candidates',
      params: move.playtimeHidden ? { hidden: '1' } : {},
    });
  });

  const notNow =
    onNotNow ?? (() => (router.canGoBack() ? router.back() : router.replace('/settings/steam')));

  return (
    <SafeAreaView style={styles.fill} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: theme.space[4], gap: theme.space[6] }}>
        <View style={{ gap: theme.space[2] }}>
          <Text size={22} weight={700} accessibilityRole="header">
            Steam didn't share your games
          </Text>
          <Text size={15} color="text/secondary">
            Steam only shares a library whose Game details are Public. Change three settings on
            Steam, then try again.
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.md,
            overflow: 'hidden',
          }}>
          <Step
            number={1}
            text="On Steam, open your Profile, then Edit Profile, then Privacy Settings."
            link={
              <LinkText
                label="Open Privacy Settings on Steam"
                url={STEAM_PRIVACY_SETTINGS_URL}
                accessibilityLabel="Open Privacy Settings on Steam. Opens Steam."
                weight={600}
              />
            }
          />
          <Separator />
          <Step
            number={2}
            text="Set Game details to Public. My profile has to be Public too, or Steam won't allow it."
          />
          <Separator />
          <Step
            number={3}
            text="Untick “Always keep my total playtime private”, so your hours come with your games."
          />
        </View>

        <View style={{ gap: theme.space[3] }}>
          <Button
            label={importer.pending ? 'Trying again…' : 'Try again'}
            disabled={importer.pending}
            onPress={importer.run}
            leading={importer.pending ? <ActivityIndicator color={theme.colors['bg/canvas']} /> : undefined}
          />
          <Button label="Not now" variant="secondary" onPress={notNow} />
          {importer.line ? <ErrorLine message={importer.line} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * One numbered step: a 24pt `brand/primary` disc with its number, then the
 * words, then an optional link. The disc is hidden from VoiceOver and the
 * number goes into the words' label instead, so the step reads as one sentence
 * ("Step 2. Set Game details to Public…") and the link stays its own stop.
 */
function Step({ number, text, link }: { number: number; text: string; link?: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={[styles.step, { paddingHorizontal: theme.space[4], paddingVertical: 14, gap: theme.space[3] }]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.disc,
          { backgroundColor: theme.colors['brand/primary'], borderRadius: theme.radius.pill },
        ]}>
        <Text size={13} weight={600} color="brand/on-primary">
          {number}
        </Text>
      </View>
      <View style={[styles.words, { gap: theme.space[2] }]}>
        <Text size={15} accessibilityLabel={`Step ${number}. ${text}`}>
          {text}
        </Text>
        {link}
      </View>
    </View>
  );
}

function Separator() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors['border/separator'],
        marginLeft: theme.space[4],
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  disc: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1 },
});
