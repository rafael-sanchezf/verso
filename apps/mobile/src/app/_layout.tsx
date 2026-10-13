/**
 * The root layout: fonts, theme, the query cache, the session gate, every
 * route in the app registered with the presentation it should get, and the
 * one `DialogHost` that draws `alert`, `showDialog` and `select` on web.
 *
 * The shell owns this file; each screen's branch owns its own route files. A
 * screen that needs a different presentation says so in its PR rather than
 * editing here, because this file is the one place that knows the whole map
 * and seven parallel screen branches editing it is seven conflicts.
 */

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
// Bold Italic for one use: the variable part of a movies Home row title (decision 28).
import { Inter_700Bold_Italic } from '@expo-google-fonts/inter/700Bold_Italic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '@/global.css';
import { useT } from '@/lib/i18n';
import { usePasswordRecovery } from '@/lib/password-recovery';
import { useAppOpenEvent } from '@/lib/use-app-open-event';
import { useSession } from '@/lib/use-session';
import { useOnboardingGate } from '@/screens/onboarding/use-onboarding-gate';
import { DialogHost } from '@/ui/dialog';
import { navigationThemeFor } from '@/ui/navigation-theme';
import { useTheme } from '@/ui/theme';

// Held until the fonts are in and Supabase has finished reading the stored
// session, so nobody sees the signed-out screen flash past on a cold start.
void SplashScreen.preventAutoHideAsync();

/**
 * One cache for the app.
 *
 * Created at module scope, not in the component: Expo Router remounts the root
 * layout on a fast refresh and on some navigation state changes, and a client
 * created in render would throw the whole cache away each time.
 *
 * `staleTime` of 30 seconds is the difference between "the user came back to a
 * tab" and "the user has been away". Below it, a tab switch shows what is
 * already there; above it, the tab refetches in the background while showing
 * the old data. Writes invalidate explicitly (see `src/lib/invalidate.ts`), so
 * this only governs the passive case.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * The sheets in the route map, and the detents each one opens at.
 *
 * Fractions of the screen, taken from where the frames put each sheet's top
 * edge. Every one can be dragged taller, because the keyboard takes half the
 * screen on a small phone and a sheet that cannot grow puts its own save button
 * under the keyboard. The hours sheet is a single field and sizes itself.
 */
const FORM_SHEETS: { name: string; detents: number[] | 'fitToContents' }[] = [
  { name: 'add/[id]', detents: [0.45, 0.9] },
  { name: 'log/[id]', detents: [0.45, 1] },
  { name: 'game/[id]/hours', detents: 'fitToContents' },
  { name: 'game/[id]/details', detents: [0.6, 0.95] },
  { name: 'game/[id]/platforms', detents: [0.5, 0.9] },
];

