/**
 * The two deep links that are not routes.
 *
 * `verso://auth/callback` (Google, and the sign-up confirmation email) and
 * `verso://auth/recovery` (the password-reset email) are URLs the app is opened
 * *with*, not places inside it. Nothing draws them: `completeFromUrl` in
 * `screens/sign-in/google.ts` turns the code or the token fragment into a
 * session, the session gate in `app/_layout.tsx` notices, and the right screen
 * appears by itself.
 *
 * Expo Router does not know that. It treats every incoming URL as a path to
 * navigate to, finds no `app/auth/callback.tsx`, and renders its "Unmatched
 * Route — page could not be found" screen, which is what a person sees after
 * signing in with Google. `app/+native-intent.tsx` is the supported place to
 * say "this URL is not a route"; this is the test it asks.
 *
 * Kept apart from `+native-intent.tsx` itself so it can be unit-tested: that
 * file is a router entry point, this is a string function.
 */

/** The paths the app is opened with and never navigates to. */
const AUTH_LINK_PATHS = ['auth/callback', 'auth/recovery'] as const;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The path part of a URL, without scheme, query, fragment or wrapping slashes.
 *
 * A custom scheme puts the first segment in the host position —
 * `verso://auth/callback` parses as host `auth`, path `/callback` — so this
 * deliberately does not use a URL parser and treats everything after the
 * scheme as one path.
 */
function normalize(path: string): string {
  const withoutScheme = path.replace(SCHEME, '');
  const withoutQuery = withoutScheme.split('?')[0]!.split('#')[0]!;
  return withoutQuery.replace(/^\/+|\/+$/g, '');
}

/**
 * Is this URL one of the auth callbacks?
 *
 * Matched on the end of the path rather than the whole of it, so the Expo Go
 * form (`exp://127.0.0.1:8081/--/auth/callback`) and a bare path
 * (`/auth/callback`) are recognised as readily as `verso://auth/callback`. No
 * route in the app ends in either name, so there is nothing for it to shadow.
 */
export function isAuthLink(path: string): boolean {
  const normalized = normalize(path);
  return AUTH_LINK_PATHS.some(
    (authPath) => normalized === authPath || normalized.endsWith(`/${authPath}`),
  );
}
