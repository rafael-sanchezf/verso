/**
 * The theme, and the one way to read it.
 *
 * Values come from `@verso/tokens`, which is generated from the Figma export by
 * `pnpm tokens:build`. Nothing in `src/ui` writes a hex value or a size of its
 * own: if a number is not in here it is either a layout constant from the spec
 * (a cover at IGDB's 264:374, an 8pt gap) or a mistake.
 *
 * Light and dark follow the device, and `useTheme` is `useColorScheme` plus a
 * lookup — so a primitive can read the theme wherever it is mounted, inside a
 * form sheet or a navigation header, without anything having to wrap it. The
 * one provider, `ThemeScope`, exists for the preview gallery, which draws both
 * schemes on one screen; nothing in the app itself uses it.
 */

import { COLOR_TOKENS, FONT_STYLES, darkTheme, lightTheme, type ColorScheme, type Theme } from '@verso/tokens';
import { createContext, use, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type { ColorScheme, ColorToken, FontStyle, RadiusToken, SpaceToken, Theme } from '@verso/tokens';

/** Every token name, in the order Figma lists them. For the preview gallery. */
export { COLOR_TOKENS, FONT_STYLES };

/** The theme for a named scheme. */
export function themeFor(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/**
 * A forced scheme, when something is deliberately not the device's.
 *
 * Null everywhere in the app — the whole point is that light and dark follow
 * the phone. It exists for the preview route, which draws every primitive in
 * both schemes at once, and it is the reason `useTheme` reads a context at all.
 */
const ForcedTheme = createContext<Theme | null>(null);

/** Render a subtree in a named scheme regardless of the device's. */
export function ThemeScope({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  return <ForcedTheme value={themeFor(scheme)}>{children}</ForcedTheme>;
}

/**
 * The theme for the device's current appearance, or the scope's if one is set.
 *
 * `useColorScheme` returns null before the OS has answered, which is a blink at
 * startup rather than a state worth designing for; light is the safer guess
 * because the splash is light.
 */
export function useTheme(): Theme {
  const forced = use(ForcedTheme);
  const device = themeFor(useColorScheme() === 'dark' ? 'dark' : 'light');
  return forced ?? device;
}

/**
 * Inter, as four separate faces.
 *
 * React Native does not synthesize weights for a custom family: asking for
 * `fontFamily: 'Inter'` with `fontWeight: 600` gets the regular face on iOS and
 * a faux-bold on Android. So each weight is its own family name, and
 * `fontWeight` is set as well for the web build, where the browser does the
 * right thing with it.
 */
export const FONT_FAMILIES = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const;

export type FontWeight = keyof typeof FONT_FAMILIES;

/** The weights the app loads, in the order the ramp uses them. */
export const FONT_WEIGHTS = [400, 500, 600, 700] as const satisfies readonly FontWeight[];

/** Narrow an arbitrary number to a loaded weight, falling back to regular. */
export function fontFamilyFor(weight: number): string {
  return FONT_FAMILIES[weight as FontWeight] ?? FONT_FAMILIES[400];
}
