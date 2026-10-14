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
 * form sheet or a navigation header, without anything having to wrap it. Two
 * providers adjust it: `ThemeScope`, for the preview gallery, which draws both
 * schemes on one screen, and `ElevatedScope`, which the sheets and the dialog
 * put around their content so the surfaces inside them step up with them.
 */

import { COLOR_TOKENS, FONT_STYLES, darkTheme, lightTheme, type ColorScheme, type Theme } from '@verso/tokens';
import { createContext, use, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { elevatedTheme } from './elevated-theme';

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
  const elevated = use(Elevated);
  const device = themeFor(useColorScheme() === 'dark' ? 'dark' : 'light');
  const theme = forced ?? device;
  return elevated ? elevatedTheme(theme) : theme;
}

/**
 * Whether the subtree sits on a sheet or a dialog rather than on the canvas.
 *
 * In dark mode a sheet is `bg/sheet`, #1C1C1E, one step up the neutral ramp
 * from the black canvas (VER-200), and that is also `bg/surface`'s dark value.
 * Left alone, every `bg/surface` fill inside a sheet (a text field, a
 * secondary button, a chip, a segmented control's track) would be the sheet's
 * own color and vanish. iOS answers this with its elevated backgrounds: on a
 * sheet each background moves one step up. This is the same rule on the
 * tokens' ramp, and only the two steps the sheets' contents use move:
 *
 *   bg/canvas   #000000 -> #1C1C1E (bg/sheet), what a "match the background"
 *               fill such as a segmented control's selected segment means here
 *   bg/surface  #1C1C1E -> #2C2C2E (bg/placeholder), the next step up again
 *
 * Light is untouched: `bg/sheet` is the canvas there, so nothing collides.
 */
const Elevated = createContext(false);

/** Put around what a sheet or a dialog draws, inside its `bg/sheet` fill. */
export function ElevatedScope({ children }: { children: ReactNode }) {
  return <Elevated value>{children}</Elevated>;
}

export { elevatedTheme };

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
