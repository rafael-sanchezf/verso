/**
 * Everything the Ranking tab computes, with nothing on screen.
 *
 * Four `tier_list` calls come back as four ordered lists. The screen shows one
 * list: labeled dividers, a global rank that runs on through the tiers, and a
 * score per row. That translation is the whole of this file, and it is here
 * rather than in the components because it is the part that can be wrong
 * without looking wrong — an off-by-one in the global rank, a drop that lands
 * in the tier above the one the user aimed at — and because it is the part
 * worth testing without a renderer (see `test/ranking-model.test.ts`).
 *
 * Nothing here imports `react-native`, on purpose: the unit suite runs in node.
 */

import { TIERS, genreDisplayName, scoreForPosition, type Medium, type Tier } from '@verso/core';
import type { CoverSourceRow, TierListRow } from '@verso/api';

import { filmGenreLabel } from '../../lib/film';
import { genreLabel, platformShortName } from '../../lib/format';
import { languageStore } from '../../lib/i18n/store';

/**
 * How a medium names a genre in a row: IGDB's short forms for games
 * (`platformer`), TMDB's labels for films (`Sci-fi`, the site's Ranking
 * phone). Null is a genre the app does not name (Indie, TV Movie). Both in the
 * app's language at the moment of the call (wave 7).
 */
export function genreNamer(medium: Medium = 'game'): (genre: string) => string | null {
  return medium === 'movie'
    ? (genre) => filmGenreLabel(genre)
    : (genre) => genreDisplayName(genre, languageStore.language());
}

/** The same, where the word starts a line or sits on a chip: `Platformer`, `Sci-fi`. */
export function genreChipLabel(medium: Medium = 'game'): (genre: string) => string | null {
  return medium === 'movie' ? (genre) => filmGenreLabel(genre) : genreLabel;
}

/** The four lists as `tierList` returns them, best tier first when iterated with `TIERS`. */
export type TierRows = Readonly<Record<Tier, readonly TierListRow[]>>;

/** Nothing ranked. Also the shape a failed read falls back to, so the screen never indexes into undefined. */
export const EMPTY_TIERS: TierRows = { loved: [], liked: [], fine: [], disliked: [] };

/** One ranked game, with everything the row and the grid cell need already worked out. */
export interface RankingItem {
  /** The row as the RPC returned it. Covers are built from this (see `coverSourceOf`). */
  readonly row: TierListRow;
  readonly mediaItemId: string;
  readonly title: string;
  readonly year: number | null;
  /** IGDB's own genre names, not display names; `displayGenres` shortens them. */
  readonly genres: readonly string[];
  /** Every platform the catalog lists the game on. */
  readonly platforms: readonly string[];
  /** Where the user played it, catalog-spelled; empty when nothing is recorded. */
  readonly playedPlatforms: readonly string[];
  readonly tier: Tier;
  /** Position within the tier, 0 being best. What `moveRankingEntry` means by position. */
  readonly position: number;
  /** Global rank across every tier, 1 being the best game in the best tier. */
  readonly rank: number;
  /** From `scoreForPosition`; never stored, always computed (specs/README.md). */
  readonly score: number;
}

/**
 * The list as it is drawn: a divider before each tier that has games, then that
 * tier's rows.
 *
 * Dividers are items rather than decoration because the drag lives on this
 * list. A game's tier is "which divider is above it", so the drop can be read
 * off the reordered array without the drag having to know anything about tiers.
 */
export type RankingListItem =
  | { readonly kind: 'divider'; readonly key: string; readonly tier: Tier }
  | { readonly kind: 'game'; readonly key: string; readonly tier: Tier; readonly item: RankingItem };

/** Where a dragged row ended up, in the terms `moveRankingEntry` takes. */
export interface DropTarget {
  readonly mediaItemId: string;
  readonly tier: Tier;
  readonly position: number;
}

/**
 * Which filters are on. Both null is the "All" chip.
 *
 * Each holds a raw value, never the words on screen: the genre is IGDB's own
 * name (`Role-playing (RPG)`), from which the label and the icon are both
 * worked out, and the platform is the catalog's (`PlayStation 5`).
 */
export interface RankingFilters {
  readonly genre: string | null;
  readonly platform: string | null;
}

export const NO_FILTERS: RankingFilters = { genre: null, platform: null };

/** The divider's key. Stable across reorders, which is what the sortable needs. */
function dividerKey(tier: Tier): string {
  return `divider:${tier}`;
}

