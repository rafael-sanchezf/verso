/**
 * Is this game on Steam, and which app is it?
 *
 * Two things on this page exist only for Steam games: the review phrase in the
 * score line and the "Playing now" row. Both need the app id out of
 * `media_items.external_ids`, which is jsonb with no shape the database
 * enforces — the mirror writes a number, an import might write the digits as a
 * string, and anything else means "no Steam id" rather than something to
 * coerce.
 *
 * `covers.ts` in `@verso/api` parses the same field for the cover fallback but
 * keeps its parser private, so this is the same rule written once more rather
 * than a primitive reached into. It is pure, so it is tested.
 */

import type { Json } from '@verso/api';

/** The Steam app id in an `external_ids` blob, or null when there is not one. */
export function steamAppId(externalIds: Json): number | null {
  if (typeof externalIds !== 'object' || externalIds === null || Array.isArray(externalIds)) {
    return null;
  }

  const raw = externalIds['steam'];
  const id =
    typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
  if (id === null || !Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

/** `https://store.steampowered.com/app/<id>`, for a game that has one. */
export function steamStoreUrl(appId: number): string {
  return `https://store.steampowered.com/app/${appId}`;
}
