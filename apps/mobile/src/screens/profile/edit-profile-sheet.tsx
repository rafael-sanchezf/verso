/**
 * Settings → Profile → Edit profile: display name and username, through
 * `updateMyProfile` (profile.md, "Behavior").
 *
 * An in-screen `Sheet`, not a route: the route map (README.md) registers no
 * sheet for this, and the profile screens' branch owns only `profile.tsx` and
 * `settings.tsx` — adding a new form-sheet route means editing
 * `app/_layout.tsx`, which belongs to the shell.
 *
 * The username is sent exactly as typed, not lowercased on the way out:
 * `updateMyProfile`'s own doc comment is explicit that the case is left alone
 * on purpose, "so a username typed with a capital comes back as
 * `username-invalid` rather than being silently lowercased into something the
 * user did not choose."
 */

import { updateMyProfile, UsernameError, type Profile } from '@verso/api';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Button, Sheet, Text, TextButton } from '@/ui';
import { useTheme } from '@/ui/theme';

import { Field } from './field';

export interface EditProfileSheetProps {
  visible: boolean;
  onDismiss: () => void;
  profile: Profile;
}

export function EditProfileSheet({ visible, onDismiss, profile }: EditProfileSheetProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed from the latest row each time the sheet opens, so a second visit
  // after a failed save (or after the profile changed elsewhere) starts clean.
  useEffect(() => {
    if (!visible) return;
    setDisplayName(profile.displayName ?? '');
    setUsername(profile.username ?? '');
    setError(null);
  }, [visible, profile.displayName, profile.username]);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      await updateMyProfile(supabase, {
        displayName: displayName.trim() ? displayName.trim() : null,
        username: username.trim() ? username.trim() : null,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.profileMe() });
      onDismiss();
    } catch (cause) {
      setError(cause instanceof UsernameError ? cause.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} dismissOnBackdropPress={!busy}>
      <View style={{ gap: theme.space[4], paddingBottom: theme.space[4] }}>
        <Text style="title-3" align="center">
          Edit profile
        </Text>

        <View style={{ gap: theme.space[2] }}>
          <Text size={13} weight={600} color="text/secondary">
            DISPLAY NAME
          </Text>
          <Field
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
          />
        </View>

        <View style={{ gap: theme.space[2] }}>
          <Text size={13} weight={600} color="text/secondary">
            USERNAME
          </Text>
          <Field
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            invalid={error !== null}
            editable={!busy}
          />
          {error ? (
            <Text size={13} color="text/destructive">
              {error}
            </Text>
          ) : null}
        </View>

        <Button label={busy ? 'Saving…' : 'Save'} onPress={onSave} disabled={busy} />
        <TextButton label="Cancel" onPress={onDismiss} align="center" color="text/secondary" disabled={busy} />
      </View>
    </Sheet>
  );
}