/**
 * The four lists as one, with the global rank and the score filled in.
 *
 * The position is the index in the tier rather than the row's own `position`
 * column: the two agree in a healthy list, but the optimistic update reorders
 * the arrays before the database has confirmed anything, and a score read off a
 * stale column would disagree with the order it is sitting in.
 */
export function assembleRanking(tiers: TierRows): RankingItem[] {
  const items: RankingItem[] = [];
  let rank = 0;

  for (const tier of TIERS) {
    const rows = tiers[tier] ?? [];

    rows.forEach((row, index) => {
      rank += 1;
      items.push({
        row,
        mediaItemId: row.media_item_id,
        title: row.title,
        year: row.year ?? null,
        genres: row.genres ?? [],
        platforms: row.platforms ?? [],
        // `?? []` for a project that has not run the migration that added the
        // column, the same guard `coverSourceOf` keeps for `external_ids`.
        playedPlatforms: row.played_platforms ?? [],
        tier,
        position: index,
        rank,
        score: scoreForPosition(tier, index, rows.length),
      });
    });
  }

  return items;
}

/**
 * The two fields a cover is built from, guaranteed present.
 *
 * `tier_list` gained `external_ids` on 2026-09-16 and the generated types say
 * it is always there, but a project that has not run that migration returns
 * rows without the column. `coverCandidates` copes with either, and this makes
 * the guard explicit rather than accidental.
 */
export function coverSourceOf(row: TierListRow): CoverSourceRow {
  return {
    cover_image_id: row.cover_image_id ?? null,
    external_ids: row.external_ids ?? null,
  };
}

/** The genres of one game in the short forms the app says out loud, unknown ones dropped. */
export function displayGenres(genres: readonly string[], medium: Medium = 'game'): string[] {
  const name = genreNamer(medium);
  const names: string[] = [];
  for (const genre of genres) {
    const display = name(genre);
    if (display !== null && !names.includes(display)) names.push(display);
  }
  return names;
}

/** `2025 · platformer`, the year alone when the genre is unknown, the genre alone when the year is. */
export function rowSubtitle(item: RankingItem, medium: Medium = 'game'): string | null {
  const parts = [item.year === null ? null : String(item.year), displayGenres(item.genres, medium)[0] ?? null];
  const present = parts.filter((part): part is string => part !== null && part !== '');
  return present.length === 0 ? null : present.join(' · ');
}

/**
 * Every genre in the ranking the app has a name for, as filter values.
 *
 * Each value is IGDB's own genre name, one per display name, so `Platform` is
 * offered once however many games carry it, and a genre with no display name
 * (Indie) is not offered at all, the same rule the rows follow when they pick a
 * genre to print. Sorted by the label the sheet prints (`genreLabel`), not by
 * IGDB's name, because that is the order a reader scans: "Rhythm game" sits
 * under R, not at IGDB's `Music`, and "Trivia game" under T, not at
 * `Quiz/Trivia`.
 */
export function genreOptions(items: readonly RankingItem[], medium: Medium = 'game'): string[] {
  const name = genreNamer(medium);
  const label = genreChipLabel(medium);
  const byDisplayName = new Map<string, string>();
  for (const item of items) {
    for (const genre of item.genres) {
      const display = name(genre);
      if (display !== null && !byDisplayName.has(display)) byDisplayName.set(display, genre.trim());
    }
  }
  return byLabel([...byDisplayName.values()], (genre) => label(genre) ?? genre);
}

/**
 * The platforms a game counts as being on, for the Platform filter: where the
 * user played it, or, when no played platform is recorded, every platform the
 * catalog lists it on. Trimmed, blanks dropped.
 *
 * Played first because the menu used to offer Linux, Mac and iOS to someone
 * with no games on any of them (docs/private/phone-feedback.md entry 4): the
 * catalog says where a game exists, and the filter is asked where you play.
 * The fallback keeps a game with nothing recorded findable under some platform
 * rather than under none.
 */
export function platformsOf(item: RankingItem): string[] {
  const clean = (list: readonly string[]) =>
    list.map((platform) => platform.trim()).filter((platform) => platform !== '');
  const played = clean(item.playedPlatforms);
  return played.length > 0 ? played : clean(item.platforms);
}

/**
 * Every platform in the ranking, as filter values: the catalog's own names,
 * sorted by the short name the sheet prints ("PC", "PS5", "Switch").
 *
 * The union of `platformsOf` over the ranked games, so the menu lists where
 * the user plays and never a platform no row would match.
 */
export function platformOptions(items: readonly RankingItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const name of platformsOf(item)) seen.add(name);
  }
  return byLabel([...seen], platformShortName);
}

