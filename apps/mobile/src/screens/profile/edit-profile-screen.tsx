/**
 * Edit profile (frame 267:168; profile-brief, Edit profile; movies-build.md,
 * PR 5, item 3), pushed from Profile's Edit pill, "Set your name" and
 * Settings → Edit profile.
 *
 * The photo with "Change photo" (uploaded at once: the picker is its own
 * confirmation); then a form saved together by "Save" in the header: Name,
 * Username with the rule as a hint and the database's refusal inline, Media
 * you track (decision 25's "add a medium" door; TV and Books "Coming"), and
 * Public profile, off by default, a flag nothing reads until the public page
 * ships (the build's default 6).
 */

import { updateMyProfile, UsernameError } from '@verso/api';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { invalidateProfile, invalidateProfileSettings } from '@/lib/invalidate';
import { supabase } from '@/lib/supabase';
import { LIVE_MEDIA } from '@/state/medium';
import { ErrorLine, Icon, Skeleton, Text, textStyles } from '@/ui';
import { fontFamilyFor, useTheme } from '@/ui/theme';

import { ProfileAvatar } from './avatar';
import { useProfileIdentity, useRefetchProfileOnFocus } from './data';
import { editFormFrom, editPatch, initialsFor, MEDIUM_KEYS, toggleMedium, type EditForm } from './model';
import { pickAndUploadAvatar } from './photo';
import { Separator } from './settings-row';

