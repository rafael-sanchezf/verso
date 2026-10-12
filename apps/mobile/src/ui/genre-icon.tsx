/**
 * A genre as a small Lucide icon, beside its name.
 *
 * Rafa asked for one per genre in the Ranking filter, on its rows and on the
 * active chip (docs/private/phone-feedback.md, entry 3): "RPG ▾" becomes a wand and
 * "RPG ▾". The icon never stands alone. The name is always next to it, so the
 * icon is a way to find a row quickly, not the only thing that says what the
 * row is, and it carries no accessibility label of its own.
 *
 * Which icon a genre gets is decided in `@/lib/format` (`GENRE_ICONS`,
 * `genreIcon`), where it is unit tested, in the same way `platform-icon.tsx`
 * leaves `platformGlyph` to that file. This file only draws.
 */

import { genreIcon } from '@/lib/format';

import { Icon } from './icon';
import type { ColorToken } from './theme';

export interface GenreIconProps {
  /** IGDB's own genre name, e.g. `Role-playing (RPG)`. */
  genre: string;
  /** 16 sits beside the 14pt chip label and the 17pt sheet row. */
  size?: number;
  /** A filled chip passes `bg/canvas`, as it does for its label. */
  color?: ColorToken;
}

/**
 * The genre's icon, or nothing for a genre the app does not name. The filter
 * never offers one of those, so in practice nothing is the empty case of a
 * caller that got its genre from somewhere else.
 */
export function GenreIcon({ genre, size = 16, color = 'text/primary' }: GenreIconProps) {
  const name = genreIcon(genre);
  if (name === null) return null;

  return <Icon name={name} size={size} color={color} />;
}
