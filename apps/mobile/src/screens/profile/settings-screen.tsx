/**
 * Settings, pushed from Profile: an iOS grouped list, coded from convention
 * per README.md's rule 7 note ("the settings list... coded from iOS
 * conventions... and listed in the PR") since profile.md says the screen is
 * "not drawn".
 *
 * Four sections (profile.md, "Behavior"): Profile (edit display name and
 * username), Account (email, sign out, delete account), Data (the two exports
 * and import), About (app version). A dev build adds a fifth, a link to
 * `/preview`.
 *
 * Since the Steam link screens (specs/steam.md, decision 16), a "Linked
 * accounts" section between Account and Data holds one row, "Steam", which
 * pushes `/settings/steam`. Its own section rather than a row in Data because
 * a link is an account the user connects, not a file they move, and because
 * the platforms that cannot be linked (PlayStation, Nintendo, Xbox) are never
 * mentioned (onboarding-guidelines.md, principle 9), so the section stays one
 * row until another link exists.
 *
 * "Delete account" is not in profile.md either. It is App Store guideline
 * 5.1.1(v) -- an app that creates accounts must let them be deleted from
 * inside the app -- and it sits under Sign out because that is where iOS users
 * look for it and because the two are the same kind of leaving, one of them
 * final. It gets the native confirm alert an irreversible action gets by
 * convention (rule 7), and no re-authentication step: V0 has no password
 * prompt anywhere else, and the phone is already unlocked and holding a
 * session.
 *
 * The native stack header ("Settings", with the back chevron) comes from
 * `app/_layout.tsx`'s `<Stack.Screen name="settings" ... />`, so this screen
 * draws only the list, not its own title bar.
 */

import { deleteMyAccount, signOut } from '@verso/api';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { invalidateAllEntries } from '@/lib/invalidate';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { useTheme } from '@/ui/theme';

import { useProfileIdentity } from './data';
import { EditProfileSheet } from './edit-profile-sheet';
import {
  exportCsv,
  exportJson,
  importErrorMessage,
  importFromFile,
  pickImportFile,
  type PickedFile,
} from './export-import';
import { SettingsSection } from './settings-section';

type Busy = 'json' | 'csv' | 'import' | 'sign-out' | 'delete' | null;

export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const queryClient = useQueryClient();
  const identity = useProfileIdentity();

  const [editVisible, setEditVisible] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  const email = session.status === 'signed-in' ? (session.user.email ?? null) : null;
  const version = Constants.expoConfig?.version ?? '—';

  async function onSignOut() {
    setBusy('sign-out');
    const result = await signOut(supabase);
    setBusy(null);
    if (!result.ok) alert('Could not sign out', result.error.message);
    // On success the session store flips and the root gate swaps back to
    // sign-in; there is nothing for this screen to navigate.
  }

  function onDeleteAccount() {
    alert(
      'Delete your account?',
      'Your rankings, backlog, and profile are removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void runDelete() },
      ],
    );
  }

  async function runDelete() {
    setBusy('delete');
    try {
      await deleteMyAccount(supabase);

      // The account is gone and the session with it, so everything in the
      // cache belongs to a user who no longer exists. Sign out does not clear
      // it today and this is the one path where there is nothing to come back
      // to, so it goes rather than waiting for the next sign-in to overwrite
      // it screen by screen.
      queryClient.clear();

      // Nothing to navigate: `deleteMyAccount` signs the device out, the
      // session store flips, and the root gate swaps to the sign-in screen
      // with this screen underneath it.
    } catch (cause) {
      alert('Could not delete your account', importErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function onExportJson() {
    setBusy('json');
    try {
      await exportJson();
    } catch (cause) {
      alert('Export failed', importErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function onExportCsv() {
    setBusy('csv');
    try {
      await exportCsv();
    } catch (cause) {
      alert('Export failed', importErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function onImport() {
    const picked = await pickImportFile();
    if (!picked) return;

    alert(
      'Import from a file',
      `This adds or overwrites entries in your library from "${picked.name}". Rankings and comparisons in the file are not restored — only entries are.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          style: 'destructive',
          onPress: () => void runImport(picked),
        },
      ],
    );
  }

  async function runImport(picked: PickedFile) {
    setBusy('import');
    try {
      const result = await importFromFile(picked);
      // Import writes many entries at once, not the one `invalidateEntry`
      // expects an id for. `invalidateAllEntries` is that helper's bulk form:
      // the same keys, with `['game']` as a prefix rather than one id. It was
      // three list keys here until Phase 3, which left every already-opened
      // game page, and Search's tracked checks, showing what was true before
      // the file was read.
      invalidateAllEntries(queryClient);

      const unmatchedNote = result.unmatched > 0 ? `, ${result.unmatched} not found in the catalog` : '';
      alert('Import complete', `${result.created} added, ${result.updated} updated${unmatchedNote}.`);
    } catch (cause) {
      alert('Import failed', importErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.fill} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: theme.space[4], gap: theme.space[6] }}>
        <SettingsSection
          title="Profile"
          rows={[
            {
              key: 'edit',
              label: 'Edit profile',
              navigates: true,
              onPress: identity.data ? () => setEditVisible(true) : undefined,
            },
          ]}
        />

        <SettingsSection
          title="Account"
          rows={[
            { key: 'email', label: 'Email', value: email ?? '—' },
            {
              key: 'sign-out',
              label: 'Sign out',
              destructive: true,
              busy: busy === 'sign-out',
              onPress: busy ? undefined : onSignOut,
            },
            {
              key: 'delete-account',
              label: 'Delete account',
              destructive: true,
              busy: busy === 'delete',
              onPress: busy ? undefined : onDeleteAccount,
            },
          ]}
        />

        <SettingsSection
          title="Linked accounts"
          rows={[{ key: 'steam', label: 'Steam', navigates: true, onPress: () => router.push('/settings/steam') }]}
        />

        <SettingsSection
          title="Data"
          rows={[
            {
              key: 'json',
              label: 'Export as JSON',
              navigates: true,
              busy: busy === 'json',
              onPress: busy ? undefined : onExportJson,
            },
            {
              key: 'csv',
              label: 'Export as CSV',
              navigates: true,
              busy: busy === 'csv',
              onPress: busy ? undefined : onExportCsv,
            },
            {
              key: 'import',
              label: 'Import from a file',
              navigates: true,
              busy: busy === 'import',
              onPress: busy ? undefined : onImport,
            },
            {
              key: 'letterboxd',
              label: 'Import from Letterboxd',
              navigates: true,
              onPress: busy ? undefined : () => router.push('/import/letterboxd'),
            },
          ]}
        />

        <SettingsSection title="About" rows={[{ key: 'version', label: 'Version', value: version }]} />

        {__DEV__ ? (
          <SettingsSection
            title="Developer"
            rows={[{ key: 'preview', label: 'Primitives', navigates: true, onPress: () => router.push('/preview') }]}
          />
        ) : null}
      </ScrollView>

      {identity.data ? (
        <EditProfileSheet visible={editVisible} onDismiss={() => setEditVisible(false)} profile={identity.data} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
