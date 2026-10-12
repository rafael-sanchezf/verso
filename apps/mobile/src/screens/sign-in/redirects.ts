/**
 * Where Supabase sends a person back to after Google, a confirmation email or
 * a reset email.
 *
 * On the phone, the two `verso://` deep links: Google's callback and the
 * sign-up confirmation land on `auth/callback`, the password reset on
 * `auth/recovery`. Written out rather than built with `Linking.createURL`,
 * because each has to match the redirect URL registered in the Supabase
 * dashboard and in `supabase/config.toml` exactly, and `createURL` returns a
 * different string under Expo Go than in a build.
 *
 * In a browser a `verso://` link opens nothing (W0 finding 7: the reset
 * email's link dead-ended), so the same two paths hang off the page's own
 * origin, where `app/auth/callback.tsx` and `app/auth/recovery.tsx` exist as
 * routes on web. Functions rather than constants because the origin is only
 * known at run time: `localhost:8081` under `expo start`, the Vercel preview,
 * the domain. Each origin also has to be on the project's redirect allow-list
 * (`additional_redirect_urls` locally, the dashboard for the hosted project).
 *
 * Kept apart from `google.ts`, which re-exports them, so they can be
 * unit-tested without loading the Supabase client.
 */

import { Platform } from 'react-native';

const NATIVE_CALLBACK = 'verso://auth/callback';
const NATIVE_RECOVERY = 'verso://auth/recovery';

/** The page's origin on web, e.g. `http://localhost:8081`. */
function webOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** Google's callback and the sign-up confirmation link. */
export function oauthRedirect(): string {
  return Platform.OS === 'web' ? `${webOrigin()}/auth/callback` : NATIVE_CALLBACK;
}

/** The password-reset link. */
export function recoveryRedirect(): string {
  return Platform.OS === 'web' ? `${webOrigin()}/auth/recovery` : NATIVE_RECOVERY;
}
