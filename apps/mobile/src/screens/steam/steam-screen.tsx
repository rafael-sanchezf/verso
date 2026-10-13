/**
 * Settings → Steam: link the account, import the library, unlink.
 *
 * Coded from conventions without a Figma pass (decision 16), as an iOS grouped
 * list in Settings' own pieces (`SettingsSection` from the profile folder), so
 * it reads as a page of Settings rather than as a new kind of screen. Two
 * states, decided by `getSteamLink`:
 *
 * - **Not linked.** The two lines bulk-entry-build.md gives, in the
 *   onboarding guidelines' voice -- what is read, what never is, and that it
 *   undoes -- then "Link Steam" (`LinkSteamButton`) and nothing pre-selected:
 *   there are no options to pre-select, and nothing is imported until the
 *   user asks for it on the next state.
 * - **Linked.** Steam account: the SteamID64 (the link stores no persona name,
 *   and nothing in the backend reads one), a link to that profile on Steam so
 *   the user can see which account it is, and "Unlink" in destructive red with
 *   the native confirm, the way Settings' Account section holds Sign out.
 *   Library: when the last import started and how it went, "Import library",
 *   and, once an import has run, the games it found. Then Valve's attribution.
 *
 * "When it was linked" is not shown: `platform_links` has no column for it
 * (the steam-link function writes the id and `sync_status = 'linked'` and
 * nothing else), and adding one is a migration this PR has no stack for. "Last
 * import" is the date the table does keep.
 *
 * An import's answer moves the user on (the candidates, or the privacy
 * checklist) or stays here as one line with a Retry (use-steam-import.ts).
 *
 * The native header ("Steam", back to Settings) comes from `app/_layout.tsx`.
 */

import type { SteamLink } from '@verso/api';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { SettingsSection } from '@/screens/profile/settings-section';
import { ErrorLine, Skeleton, Text, useTheme } from '@/ui';

import { SteamAttribution } from './attribution';
import { hasImported, lastImportText, steamProfileUrl } from './import-outcome';
import { linkReturnFromParams } from './link-return';
import { LinkSteamButton } from './link-steam-button';
import { useSteamImport, type ImportMove } from './use-steam-import';
import { useSteamAccount, useUnlinkSteam } from './use-steam-link';

export function SteamScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; reason?: string }>();
  const account = useSteamAccount();

  const body = (() => {
    if (account.isPending) return <Loading />;
    if (account.isError) {
      return (
        <ErrorLine message={t('profile.steam.couldNotLoadLink')} onRetry={() => void account.refetch()} />
      );
    }
    if (account.data === null) {
      return <NotLinked initialReturn={linkReturnFromParams(params.status, params.reason)} />;
    }
    return <Linked link={account.data} onMove={(move) => openMove(router, move)} />;
  })();

  return (
    <SafeAreaView style={styles.fill} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: theme.space[4], gap: theme.space[6] }}>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Where an import sends the user from here: pushed, so back returns to this screen. */
function openMove(router: ReturnType<typeof useRouter>, move: ImportMove) {
  if (move.kind === 'privacy') {
    router.push('/settings/steam/privacy');
    return;
  }
  router.push({
    pathname: '/settings/steam/candidates',
    params: move.playtimeHidden ? { hidden: '1' } : {},
  });
}

function Loading() {
  const t = useT();
  const theme = useTheme();

  return (
    <View accessibilityLabel={t('profile.steam.loading')} style={{ gap: theme.space[6] }}>
      <Skeleton height={132} radius={theme.radius.md} />
      <Skeleton height={132} radius={theme.radius.md} />
    </View>
  );
}

function NotLinked({ initialReturn }: { initialReturn: ReturnType<typeof linkReturnFromParams> }) {
  const t = useT();
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space[6] }}>
      <View style={{ gap: theme.space[3] }}>
        <Text size={17}>{t('profile.steam.notLinkedLead')}</Text>
        <Text size={15} color="text/secondary">
          {t('profile.steam.notLinkedNever')}
        </Text>
      </View>

      <LinkSteamButton initialReturn={initialReturn} />
    </View>
  );
}

function Linked({ link, onMove }: { link: SteamLink; onMove: (move: ImportMove) => void }) {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const unlink = useUnlinkSteam();
  const importer = useSteamImport('steam', onMove);
  const busy = unlink.isPending || importer.pending;

  function confirmUnlink() {
    alert(t('profile.steam.unlinkTitle'), t('profile.steam.unlinkMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.steam.unlink'),
        style: 'destructive',
        onPress: () =>
          unlink.mutate(undefined, {
            onError: () => alert(t('profile.steam.couldNotUnlink'), t('profile.steam.checkConnection')),
          }),
      },
    ]);
  }

  return (
    <>
      <SettingsSection
        title={t('profile.steam.account')}
        rows={[
          { key: 'id', label: t('profile.steam.steamId'), value: link.steamId },
          {
            key: 'profile',
            label: t('profile.steam.openProfile'),
            navigates: true,
            onPress: () => void Linking.openURL(steamProfileUrl(link.steamId)),
          },
          {
            key: 'unlink',
            label: t('profile.steam.unlink'),
            destructive: true,
            busy: unlink.isPending,
            onPress: busy ? undefined : confirmUnlink,
          },
        ]}
      />

      <View style={{ gap: theme.space[2] }}>
        <SettingsSection
          title={t('profile.steam.library')}
          rows={[
            { key: 'last', label: t('profile.steam.lastImport'), value: lastImportText(link, t) },
            {
              key: 'import',
              label: t('profile.steam.importLibrary'),
              navigates: true,
              busy: importer.pending,
              onPress: busy ? undefined : importer.run,
            },
            ...(hasImported(link)
              ? [
                  {
                    key: 'games',
                    label: t('profile.steam.gamesToAdd'),
                    navigates: true,
                    onPress: () => router.push('/settings/steam/candidates'),
                  },
                ]
              : []),
          ]}
        />
        {/* What the import reads and what it does not do, under the button that runs it. */}
        <Text size={13} color="text/secondary">
          {t('profile.steam.importNote')}
        </Text>
      </View>

      {importer.line ? <ErrorLine message={importer.line} onRetry={importer.run} /> : null}

      <SteamAttribution />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
