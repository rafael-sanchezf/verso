/**
 * The five tabs.
 *
 * `Tabs` comes from `expo-router/js-tabs` because the `Tabs` re-exported from
 * `expo-router` is deprecated in SDK 57. The bar itself is `TabBar` in
 * `src/ui`, passed as `tabBar`, so it is drawn from tokens in both schemes.
 *
 * Headers are off: each tab draws its own `ScreenHeader` with the large title
 * and the medium chip, which is what the frames show.
 */

import { Tabs } from 'expo-router/js-tabs';

import { useT } from '@/lib/i18n';
import { TABS, TabBar } from '@/ui/tab-bar';

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t(tab.label) }} />
      ))}
    </Tabs>
  );
}
