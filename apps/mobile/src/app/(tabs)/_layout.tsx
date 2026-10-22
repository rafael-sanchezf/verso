/**
 * The five tabs.
 *
 * `Tabs` comes from `expo-router/js-tabs` because the `Tabs` re-exported from
 * `expo-router` is deprecated in SDK 57. The bar itself is `TabBar` in
 * `src/ui`, passed as `tabBar`, so it is drawn from tokens in both schemes.
 *
 * Headers are off: each tab draws its own `ScreenHeader` with the large title
 * and the medium chip, which is what the frames show.
 *
 * Where iOS puts its bars on the side (the iPhone Duo's outer display, its
 * inner display in landscape; docs/design/duo-brief.md) the navigator lays the
 * bar out to the right of the screens instead of under them, and `TabBar`
 * draws itself as a rail. `useLayout()` is the one place that decides.
 */

import { Tabs } from 'expo-router/js-tabs';

import { useT } from '@/lib/i18n';
import { useLayout, useReadingInset } from '@/lib/use-layout';
import { TABS, TabBar } from '@/ui/tab-bar';
import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const t = useT();
  const theme = useTheme();
  const { bar } = useLayout();
  // With the bar on the side the status bar is in the column too, so the
  // window's top inset is zero and a large title would touch the edge. Apple's
  // own apps leave a band there (Settings' title sits about 36 points down);
  // this is the same breath, from the spacing scale.
  const sceneStyle = bar === 'side' ? { paddingTop: theme.space[6] } : undefined;
  // In a regular window (the Duo's inner display) the one-column tabs, Search
  // and Profile, are capped at the reading width and centered; Home, Ranking
  // and Next spend the width on their panes and grid (duo-brief.md).
  const readingInset = useReadingInset();
  const reading = readingInset > 0 ? { paddingHorizontal: readingInset } : undefined;
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarPosition: bar === 'side' ? 'right' : 'bottom', sceneStyle }}
      tabBar={(props) => <TabBar {...props} />}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            sceneStyle: tab.name === 'search' || tab.name === 'profile' ? { ...sceneStyle, ...reading } : sceneStyle,
          }}
        />
      ))}
    </Tabs>
  );
}