/** Values in the order of the words that stand for them, the value itself breaking a tie. */
function byLabel(values: readonly string[], labelOf: (value: string) => string): string[] {
  return values
    .map((value) => ({ value, label: labelOf(value) }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value))
    .map(({ value }) => value);
}

/** Whether a game carries a genre, by display name, so spelling and case do not matter. */
function hasGenre(item: RankingItem, genre: string, medium: Medium): boolean {
  const name = genreNamer(medium);
  const wanted = name(genre);
  return wanted !== null && item.genres.some((own) => name(own) === wanted);
}

export function isFiltered(filters: RankingFilters): boolean {
  return filters.genre !== null || filters.platform !== null;
}

/**
 * The subset the filters leave.
 *
 * The items keep the rank and score they were assembled with, because those are
 * facts about the whole ranking and not about what is on screen (specs/ranking.md:
 * "rank numbers and scores keep their global values; the list shows a subset").
 */
export function filterItems(
  items: readonly RankingItem[],
  filters: RankingFilters,
  medium: Medium = 'game',
): RankingItem[] {
  return items.filter((item) => {
    if (filters.genre !== null && !hasGenre(item, filters.genre, medium)) return false;
    if (filters.platform !== null && !platformsOf(item).includes(filters.platform)) return false;
    return true;
  });
}

/**
 * Rows with a divider above each tier that has any.
 *
 * A tier with no games gets no divider (specs/ranking.md), which is also true of
 * a tier whose games a filter has hidden.
 */
export function toListItems(items: readonly RankingItem[]): RankingListItem[] {
  const list: RankingListItem[] = [];
  let current: Tier | null = null;

  for (const item of items) {
    if (item.tier !== current) {
      current = item.tier;
      list.push({ kind: 'divider', key: dividerKey(item.tier), tier: item.tier });
    }
    list.push({ kind: 'game', key: item.mediaItemId, tier: item.tier, item });
  }

  return list;
}

/**
 * The list key of one game, when the list is currently showing it.
 *
 * "Move in Ranking" on a game page hands the tab a media item id and the tab
 * has to turn it into a row it can scroll to. The key of a game row happens to
 * be its media item id today, but the callers ask through this rather than
 * assuming it, and null is the answer to every case where there is nothing to
 * scroll to: the game is not ranked, or a filter is hiding it.
 */
export function focusRowKey(
  list: readonly RankingListItem[],
  mediaItemId: string,
): string | null {
  for (const entry of list) {
    if (entry.kind === 'game' && entry.item.mediaItemId === mediaItemId) return entry.key;
  }
  return null;
}

/**
 * The tier and position a dropped row landed in.
 *
 * "Which divider is above it, and how many games since" — which is exactly what
 * `move_ranking_entry` means by position, since it closes the gap the item
 * leaves before counting the target tier (see the migration).
 *
 * A row dropped above the first divider belongs to the first tier at position
 * 0: the list has no space above its own top, and the alternative is refusing a
 * drop the user clearly meant.
 */
export function dropTarget(list: readonly RankingListItem[], key: string): DropTarget | null {
  let tier: Tier | null = null;
  let position = 0;

  for (const entry of list) {
    if (entry.kind === 'divider') {
      tier = entry.tier;
      position = 0;
      continue;
    }

    if (entry.key === key) {
      return {
        mediaItemId: entry.item.mediaItemId,
        tier: tier ?? firstTierOf(list) ?? entry.item.tier,
        position,
      };
    }

    position += 1;
  }

  return null;
}

function firstTierOf(list: readonly RankingListItem[]): Tier | null {
  for (const entry of list) if (entry.kind === 'divider') return entry.tier;
  return null;
}

/**
 * The reordered list back as four tier lists, for the optimistic write into the
 * query cache.
 *
 * Positions are renumbered so the cache reads exactly as a fresh `tier_list`
 * would, which is what keeps the scores and the rank numbers right in the beat
 * between the drop and the refetch.
 */
export function tiersFromList(list: readonly RankingListItem[]): TierRows {
  const next: Record<Tier, TierListRow[]> = { loved: [], liked: [], fine: [], disliked: [] };
  let tier: Tier | null = null;

  for (const entry of list) {
    if (entry.kind === 'divider') {
      tier = entry.tier;
      continue;
    }

    const target = tier ?? firstTierOf(list) ?? entry.item.tier;
    const rows = next[target];
    rows.push({ ...entry.item.row, position: rows.length });
  }

  return next;
}
