/**
 * React Navigation's theme, built from the same tokens as everything else.
 *
 * The navigator draws things this app does not: the screen behind a push, the
 * form sheet's backdrop, the native header on the game page, the back chevron.
 * Left on React Navigation's own light and dark themes those would be iOS
 * system grey and system blue — close enough to be missed in a screenshot and
 * wrong enough to notice on a device next to the Figma file. Deriving them here
 * means the whole surface follows one token file.
 */

import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router';

import type { Theme } from './theme';

export function navigationThemeFor(theme: Theme): NavigationTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      // The brand green is the app's one accent (decision 29), so a back
      // chevron and a native control tint green rather than iOS blue. It is the
      // text value, lifted in dark mode, because these are glyphs on the canvas.
      primary: theme.colors['brand/text'],
      background: theme.colors['bg/canvas'],
      card: theme.colors['bg/canvas'],
      text: theme.colors['text/primary'],
      border: theme.colors['border/separator'],
      // The app's red, not the Didn't-like verdict color.
      notification: theme.colors['text/destructive'],
    },
  };
}
