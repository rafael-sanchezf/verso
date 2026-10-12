/**
 * Continue with Google.
 *
 * On the phone: ask Supabase for the provider's URL rather than letting it
 * navigate (`skipBrowserRedirect`), open that URL in the system's own auth
 * browser so the session cookie is the real one and the address bar is visible,
 * and take back a one-time code on `verso://auth/callback`. The client is built
 * with `flowType: 'pkce'` (see `lib/supabase.ts`), so the code is worth nothing
 * without the verifier this client is holding — which is what makes it safe to
 * carry a login over a URL scheme any app could claim.
 *
 * `openAuthSessionAsync` usually hands the callback URL straight back. Usually,
 * not always: if iOS decides to hand control to the app through the deep link
 * instead — a cold start, a switch away and back — the browser's promise never
 * resolves with it. So the screen also listens on `Linking` and both paths end
 * up in `completeFromUrl`, which is safe to call twice because the second call
 * finds no code.
 *
 * In a browser the convention is a full-page redirect, not the popup
 * `openAuthSessionAsync` opens there: Supabase navigates the page to Google,
 * Google sends it back to `/auth/callback` on this origin, and the client,
 * which has `detectSessionInUrl` on for web, exchanges the code as the app
 * loads. `app/auth/callback.tsx` then finishes up and goes home.
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { oauthRedirect } from './redirects';

/**
 * The app's one auth callback, `oauthRedirect()`: where Google sends the user
 * back to, and where the sign-up confirmation email's link points.
 *
 * Both land there on purpose. `completeFromUrl` below reads a PKCE `code` and an
 * implicit-flow `access_token` fragment, which is what Google and the
 * confirmation link send respectively, so one URL and one handler cover both.
 * Without it on the sign-up call Supabase falls back to the project's Site URL
 * — still `localhost` — and the confirmation link dead-ends.
 *
 * `recoveryRedirect()` is where the password-reset email sends the user back
 * to. Both are functions of the platform; see `redirects.ts`.
 */
export { oauthRedirect, recoveryRedirect } from './redirects';

/**
 * Close the popup the browser left open after a redirect. Web only, and a no-op
 * everywhere else, but it has to run at module load to catch the case where the
 * page is reloaded into the callback.
 */
WebBrowser.maybeCompleteAuthSession();

export type OAuthOutcome =
  | { status: 'signed-in' }
  /** Web: the page is on its way to Google. Keep the button busy; the page is leaving. */
  | { status: 'redirecting' }
  /** The user closed the browser. Not an error; say nothing. */
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Turn a callback URL into a session.
 *
 * Handles the PKCE code the app asks for, and also the `access_token` in the
 * fragment that an implicit-flow provider or an email link can send instead —
 * a magic link and the recovery link both arrive that way — so one function
 * covers every URL the app can be opened with.
 *
 * Returns null when the URL carries neither, which is the common case: the app
 * is opened by a plain deep link and there is nothing to exchange.
 */
export async function completeFromUrl(url: string): Promise<OAuthOutcome | null> {
  const parsed = Linking.parse(url);
  const params = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;

  const readString = (key: string): string | null => {
    const value = params[key];
    if (typeof value === 'string' && value) return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    // The implicit flow puts its parameters in the fragment, which
    // `Linking.parse` does not read.
    const hash = url.split('#')[1];
    if (!hash) return null;
    return new URLSearchParams(hash).get(key);
  };

  const errorDescription = readString('error_description') ?? readString('error');
  if (errorDescription) return { status: 'error', message: errorDescription };

  const code = readString('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? { status: 'error', message: error.message } : { status: 'signed-in' };
  }

  const accessToken = readString('access_token');
  const refreshToken = readString('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error ? { status: 'error', message: error.message } : { status: 'signed-in' };
  }

  return null;
}

/**
 * Run the whole flow: ask Supabase, open the browser, complete the callback.
 *
 * Until Rafa configures the provider in the Supabase dashboard, the first step
 * fails and its message is what the screen shows. That is the expected state,
 * not a bug in this file.
 */
export async function signInWithGoogle(): Promise<OAuthOutcome> {
  if (Platform.OS === 'web') return redirectToGoogle();

  try {
    const redirectTo = oauthRedirect();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error) return { status: 'error', message: error.message };
    if (!data?.url) return { status: 'error', message: 'Google did not return a sign-in link.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success') {
      return (await completeFromUrl(result.url)) ?? { status: 'cancelled' };
    }

    // 'cancel' is the user dismissing the sheet; 'dismiss' is iOS closing it
    // after the redirect, which can happen when the deep link took over and the
    // Linking listener is about to finish the job.
    return { status: 'cancelled' };
  } catch (cause) {
    return {
      status: 'error',
      message: cause instanceof Error ? cause.message : 'Could not reach Google.',
    };
  }
}

/**
 * The web flow: let Supabase navigate the page.
 *
 * Without `skipBrowserRedirect` supabase-js stores the PKCE verifier and then
 * assigns the provider's URL to `window.location`, so a resolved call means
 * the page is already leaving. The rest happens on `/auth/callback` when the
 * page comes back.
 */
async function redirectToGoogle(): Promise<OAuthOutcome> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirect() },
    });
    return error ? { status: 'error', message: error.message } : { status: 'redirecting' };
  } catch (cause) {
    return {
      status: 'error',
      message: cause instanceof Error ? cause.message : 'Could not reach Google.',
    };
  }
}