export default function RootLayout() {
  const t = useT();
  const theme = useTheme();
  const session = useSession();

  // Opening a password-reset link signs the user in, which would otherwise send
  // them straight past the step where they type the new password. While this is
  // set the gate keeps the app on the sign-in screen; see lib/password-recovery.
  const recovering = usePasswordRecovery();
  const sessionIn = session.status === 'signed-in' && !recovering;

  // The onboarding gate (specs/onboarding.md, "Routes"): a profile with no
  // media is a new user, who gets the onboarding stack instead of the tabs.
  // Until the profile answers, a signed-in user is not routed: the splash
  // holds on a cold start, and just after signing in the sign-in screen stays
  // up for that one read, so Home never flashes past on the way to the
  // questionnaire. screens/onboarding/gate.ts has the rule.
  const gate = useOnboardingGate(queryClient, sessionIn);
  const signedIn = sessionIn && gate.routed;
  const signedOut = session.status === 'signed-out' || recovering || (sessionIn && !gate.routed);

  // `app_open`, once per calendar day, for the funnel (onboarding.md, "Events").
  useAppOpenEvent(sessionIn && session.status === 'signed-in' ? session.user.id : null);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_700Bold_Italic,
  });

  // A missing font is not worth a blank app: the system face is wrong but
  // legible, and the alternative is a splash screen that never goes away.
  const fontsSettled = fontsLoaded || fontError !== null;

  // `hideAsync` after the first paint rather than during it, so the splash
  // hands over to a drawn screen instead of to a blank frame.
  const [painted, setPainted] = useState(false);
  // On a cold start the gate's profile read is waited for under the splash;
  // once painted, the tree never unmounts for it again.
  const ready = fontsSettled && session.status !== 'loading' && (painted || !sessionIn || gate.routed);
  useEffect(() => {
    if (ready && painted) void SplashScreen.hideAsync();
  }, [ready, painted]);

  if (!ready) return null;

  return (
    // Gesture Handler needs a root view above everything that uses it: the drag
    // to reorder on Ranking and Next, and the sheets' own drag.
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={() => setPainted(true)}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navigationThemeFor(theme)}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            {/*
              The gate. `loading` never reaches here — the splash is still up —
              so these two cover every state the app can be rendered in, and
              Expo Router moves between them when the session changes rather
              than a screen having to redirect.
            */}
            <Stack.Protected guard={signedIn}>
              {/*
                No tabs for a new user yet: with them removed, the first route
                left is the onboarding stack, which opens on Media. Once Media
                stores the answer the tabs come back, and the stack ends there.
              */}
              <Stack.Protected guard={!gate.newUser}>
                <Stack.Screen name="(tabs)" />
              </Stack.Protected>

              {/*
                The onboarding (specs/onboarding.md): the new user's stack, and
                the returning user's deck through Ranking's door, pushed over
                the tabs. Its own layout hides the header and the swipe back.
              */}
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />

              {/* Pushed over the tabs, so the tab bar is gone (specs/game-page.md). */}
              <Stack.Screen
                name="game/[id]/index"
                options={{ headerShown: true, headerTransparent: false, title: '' }}
              />
              {/* The movie page, pushed over the tabs like the game page (movies-build.md, PR 2). */}
              <Stack.Screen
                name="movie/[id]/index"
                options={{ headerShown: true, headerTransparent: false, title: '' }}
              />
              {/* A movies Home row's "See all": the row's films as a grid (movies-build.md, PR 7). */}
              <Stack.Screen
                name="home/row"
                options={{ headerShown: true, headerTransparent: false, title: '' }}
              />
              <Stack.Screen name="settings" options={{ headerShown: true, title: t('settings.title') }} />
              {/*
                The joint Profile's two pushed pages (movies-build.md, PR 5):
                Recent's calendar and Edit profile, each with the native back
                to Profile; each screen sets its own title and right button.
              */}
              <Stack.Screen
                name="profile/activity"
                options={{ headerShown: true, headerTransparent: false, title: '' }}
              />
              <Stack.Screen
                name="profile/edit"
                options={{ headerShown: true, headerTransparent: false, title: '' }}
              />
              {/* Pushed from Settings → Data. Its own screen, not a sheet: the review list is long and dragged. */}
              <Stack.Screen name="import/letterboxd" options={{ headerShown: true, title: 'Letterboxd' }} />

              {/*
                Settings → Steam and the two screens it pushes (specs/steam.md),
                inside the gate so `verso://settings/steam` signed out resolves
                to sign-in like every other signed-in route. `steam/linked` is
                the link's return on a cold start; it redirects to
                `settings/steam` and draws nothing of its own.
              */}
              <Stack.Screen name="settings/steam/index" options={{ headerShown: true, title: 'Steam' }} />
              <Stack.Screen
                name="settings/steam/privacy"
                options={{ headerShown: true, title: 'Steam privacy' }}
              />
              <Stack.Screen
                name="settings/steam/candidates"
                options={{ headerShown: true, title: 'From Steam' }}
              />
              <Stack.Screen name="steam/linked" />

              {/*
                The ask (movies-build.md, PR 3): the question, the trace and the
                picks, full height over the tabs, opened by Home's button. Its
                own close at the top left; no grabber, no header.
              */}
              <Stack.Screen name="ask" options={{ presentation: 'fullScreenModal' }} />

              {FORM_SHEETS.map(({ name, detents }) => (
                <Stack.Screen
                  key={name}
                  name={name}
                  options={{
                    presentation: 'formSheet',
                    sheetAllowedDetents: detents,
                    sheetGrabberVisible: true,
                    sheetCornerRadius: theme.radius.xl,
                    headerShown: false,
                  }}
                />
              ))}
            </Stack.Protected>

            <Stack.Protected guard={signedOut}>
              <Stack.Screen name="(auth)/sign-in" />
            </Stack.Protected>

            {/*
              Where a browser comes back to from Google and the auth emails.
              Outside the gate, because whether there is a session is what
              these pages find out; they finish the sign-in and replace
              themselves with `/`, and the gate takes it from there. Web
              only in practice: on native `+native-intent.tsx` keeps both
              paths off the router, so nothing ever navigates here.
            */}
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="auth/recovery" />

            {/*
              Outside the session gate on purpose: the primitive gallery is a
              development tool, and needing an account to look at a button
              would defeat it. Which is exactly why it needs a gate of its own
              — otherwise `verso://preview` is a door into a shipped app that
              opens without an account. `Stack.Protected` removes the route
              rather than hiding it, so in a release build the URL resolves to
              nothing at all, the same way a signed-out `verso://game/<id>`
              resolves to the sign-in screen.
            */}
            <Stack.Protected guard={__DEV__}>
              <Stack.Screen
                name="preview"
                options={{
                  headerShown: true,
                  title: 'Primitives',
                  // Whatever route it was opened from, the back label would be
                  // that route's name — "(auth)/sign-in" and the like. Just the
                  // chevron.
                  headerBackButtonDisplayMode: 'minimal',
                }}
              />
              {/* The ask sheet's four states on fixtures, for a browser with no stack (screens/ask). */}
              <Stack.Screen name="ask-preview" />
              {/* The joint Profile's screens on fixtures (screens/profile); Activity and Edit turn the header on. */}
              <Stack.Screen name="preview-profile" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>

          {/*
            Outside the Stack so a dialog opens over whichever route asked,
            sheets included; inside the providers so it has the theme and the
            safe-area insets. Draws nothing on native, where `alert` is the
            platform's own.
          */}
          <DialogHost />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
