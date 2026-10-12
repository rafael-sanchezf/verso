/**
 * What the router does with a URL the app was opened by.
 *
 * Only one thing, and only to stop it doing the wrong thing: the two auth
 * callbacks are not routes. `verso://auth/callback` carries Google's PKCE code
 * and the sign-up confirmation, `verso://auth/recovery` carries the
 * password-reset token, and both are read by `completeFromUrl` through the
 * sign-in screen's own `Linking` listener, which is a separate subscription
 * from the router's and still fires. Nothing should be navigated to.
 *
 * Without this the router looks for `app/auth/callback.tsx`, does not find it,
 * and pushes its "Unmatched Route" screen on top of the app — which is what
 * someone sees at the end of a Google sign-in, over the tabs the session gate
 * has just let them into. Verified on the simulator before the fix: signed out,
 * `verso://auth/callback` drew "Page could not be found".
 *
 * Since W1 the two paths are routes after all, for the web build only
 * (`app/auth/callback.tsx` and `app/auth/recovery.tsx`, where a browser lands
 * after Google and the auth emails). This file is native-only, so it still
 * keeps the phone off them: on the phone the sign-in screen's listener does
 * that page's job.
 *
 * Returning a falsy path is expo-router's own way of saying "do not navigate":
 * `subscribe` in `expo-router/build/link/linking.js` calls its listener only
 * `if (href)`, and `getLinkingConfig.js` treats a null initial URL as no deep
 * link at all. Every other URL is passed through untouched.
 *
 * The Steam link's return, `verso://steam/linked`, is half of each. On a warm
 * open a round trip is waiting for it -- `openAuthSessionAsync` or the
 * `Linking` listener in `screens/steam/use-steam-link.ts`, which still fires
 * when this returns null -- so the router stays still rather than pushing a
 * second Steam screen over the one already handling it. On a cold start nothing
 * is waiting, and the URL goes through to `app/steam/linked.tsx`, which
 * forwards the status to `/settings/steam` (`keepsRouterStill`).
 */

import { isAuthLink } from '@/lib/auth-links';
import { keepsRouterStill } from '@/screens/steam/link-return';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (isAuthLink(path)) return null;
  if (keepsRouterStill(path, initial)) return null;
  return path;
}