export function EditProfileScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  useRefetchProfileOnFocus();
  const identity = useProfileIdentity();
  const profile = identity.data ?? null;

  const [form, setForm] = useState<EditForm | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Seed the form once, from the first profile that arrives; a refetch after
  // the photo changes must not wipe what was typed.
  const seeded = useRef(false);
  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    setForm(editFormFrom(profile));
  }, [profile]);

  const update = (change: Partial<EditForm>) => setForm((current) => (current ? { ...current, ...change } : current));

  async function onSave() {
    if (!profile || !form || saving) return;
    const patch = editPatch(profile, form);
    if (!patch) {
      router.back();
      return;
    }
    setSaving(true);
    setUsernameError(null);
    try {
      await updateMyProfile(supabase, patch);
      // The patch can change the tracked media, which decide Profile's sections.
      invalidateProfileSettings(queryClient);
      router.back();
    } catch (cause) {
      // The kind, not the message: @verso/api words its refusal in English.
      if (cause instanceof UsernameError) {
        setUsernameError(t(cause.kind === 'username-taken' ? 'profile.edit.usernameTaken' : 'profile.edit.usernameInvalid'));
      } else {
        alert(t('profile.edit.couldNotSave'), t('profile.edit.checkConnection'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function onChangePhoto() {
    if (uploading) return;
    setUploading(true);
    try {
      const updated = await pickAndUploadAvatar();
      if (updated) invalidateProfile(queryClient);
    } catch (cause) {
      if (__DEV__) console.warn('Change photo failed', cause);
      alert(t('profile.edit.couldNotChangePhoto'), t('profile.edit.couldNotChangePhotoBody'));
    } finally {
      setUploading(false);
    }
  }

  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerBackTitle: t('profile.edit.back'),
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: !form || saving }}
            disabled={!form || saving}
            hitSlop={10}
            onPress={onSave}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
            {saving ? (
              <ActivityIndicator />
            ) : (
              <Text size={17} weight={600} color="brand/text">
                {t('common.save')}
              </Text>
            )}
          </Pressable>
        ),
      }}
    />
  );

  if (!profile || !form) {
    return (
      <SafeAreaView style={styles.fill} edges={['bottom']}>
        {header}
        <View style={{ padding: theme.space[4], gap: 16, alignItems: 'center' }}>
          {identity.isError ? (
            <ErrorLine message={t('profile.edit.somethingWentWrong')} onRetry={() => void identity.refetch()} />
          ) : (
            <>
              <Skeleton width={96} height={96} radius={48} />
              <Skeleton width="100%" height={96} radius={12} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const inputStyle = [
    styles.input,
    { color: theme.colors['text/primary'], fontFamily: fontFamilyFor(400) },
  ];

  return (
    <SafeAreaView style={styles.fill} edges={['bottom']}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.space[4], gap: 24, paddingBottom: theme.space[10] }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <ProfileAvatar avatarUrl={profile.avatarUrl} initials={initialsFor(profile)} size={96} />
          <Pressable
            accessibilityRole="button"
            disabled={uploading}
            hitSlop={10}
            onPress={onChangePhoto}
            style={({ pressed }) => [styles.row, { gap: 8 }, pressed ? styles.pressed : undefined]}>
            {uploading ? <ActivityIndicator /> : null}
            <Text size={15} color="brand/text">
              {uploading ? t('profile.edit.uploading') : t('profile.edit.changePhoto')}
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: 8 }}>
          <Group>
            <Row label={t('profile.edit.name')}>
              <TextInput
                value={form.name}
                onChangeText={(name) => update({ name })}
                placeholder={t('profile.edit.namePlaceholder')}
                placeholderTextColor={theme.colors['text/secondary']}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={40}
                textAlign="right"
                accessibilityLabel={t('profile.edit.name')}
                editable={!saving}
                style={inputStyle}
              />
            </Row>
            <Separator />
            <Row label={t('profile.edit.username')}>
              <TextInput
                // Drawn with its "@" as the frame does; the "@" is never part of the value.
                value={form.username ? `@${form.username}` : ''}
                onChangeText={(text) => {
                  update({ username: text.replace(/^@+/, '') });
                  setUsernameError(null);
                }}
                placeholder={t('profile.edit.usernamePlaceholder')}
                placeholderTextColor={theme.colors['text/secondary']}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                maxLength={25}
                textAlign="right"
                accessibilityLabel={t('profile.edit.username')}
                editable={!saving}
                style={inputStyle}
              />
            </Row>
          </Group>
          {usernameError ? (
            <Text size={13} color="text/destructive" layout={styles.hint}>
              {usernameError}
            </Text>
          ) : null}
          <Text size={13} color="text/secondary" layout={styles.hint}>
            {t('profile.edit.usernameHint')}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text size={13} weight={600} color="text/secondary" layout={styles.hint}>
            {t('profile.edit.mediaYouTrack')}
          </Text>
          <Group>
            {LIVE_MEDIA.map((medium) => {
              const checked = form.media.includes(medium);
              const onlyOne = checked && form.media.length === 1;
              return (
                <View key={medium}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: onlyOne }}
                    accessibilityHint={onlyOne ? t('profile.edit.atLeastOne') : undefined}
                    onPress={() => update({ media: toggleMedium(form.media, medium) })}
                    style={({ pressed }) => (pressed && !onlyOne ? styles.pressed : undefined)}>
                    <Row label={t(MEDIUM_KEYS[medium])}>
                      {checked ? <Icon name="check" size={18} color="brand/text" /> : null}
                    </Row>
                  </Pressable>
                  <Separator />
                </View>
              );
            })}
            <Row label={t('profile.edit.tv')}>
              <Text size={15} color="text/secondary">
                {t('profile.edit.coming')}
              </Text>
            </Row>
            <Separator />
            <Row label={t('profile.edit.books')}>
              <Text size={15} color="text/secondary">
                {t('profile.edit.coming')}
              </Text>
            </Row>
          </Group>
        </View>

        <View style={{ gap: 8 }}>
          <Group>
            <Row label={t('profile.edit.publicProfile')}>
              <Switch
                value={form.isPublic}
                onValueChange={(isPublic) => update({ isPublic })}
                trackColor={{ true: theme.colors['brand/primary'] }}
                accessibilityLabel={t('profile.edit.publicProfile')}
                disabled={saving}
              />
            </Row>
          </Group>
          <Text size={13} color="text/secondary" layout={styles.hint}>
            {t('profile.edit.publicHint')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.md, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, styles.between, { paddingHorizontal: theme.space[4], minHeight: 46, gap: 12 }]}>
      <Text size={17}>{label}</Text>
      <View style={[styles.row, textStyles.fill, styles.end]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  end: { justifyContent: 'flex-end' },
  input: { flex: 1, fontSize: 17, paddingVertical: 12 },
  hint: { paddingHorizontal: 16 },
  pressed: { opacity: 0.7 },
});
