/**
 * The placeholder every route starts as.
 *
 * The shell registers all fourteen routes so the navigation graph, the
 * presentations and the deep links are real and testable before a single screen
 * exists — a form sheet that opens at the wrong detent is easier to fix now
 * than after seven screen branches have built on top of it. Each screen's
 * branch replaces its own file; anything still showing this is a screen nobody
 * has built.
 *
 * It names the route and the file rather than saying "coming soon", because the
 * audience for this screen is whoever is about to replace it.
 */

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './text';
import { useTheme } from './theme';

export interface NotBuiltYetProps {
  /** The screen's name, as the route map writes it. */
  name: string;
  /** Who owns it, and anything a reader needs to know (params, for instance). */
  detail?: string;
}

export function NotBuiltYet({ name, detail }: NotBuiltYetProps) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      <View style={[styles.center, { padding: theme.space[6], gap: theme.space[2] }]}>
        <Text style="title-2" align="center">
          {name}
        </Text>
        <Text size={15} color="text/secondary" align="center">
          not built yet
        </Text>
        {detail ? (
          <Text size={13} color="text/secondary" align="center">
            {detail}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
