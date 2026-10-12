/**
 * Signed out, and every step of getting in.
 *
 * The frame draws the first step only. Everything after it — the password step,
 * creating an account, the confirmation state, the reset — was built plainly by
 * decision (signed-out.md, 2026-09-16) rather than waiting for a Figma pass, so
 * it reuses this sheet and stays as close to the iOS convention as it can.
 *
 * All of it happens inside the one sheet, crossfading, with no navigation push:
 * the cover wall behind never moves, which is what makes the whole thing feel
 * like one surface rather than four screens.
 */

import { signInWithEmail, signUpWithEmail, type AuthError } from '@verso/api';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearPasswordRecovery, usePasswordRecovery } from '@/lib/password-recovery';
import { supabase } from '@/lib/supabase';
import { Button, Text, TextButton } from '@/ui';
import { GoogleMark, VersoMark } from '@/ui/marks';
import { useTheme } from '@/ui/theme';
import { lockupMetrics } from '@/ui/verso-mark';

import { CoverWall } from './cover-wall';
import { authErrorMessage, MIN_PASSWORD_LENGTH } from './errors';
import { Field } from './field';
import { completeFromUrl, oauthRedirect, recoveryRedirect, signInWithGoogle } from './google';

type Step =
  | 'email'
  | 'password'
  /** Signed up, but the project wants the address confirmed first. */
  | 'check-email'
  /** Reset requested; the same layout with different words. */
  | 'check-reset'
  /** Arrived on the recovery link and owes us a new password. */
  | 'new-password';

