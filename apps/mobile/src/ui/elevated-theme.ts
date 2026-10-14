/**
 * The theme as it reads on a sheet or a dialog (VER-200).
 *
 * Kept apart from `theme.tsx` so it imports nothing from React Native and the
 * unit tests can hold the rule down. `ElevatedScope` in `theme.tsx` says why
 * these two steps move.
 */

import type { Theme } from '@verso/tokens';

const elevatedThemes = new WeakMap<Theme, Theme>();

/** One step up the ramp in dark, unchanged in light. Cached, so a theme keeps one identity. */
export function elevatedTheme(theme: Theme): Theme {
  if (theme.scheme === 'light') return theme;
  let elevated = elevatedThemes.get(theme);
  if (!elevated) {
    elevated = {
      ...theme,
      colors: {
        ...theme.colors,
        'bg/canvas': theme.colors['bg/sheet'],
        'bg/surface': theme.colors['bg/placeholder'],
      },
    };
    elevatedThemes.set(theme, elevated);
  }
  return elevated;
}
