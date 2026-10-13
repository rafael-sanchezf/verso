/**
 * Where a player plays: the platform picker's families and generations, and
 * the backward-compatibility map behind the deck (docs/feature-ideas.md, idea 1,
 * "The compatibility map, exact" of 2026-09-28 and the third pass of 2026-10-06).
 *
 * Exports:
 *  - `PLATFORM_FAMILIES`: the five families in the order the picker shows them
 *    (PlayStation, Xbox, Nintendo, PC, Mobile), each with its picks. A pick
 *    carries its label exactly as the frame prints it (`PS5`, `Series X|S`,
 *    `Older`) and the IGDB platform names it stands for, spelled as
 *    `game_details.platforms` spells them (the source of truth for the spellings
 *    is the short-name table in apps/mobile/src/lib/format.ts). A family's first
 *    pick is the one the picker selects when the family is tapped; PC has one
 *    pick and asks no generation (`asksGeneration: false`).
 *  - `BACKWARD_COMPATIBILITY`: the exact map, one row per console that plays an
 *    older console's whole library by default. Only these fold in. The partial
 *    cases stay their own picks and are deliberately absent: PS3 on PS4 or PS5,
 *    PS2 on PS3 (early models only), Xbox 360 and the original Xbox on One and
 *    Series (a curated list), GameCube on Wii (early models only).
 *  - `withBackwardCompatible(names)`: a set of IGDB names plus every name the
 *    map folds into them. One pass, not transitive: a console plays the library
 *    the map names, not that library's own predecessors.
 *  - `expandPlatforms(picks)`: the IGDB names a set of picks covers, folds
 *    applied, in the table's order. What `profiles.platforms` stores and what
 *    `deck_candidates` filters on.
 *  - `platformPick(id)`: one pick by id.
 *  - `platformFamilyLabel(id, language)` and `platformPickLabel(id, language)`:
 *    the labels in the person's language. The labels in `PLATFORM_FAMILIES`
 *    are the English ones; names stay names in Spanish, and only the words
 *    change (`Older` is `Anteriores`, `Mobile` is `Celular`).
 *
 * Backward compatibility is assumed, never shown (decision 27): the chips read
 * `PS5`, not "PS5 · with PS4 games", and a player who skipped the PS4 simply
 * skips those cards in the deck.
 *
 * "Older" is the family's remaining platforms: every name in the family that no
 * named pick stands for. PC is Windows, Mac and Linux together; a Steam Deck is
 * PC (IGDB lists no Steam Deck platform; its library is the PC one). Classics
 * played through Nintendo Switch Online or the PlayStation classics catalog are
 * catalogued by IGDB under their original platform, so they come with "Older",
 * not with the current console.
 *
 * A platform the table does not name (Sega, the Quests, the rarer Nintendo
 * hardware IGDB lists) belongs to no pick; adding one is one line here.
 */

import type { Language } from './language';

export type PlatformFamilyId = 'playstation' | 'xbox' | 'nintendo' | 'pc' | 'mobile';

export type PlatformPickId =
  | 'ps5'
  | 'ps4'
  | 'ps3'
  | 'playstation-older'
  | 'xbox-series'
  | 'xbox-one'
  | 'xbox-360'
  | 'xbox-older'
  | 'switch-2'
  | 'switch'
  | 'wii-u'
  | '3ds'
  | 'nintendo-older'
  | 'pc'
  | 'ios'
  | 'android';

/** One chip under a family tile, or the PC tile itself. */
export interface PlatformPick {
  id: PlatformPickId;
  family: PlatformFamilyId;
  /** The chip's label as the frame prints it. */
  label: string;
  /** The IGDB platform names this pick stands for, before any fold. */
  platforms: readonly string[];
}

/** One family tile and the generations it reveals when tapped. */
export interface PlatformFamilyGroup {
  id: PlatformFamilyId;
  label: string;
  /** False for PC, which asks nothing further: the tile is the pick. */
  asksGeneration: boolean;
  /** In the order the chips are drawn; the first is selected when the family is tapped. */
  picks: readonly PlatformPick[];
}

function family(
  id: PlatformFamilyId,
  label: string,
  asksGeneration: boolean,
  picks: readonly (readonly [PlatformPickId, string, readonly string[]])[],
): PlatformFamilyGroup {
  return {
    id,
    label,
    asksGeneration,
    picks: picks.map(([pickId, pickLabel, platforms]) => ({
      id: pickId,
      family: id,
      label: pickLabel,
      platforms,
    })),
  };
}

export const PLATFORM_FAMILIES: readonly PlatformFamilyGroup[] = [
  family('playstation', 'PlayStation', true, [
    ['ps5', 'PS5', ['PlayStation 5']],
    ['ps4', 'PS4', ['PlayStation 4']],
    ['ps3', 'PS3', ['PlayStation 3']],
    [
      'playstation-older',
      'Older',
      [
        'PlayStation 2',
        'PlayStation',
        'PlayStation Portable',
        'PlayStation Vita',
        'PlayStation VR',
        'PlayStation VR2',
      ],
    ],
  ]),
  family('xbox', 'Xbox', true, [
    ['xbox-series', 'Series X|S', ['Xbox Series X|S']],
    ['xbox-one', 'One', ['Xbox One']],
    ['xbox-360', '360', ['Xbox 360']],
    ['xbox-older', 'Older', ['Xbox']],
  ]),
  family('nintendo', 'Nintendo', true, [
    ['switch-2', 'Switch 2', ['Nintendo Switch 2']],
    ['switch', 'Switch', ['Nintendo Switch']],
    ['wii-u', 'Wii U', ['Wii U']],
    ['3ds', '3DS', ['Nintendo 3DS', 'New Nintendo 3DS']],
    [
      'nintendo-older',
      'Older',
      [
        'Wii',
        'Nintendo DS',
        'Nintendo DSi',
        'Nintendo GameCube',
        'Nintendo 64',
        'Game Boy Advance',
        'Game Boy Color',
        'Game Boy',
        'Super Nintendo Entertainment System',
        'Super Famicom',
        'Nintendo Entertainment System',
        'Family Computer',
      ],
    ],
  ]),
  family('pc', 'PC', false, [['pc', 'PC', ['PC (Microsoft Windows)', 'Mac', 'Linux']]]),
  family('mobile', 'Mobile', true, [
    ['ios', 'iOS', ['iOS']],
    ['android', 'Android', ['Android']],
  ]),
];