export function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const recovering = usePasswordRecovery();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery link signs the user in and the gate holds the app here; this
  // is what turns that into a visible step.
  useEffect(() => {
    if (recovering) {
      setStep('new-password');
      setPassword('');
      setError(null);
    }
  }, [recovering]);

  // The other way a provider can hand control back: iOS opens the app on the
  // deep link instead of resolving the browser's promise. `completeFromUrl`
  // finds nothing to do when the browser already handled it.
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    void completeFromUrl(url).then((outcome) => {
      if (outcome?.status === 'error') setError(outcome.message);
    });
  }, [url]);

  const fail = useCallback((authError: AuthError) => setError(authErrorMessage(authError)), []);

  const trimmedEmail = email.trim();
  const canContinue = trimmedEmail.includes('@') && !busy;

  async function onSignIn() {
    setBusy(true);
    setError(null);
    const result = await signInWithEmail(supabase, { email: trimmedEmail, password });
    setBusy(false);
    if (!result.ok) fail(result.error);
    // On success the session store flips and the root gate swaps to the tabs;
    // there is nothing for this screen to navigate.
  }

  async function onCreateAccount() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setBusy(true);
    setError(null);
    // Without a redirect the confirmation link goes to the project's Site URL,
    // which is still localhost, so it dead-ends on whatever computer the person
    // opens their mail on. This reopens the app on the device that signed up,
    // or, in a browser, this site's own callback page.
    const result = await signUpWithEmail(
      supabase,
      { email: trimmedEmail, password },
      { emailRedirectTo: oauthRedirect() },
    );
    setBusy(false);

    if (!result.ok) {
      fail(result.error);
      return;
    }
    // A null session means the project asks for a confirmed address. With one,
    // the gate has already moved on.
    if (!result.data.session) setStep('check-email');
  }

  async function onForgotPassword() {
    setBusy(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: recoveryRedirect(),
    });
    setBusy(false);
    if (resetError) setError(resetError.message);
    else setStep('check-reset');
  }

  async function onSaveNewPassword() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    // The session was already in place; clearing the flag lets the gate through.
    clearPasswordRecovery();
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const outcome = await signInWithGoogle();
    // On web the page is navigating to Google; the button stays busy until it
    // has gone, rather than flicking back for the moment before it does.
    if (outcome.status === 'redirecting') return;
    setBusy(false);
    if (outcome.status === 'error') setError(outcome.message);
  }

  function backToStart() {
    setStep('email');
    setPassword('');
    setError(null);
  }

  return (
    <View style={styles.fill}>
      <CoverWall />

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.bottom}>
          <View style={[styles.sheet, { borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
            {/*
              The sheet is translucent so the covers stay visible through it —
              "translucent blurred sheet over a full-height collage" in
              ui-brief.md. The blur alone is not enough contrast for 17pt text,
              so the canvas color sits over it at 85%.
            */}
            <BlurView
              intensity={40}
              tint={scheme === 'dark' ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors['bg/canvas'], opacity: 0.85 }]}
            />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={{
                paddingTop: theme.space[6],
                paddingHorizontal: theme.space[6],
                paddingBottom: insets.bottom + theme.space[4],
                gap: theme.space[3],
              }}>
              <Animated.View key={step} entering={FadeIn.duration(180)} style={{ gap: theme.space[3] }}>
                {step === 'email' ? (
                  <>
                    <Lockup />
                    <Text size={17} color="text/secondary">
                      Your games, ranked by you.
                    </Text>

                    <Field
                      value={email}
                      onChangeText={setEmail}
                      placeholder="Email"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="next"
                      onSubmitEditing={() => canContinue && setStep('password')}
                      invalid={error !== null}
                    />

                    {error ? <ErrorLine message={error} /> : null}

                    <Button
                      label="Continue with email"
                      disabled={!canContinue}
                      onPress={() => {
                        setError(null);
                        setStep('password');
                      }}
                    />
                    <Button
                      label="Continue with Google"
                      variant="secondary"
                      disabled={busy}
                      onPress={onGoogle}
                      leading={<GoogleMark size={18} />}
                    />
                  </>
                ) : null}

                {step === 'password' ? (
                  <>
                    <View style={[styles.emailLine, { gap: theme.space[2] }]}>
                      <Text size={15} color="text/secondary" numberOfLines={1} layout={styles.grow}>
                        {trimmedEmail}
                      </Text>
                      <TextButton label="Change" onPress={backToStart} />
                    </View>

                    <Field
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Password"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="password"
                      textContentType="password"
                      returnKeyType="go"
                      autoFocus
                      onSubmitEditing={() => void onSignIn()}
                      invalid={error !== null}
                    />

                    {error ? (
                      <ErrorLine message={error} />
                    ) : (
                      <Text size={13} color="text/secondary">
                        New here? Creating an account needs at least {MIN_PASSWORD_LENGTH}{' '}
                        characters.
                      </Text>
                    )}

                    <Button label="Sign in" disabled={busy || !password} onPress={() => void onSignIn()} />
                    <Button
                      label="Create account"
                      variant="secondary"
                      disabled={busy || !password}
                      onPress={() => void onCreateAccount()}
                    />
                    <TextButton
                      label="Forgot password?"
                      color="text/secondary"
                      align="center"
                      disabled={busy}
                      onPress={() => void onForgotPassword()}
                    />
                  </>
                ) : null}

                {step === 'check-email' || step === 'check-reset' ? (
                  <>
                    <Text size={20} weight={600}>
                      Check your email
                    </Text>
                    <Text size={15} color="text/secondary">
                      {step === 'check-email'
                        ? `We sent a confirmation link to ${trimmedEmail}. Open it, then come back and sign in.`
                        : `Check your email for a link to reset your password.`}
                    </Text>
                    <TextButton label="Back to sign in" onPress={backToStart} />
                  </>
                ) : null}

                {step === 'new-password' ? (
                  <>
                    <Text size={20} weight={600}>
                      Set a new password
                    </Text>
                    <Field
                      value={password}
                      onChangeText={setPassword}
                      placeholder="New password"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="go"
                      autoFocus
                      onSubmitEditing={() => void onSaveNewPassword()}
                      invalid={error !== null}
                    />
                    {error ? (
                      <ErrorLine message={error} />
                    ) : (
                      <Text size={13} color="text/secondary">
                        At least {MIN_PASSWORD_LENGTH} characters.
                      </Text>
                    )}
                    <Button
                      label="Save"
                      disabled={busy || !password}
                      onPress={() => void onSaveNewPassword()}
                    />
                  </>
                ) : null}
              </Animated.View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The sheet's title: Verso's mark beside the word, the brand's lockup.
 *
 * The rule is the Figma component `Verso lockup` (238:42) and
 * brand-identity.md: the mark left of the word, a gap of half the mark's
 * width, the mark's apex on the word's baseline. The mark's height follows
 * the word's size (112/104, from the component). The row aligns on
 * `baseline`, and `VersoMark`'s baseline is its apex. One element for
 * assistive tech, read once as "Verso".
 *
 * The word is the wordmark, not the large title it replaced: the title's
 * size, in Inter Semi Bold at -2% and `brand/text`, as the lockup sets it.
 * Side by side at 34 the wordmark reads as one unit with the mark, where the
 * Bold title in `text/primary` outweighed it, white on black most of all.
 */
function Lockup() {
  const theme = useTheme();
  const { markHeight, gap } = lockupMetrics(theme.font['large-title'].fontSize);

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Verso"
      style={[styles.lockup, { gap }]}>
      <VersoMark size={markHeight} />
      <Text style="large-title" weight={600} color="brand/text" tracking={-0.02}>
        Verso
      </Text>
    </View>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <Text size={13} color="text/destructive">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    overflow: 'hidden',
    // The frame's sheet starts around 71% down the screen. It hugs its content
    // rather than being pinned there, because the later steps are taller and a
    // fixed top would either clip them or leave the first step floating.
    maxHeight: '85%',
  },
  emailLine: { flexDirection: 'row', alignItems: 'center' },
  lockup: { flexDirection: 'row', alignItems: 'baseline' },
  grow: { flex: 1 },
});
