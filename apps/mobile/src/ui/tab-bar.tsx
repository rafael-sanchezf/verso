/**
 * The tab bar, drawn rather than configured.
 *
 * React Navigation's own bar would need most of its parts overridden to match
 * the frames — a 10pt label under a 24pt Lucide icon, the active state carried
 * by weight as well as color, the exact hairline — and iOS 26's NativeTabs
 * (`expo-router/unstable-native-tabs`, which the Expo template used) draws the
 * glass bar with SF Symbols and system colors, which is a different design.
 * Drawing it keeps one set of tokens in charge of everything on screen.
 * NativeTabs stays a live option once the glass look is a decision rather than
 * a default; noted in the PR.
 *
 * The active tab is in the brand text color (rule 32, recolored by decision 29:
 * one brand green, no color per medium); the others are `text/secondary`.
 *
 * On web an item dims under the pointer and draws the focus ring for the
 * keyboard (`interaction.ts`). On the phone an item has no pressed state, as
 * before.
 */

import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT, type TranslationKey } from '@/lib/i18n';
import { MEDIUM_WORDS, useActiveMedium } from '@/state/medium';

import { Icon, type IconName } from './icon';
import { focusRing, isFocusVisible, isHovered, HOVER_OPACITY, type InteractionState } from './interaction';
import { Text } from './text';
import { useTheme } from './theme';

/**
 * The five tabs, in order, with the icon each one gets.
 *
 * Labels are exactly the tab names (rule 8): a tab and its page share a word,
 * so "Next" here is "Up next" as a header and nothing else anywhere. The
 * fourth tab is the medium's own list (rule 18; movies-brief.md, "Tabs for
 * movies"): "Next" for games and "Watchlist" for films, one route that draws
 * either (`app/(tabs)/next.tsx`), the label from the active medium.
 *
 * `label` is a dictionary key (spanish-build.md, wave 2); whoever shows it
 * calls `t`.
 */
export const TABS: readonly { name: string; label: TranslationKey; icon: IconName }[] = [
  { name: 'index', label: 'shell.tabs.home', icon: 'house' },
  { name: 'search', label: 'shell.tabs.search', icon: 'search' },
  { name: 'ranking', label: 'shell.tabs.ranking', icon: 'trophy' },
  { name: 'next', label: 'shell.tabs.next', icon: 'layers' },
  { name: 'profile', label: 'shell.tabs.profile', icon: 'user' },
];

export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const t = useT();
  const theme = useTheme();
  const safeArea = useSafeAreaInsets();
  const { medium } = useActiveMedium();

  // The navigator passes its own insets; fall back to the hook's when it does
  // not (the preview route renders this bar outside a navigator).
  const bottom = insets?.bottom ?? safeArea.bottom;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors['bg/canvas'],
          borderTopColor: theme.colors['border/separator'],
          paddingTop: theme.space[2],
          paddingHorizontal: theme.space[2],
          paddingBottom: bottom,
        },
      ]}>
      {state.routes.map((route, index) => {
        const found = TABS.find((candidate) => candidate.name === route.name);
        if (!found) return null;
        const tab = { ...found, label: t(found.name === 'next' ? MEDIUM_WORDS[medium].listTab : found.label) };

        const focused = state.index === index;
        const { options } = descriptors[route.key] ?? {};

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          // `preventDefault` is how a screen says "I handled this" — scrolling
          // a list to the top on a second tap, for instance.
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options?.tabBarAccessibilityLabel ?? tab.label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={(state: InteractionState) => [
              styles.item,
              { gap: theme.space[1], paddingTop: 2 },
              // The active tab is where you are; only the others answer hover.
              !focused && isHovered(state) && styles.hovered,
              isFocusVisible(state) && focusRing(theme, theme.radius.sm),
            ]}>
            <Icon
              name={tab.icon}
              size={24}
              color={focused ? 'brand/text' : 'text/secondary'}
              strokeWidth={focused ? 2.5 : 2}
            />
            <Text
              size={10}
              weight={focused ? 600 : 400}
              color={focused ? 'brand/text' : 'text/secondary'}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  hovered: { opacity: HOVER_OPACITY },
});
