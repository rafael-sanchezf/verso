/**
 * "Link Steam": the button that starts the round trip, and the one line under
 * it when the last attempt failed.
 *
 * Reusable on purpose. The Steam screen in Settings renders it in its
 * not-linked state; the onboarding's "Link Steam" screen (bulk-entry-build.md,
 * PR 4) renders the same component, or calls `useSteamLink` itself when it
 * needs the phases. `onLinked` is how a caller moves on once the database has
 * the link -- the Steam screen needs none, because it draws its linked state
 * from the same query the flow writes.
 *
 * The button says what it is waiting for while it waits ("Opening Steam…",
 * "Waiting for Steam…", "Checking the link…") and ignores taps until the trip is
 * over. A failure is one `ErrorLine` with no Retry: the button above it is the
 * retry, and two ways to do one thing is one too many.
 *
 * On web there is no `verso://` to come back to -- the `steam-link` function
 * redirects to the app's scheme, and the web's redirect is wave W2
 * (web-brief.md) -- so the browser gets a plain line instead of a button that
 * could only fail.
 */

import type { SteamLink } from '@verso/api';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Button, ErrorLine, Text, useTheme } from '@/ui';

import { linkButtonLabel } from './link-flow';
import type { LinkReturn } from './link-return';
import { useSteamLink } from './use-steam-link';

export interface LinkSteamButtonProps {
  /** Called once when a round trip ends with a link in the database. */
  onLinked?: (link: SteamLink) => void;
  /** A cold-start return forwarded by `/steam/linked`; see `useSteamLink`. */
  initialReturn?: LinkReturn | null;
  /** "Link Steam" unless the caller's screen says otherwise. */
  label?: string;
}

export function LinkSteamButton({ onLinked, initialReturn, label }: LinkSteamButtonProps) {
  const theme = useTheme();
  const flow = useSteamLink({ onLinked, initialReturn });

  if (Platform.OS === 'web') {
    return (
      <Text size={15} color="text/secondary">
        Linking Steam works in the phone app for now.
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.space[3] }}>
      <Button
        label={linkButtonLabel(flow.phase, label)}
        disabled={flow.busy}
        onPress={flow.start}
        leading={flow.busy ? <ActivityIndicator color={theme.colors['bg/canvas']} /> : undefined}
      />
      {flow.failure ? <ErrorLine message={flow.failure} /> : null}
    </View>
  );
}
