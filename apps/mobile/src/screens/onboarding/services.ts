/**
 * Services' rules (movies-build.md, PR 6, item 2; frame 285:68): which tiles
 * show and in what order, the picks, and the region.
 *
 * The grid is ten tiles: the services the onboarding brief names (Netflix,
 * HBO Max, Hulu, Disney+, Prime Video, Apple TV, Paramount+, Peacock,
 * Criterion) that the region's directory lists, by JustWatch's priority, then
 * the region's others by priority to fill nine, and "More" as the tenth,
 * which opens the region's full list in place. A region with ten or fewer
 * shows them all and no "More". The services are matched by name, because
 * TMDB's provider ids are not ours to hard-code and its names are stable
 * ("Max" and "HBO Max" both read as HBO Max's tile).
 *
 * The region is read from the device and confirmed in one line ("United
 * States · Change"). Change offers the regions this file lists by name, with
 * the device's own first when it is not one of them.
 *
 * No React and no `react-native` import (`test/onboarding-services.test.ts`).
 */

import type { WatchProvider } from '@verso/api';

import type { TranslationKey } from './sentence';

/** The grid's size, "More" included. */
export const SERVICE_TILES = 10;

/**
 * The named services, in the brief's order, each with the name the frame
 * prints (the services' own short names: HBO Max, Apple TV, Prime Video, as
 * the movies onboarding round's judgment call 7 has them). A provider matches
 * the first pattern its TMDB name fits.
 */
export const NAMED_SERVICES: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /^netflix$/i, label: 'Netflix' },
  { pattern: /^(hbo )?max$/i, label: 'HBO Max' },
  { pattern: /^hulu$/i, label: 'Hulu' },
  { pattern: /^disney( plus|\+)$/i, label: 'Disney+' },
  { pattern: /^(amazon )?prime video$/i, label: 'Prime Video' },
  // Apple TV+ only: TMDB's plain "Apple TV" is the rent-and-buy store.
  { pattern: /^apple tv( plus|\+)$/i, label: 'Apple TV' },
  { pattern: /^paramount( plus|\+)$/i, label: 'Paramount+' },
  { pattern: /^peacock( premium)?$/i, label: 'Peacock' },
  { pattern: /^(the )?criterion channel$/i, label: 'Criterion' },
];

function namedService(name: string) {
  const trimmed = name.trim();
  return NAMED_SERVICES.find(({ pattern }) => pattern.test(trimmed));
}

export function isNamedService(name: string): boolean {
  return namedService(name) !== undefined;
}

/** A tile's name: the frame's short name for a named service, TMDB's otherwise. */
export function serviceLabel(name: string): string {
  return namedService(name)?.label ?? name.trim();
}

/**
 * The tiles to draw, and whether "More" is one of them. The named services
 * first, then the rest, each part in the directory's priority order (the
 * order `watchProviders` returns).
 */
export function serviceTiles(
  providers: readonly WatchProvider[],
  expanded: boolean,
): { tiles: WatchProvider[]; more: boolean } {
  const byPriority = [...providers].sort((a, b) => a.priority - b.priority || a.providerId - b.providerId);
  // One tile per name: the first by this order keeps it (the subscription
  // over a store of the same name, "Apple TV+" over "Apple TV").
  const seen = new Set<string>();
  const ordered = [
    ...byPriority.filter((provider) => isNamedService(provider.name)),
    ...byPriority.filter((provider) => !isNamedService(provider.name)),
  ].filter((provider) => {
    const label = serviceLabel(provider.name).toLowerCase();
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
  if (expanded || ordered.length <= SERVICE_TILES) return { tiles: ordered, more: false };
  return { tiles: ordered.slice(0, SERVICE_TILES - 1), more: true };
}

/** A tap on a tile. */
export function toggleService(picked: ReadonlySet<number>, providerId: number): Set<number> {
  const next = new Set(picked);
  if (next.has(providerId)) next.delete(providerId);
  else next.add(providerId);
  return next;
}

/**
 * What Continue stores: the picked services the region lists, in the grid's
 * order. A pick from another region (picked, then the region changed) is
 * dropped, since nothing would ever show it.
 */
export function servicesToStore(picked: ReadonlySet<number>, providers: readonly WatchProvider[]): number[] {
  return serviceTiles(providers, true)
    .tiles.map((provider) => provider.providerId)
    .filter((id) => picked.has(id));
}

/** The regions Change offers, by name. The TMDB mirror stores US alone today. */
export const REGIONS = ['US', 'CA', 'MX', 'GB', 'ES', 'AR', 'BR', 'CL', 'CO', 'PE', 'FR', 'DE', 'IT', 'AU', 'IN', 'JP'] as const;

export type NamedRegion = (typeof REGIONS)[number];

export function isNamedRegion(code: string): code is NamedRegion {
  return (REGIONS as readonly string[]).includes(code);
}

/** The device's region as the profile stores it: two capitals, else US. */
export function deviceRegion(regionCode: string | null | undefined): string {
  const code = (regionCode ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'US';
}

/** The region's name as a dictionary key, or null for a region this file does not name (shown as its code). */
export function regionName(code: string): TranslationKey | null {
  return isNamedRegion(code) ? (`onboarding.services.regions.${code}` as TranslationKey) : null;
}

/** The choices Change offers: the current region first when it is not named, then the named ones. */
export function regionChoices(current: string): string[] {
  return isNamedRegion(current) ? [...REGIONS] : [current, ...REGIONS];
}
