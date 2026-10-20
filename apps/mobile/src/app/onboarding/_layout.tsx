/**
 * The onboarding stack (specs/onboarding.md, "Routes"): no tab bar, no native
 * header, and no swipe back on any screen, because each step's way out is a
 * control of its own ("Skip for now", "Not now", the deck's `x`) and a swipe
 * from the session would drop a batch without a word.
 *
 * The order is the new user's: media; the games path (platforms, seeds,
 * deck, then the session and the review, routes from the session's branch
 * which take these defaults without being listed, then Link Steam for PC
 * players); the movies path (services, the seeds and the deck with
 * `?medium=movie`, the session and the review, then the Letterboxd door).
 * Someone who picked both runs the games path, then the movies path
 * (screens/onboarding/flow.ts); an existing account adding a medium from the
 * switcher's "+" or Edit profile is pushed onto that medium's first step over
 * the tabs (VER-198). Media is
 * declared first because it is where the root layout's gate lands a new user;
 * a returning user is pushed straight onto the deck through Ranking's door and
 * goes back from it to Ranking, so no anchor sits under it.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/ui';

export default function OnboardingLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: theme.colors['bg/canvas'] },
      }}>
      <Stack.Screen name="media" />
      <Stack.Screen name="platforms" />
      <Stack.Screen name="seeds" />
      <Stack.Screen name="deck" />
      <Stack.Screen name="steam" />
      <Stack.Screen name="services" />
      <Stack.Screen name="letterboxd" />
    </Stack>
  );
}
