/**
 * The page a browser lands on after Google, a confirmation email or a reset
 * email: `/auth/callback` and `/auth/recovery`.
 *
 * On the phone those two URLs are deep links the app is opened with and never
 * routes (`+native-intent.tsx` keeps them off the router). On web they are
 * where Supabase sends the page back to (`redirects.ts`), and without a route
 * they drew Expo Router's "Unmatched Route" (W0 finding 7).
 *
 * The work is mostly done before this renders: the Supabase client has
 * `detectSessionInUrl` on for web, so as the page loads it exchanges the PKCE
 * code in the URL for a session and takes the code out of the address bar. A
 * reset link's exchange announces `PASSWORD_RECOVERY`, which
 * `lib/password-recovery.ts` turns into the gate holding the app on the
 * new-password step. What is left here:
 *
 * 1. Wait for the client to finish that (`getSession` waits on its start-up).
 * 2. `completeFromUrl` on what is still in the URL: an implicit-flow fragment
 *    the PKCE client declines to read, or an `error_description` from the
 *    provider, which is worth showing. A URL with nothing left is null, the
 *    common case.
 * 3. One tick, so an already-scheduled `PASSWORD_RECOVERY` has been delivered,
 *    then replace this page with where the gate would put the person: Home
 *    when signed in, the sign-in screen otherwise (on the new-password step
 *    after a reset link). Named outright rather than `/` for everyone, because
 *    while signed out `/` is a protected route and replacing to it does
 *    nothing; the page just stays (found driving it in a headless browser).
 *
 * The routes are registered outside the session gate, because whether there
 * is a session is what this page is finding out.
 */

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { usePasswordRecovery } from '@/lib/password-recovery';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { Text, TextButton, useTheme } from '@/ui';

import { completeFromUrl } from './google';

export function AuthReturnScreen() {
  // Unreachable on native, where the router never navigates to these paths;
  // home rather than a blank screen if something ever does.
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <WebAuthReturn />;
}

function WebAuthReturn() {
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const recovering = usePasswordRecovery();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The gate's own rule (app/_layout.tsx), so this lands where it would.
  const signedIn = session.status === 'signed-in' && !recovering;
  const destination = signedIn ? '/' : '/sign-in';

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await supabase.auth.getSession();
      const outcome = await completeFromUrl(window.location.href);
      if (cancelled) return;

      if (outcome?.status === 'error') {
        setError(outcome.message);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!cancelled) setDone(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (done && session.status !== 'loading') return <Redirect href={destination} />;

  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: theme.colors['bg/canvas'], padding: theme.space[6], gap: theme.space[3] },
      ]}>
      {error ? (
        <>
          <Text style="subheadline" color="text/secondary" align="center" accessibilityRole="alert">
            {error}
          </Text>
          <TextButton
            label={signedIn ? 'Continue' : 'Back to sign in'}
            onPress={() => router.replace(destination)}
          />
        </>
      ) : (
        <Text style="subheadline" color="text/secondary" align="center">
          Signing you in…
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
