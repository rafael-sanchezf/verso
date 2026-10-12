/**
 * `/steam/linked` — where the `steam-link` Edge Function sends the browser back
 * to (`verso://steam/linked?status=ok`, or `?status=error&reason=<code>`).
 *
 * Usually nothing navigates here. On a warm open the round trip that is
 * waiting for this URL hears it through the auth session or its own `Linking`
 * listener, and `+native-intent.tsx` keeps the router still so a second Steam
 * screen is not pushed over the first. This route is for the case where
 * nothing is waiting: a cold start (Android can keep the browser tab alive
 * after the app's process has gone), and the web build once its redirect
 * exists (web-brief.md, W2). It forwards the status to `/settings/steam`, which
 * reads the link and shows what happened, and replaces itself so back does not
 * land on an empty page.
 *
 * Inside the session gate (`app/_layout.tsx`): signed out, the URL resolves to
 * the sign-in screen like every other signed-in route.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SteamLinkedRoute() {
  const { status, reason } = useLocalSearchParams<{ status?: string; reason?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/settings/steam',
        params: {
          status: status ?? 'error',
          ...(reason ? { reason } : {}),
        },
      }}
    />
  );
}