/**
 * The labels in another language (docs/design/spanish-build.md, wave 7). Only
 * the words: a console's name reads the same in every language, so a pick or a
 * family missing here prints its English label, which is its name. The ids and
 * the English labels above stay the identity the picker stores and compares.
 */
const FAMILY_LABELS: Readonly<Record<Exclude<Language, 'en'>, Partial<Record<PlatformFamilyId, string>>>> = {
  // Apple's Latin American Spanish says celular, never móvil.
  es: { mobile: 'Celular' },
};

const PICK_LABELS: Readonly<Record<Exclude<Language, 'en'>, Partial<Record<PlatformPickId, string>>>> = {
  es: {
    'playstation-older': 'Anteriores',
    'xbox-older': 'Anteriores',
    'nintendo-older': 'Anteriores',
  },
};

/** A family's tile label in a language: `Mobile`, `Celular`; `PlayStation` in both. */
export function platformFamilyLabel(id: PlatformFamilyId, language: Language = 'en'): string {
  const english = familyGroup(id).label;
  return language === 'en' ? english : (FAMILY_LABELS[language][id] ?? english);
}

/** A pick's chip label in a language: `Older`, `Anteriores`; `PS5` in both. */
export function platformPickLabel(id: PlatformPickId, language: Language = 'en'): string {
  const english = platformPick(id).label;
  return language === 'en' ? english : (PICK_LABELS[language][id] ?? english);
}

function familyGroup(id: PlatformFamilyId): PlatformFamilyGroup {
  const group = PLATFORM_FAMILIES.find((f) => f.id === id);
  if (!group) throw new Error(`unknown platform family: ${id}`);
  return group;
}

/** One row of the map: a console and the older libraries it plays by default. */
export interface CompatibilityRow {
  platform: string;
  plays: readonly string[];
}

/**
 * The exact map of 2026-09-28. The DSi rides with the DS: it is a DS model, and
 * a 3DS plays its cartridges. The New 3DS is a 3DS, so it has the 3DS's row.
 */
export const BACKWARD_COMPATIBILITY: readonly CompatibilityRow[] = [
  { platform: 'PlayStation 5', plays: ['PlayStation 4'] },
  { platform: 'Xbox Series X|S', plays: ['Xbox One'] },
  { platform: 'Nintendo Switch 2', plays: ['Nintendo Switch'] },
  { platform: 'Wii U', plays: ['Wii'] },
  { platform: 'Nintendo 3DS', plays: ['Nintendo DS', 'Nintendo DSi'] },
  { platform: 'New Nintendo 3DS', plays: ['Nintendo DS', 'Nintendo DSi'] },
  { platform: 'PlayStation 2', plays: ['PlayStation'] },
];

const PICKS_BY_ID: ReadonlyMap<PlatformPickId, PlatformPick> = new Map(
  PLATFORM_FAMILIES.flatMap((f) => f.picks).map((p) => [p.id, p]),
);

/** Every name the table carries, in table order: the order every output follows. */
const TABLE_ORDER: ReadonlyMap<string, number> = new Map(
  PLATFORM_FAMILIES.flatMap((f) => f.picks.flatMap((p) => p.platforms)).map((name, i) => [name, i]),
);

const PLAYS: ReadonlyMap<string, readonly string[]> = new Map(
  BACKWARD_COMPATIBILITY.map((row) => [row.platform, row.plays]),
);

export function platformPick(id: PlatformPickId): PlatformPick {
  const pick = PICKS_BY_ID.get(id);
  if (!pick) throw new Error(`unknown platform pick: ${id}`);
  return pick;
}

/**
 * The names given plus every name the map folds into them, without
 * duplicates. Names the table knows come out in table order; any other name
 * keeps its place after them, in the order given.
 */
export function withBackwardCompatible(names: Iterable<string>): string[] {
  const given = [...names];
  const out = new Set<string>();
  for (const name of given) {
    out.add(name);
    for (const older of PLAYS.get(name) ?? []) out.add(older);
  }
  const known = [...out].filter((n) => TABLE_ORDER.has(n));
  const unknown = [...out].filter((n) => !TABLE_ORDER.has(n));
  known.sort((a, b) => TABLE_ORDER.get(a)! - TABLE_ORDER.get(b)!);
  return [...known, ...unknown];
}

/** The IGDB names a set of picks covers, folds applied, in table order. */
export function expandPlatforms(picks: Iterable<PlatformPickId>): string[] {
  const names: string[] = [];
  for (const id of picks) names.push(...platformPick(id).platforms);
  return withBackwardCompatible(names);
}
