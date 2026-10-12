/**
 * The cover wall behind the sign-in sheet.
 *
 * It is a live read now: `popular_games` is `security definer`, so the catalog's
 * most-rated games can be fetched with no account at all, and
 * `popularGames(client, 15)` fills the wall's fifteen slots.
 *
 * The fifteen hardcoded ids below stay as the fallback the spec asks for —
 * shown while the read is in flight and if it fails — because the first thing
 * anyone sees of this app should be games, not fifteen grey rectangles, and a
 * signed-out screen has no sensible place to put an error line. The wall is
 * decoration; it either shows one set of covers or the other.
 *
 * There is no label over it any more (Rafa, 2026-09-16): the wall is bare, it
 * bleeds off the top of the screen, and every cover is its own shape — 120 by
 * 170 at IGDB's real ratio — rather than a slot the art is cut to fit (rules 29
 * and 30, signed-out.md Layout).
 */

import { coverCandidates, igdbCoverUrl, type PopularGameRow } from '@verso/api';

/**
 * IGDB cover image ids. Fifteen, because the wall is three columns of five.
 *
 * Ids rather than titles: `media_items.cover_image_id` is what the catalog
 * stores, and building the URL from an id is what every other cover in the app
 * does. Every one was checked against the CDN and its title read off the cover
 * it serves, because an id is opaque and a comment that guesses is worse than
 * none.
 */
const COVER_IMAGE_IDS = [
  'co5vmg', // The Legend of Zelda: Tears of the Kingdom
  'co1r7f', // The Last of Us
  'co1tnw', // The Elder Scrolls V: Skyrim
  'co2lbd', // Grand Theft Auto V
  'co4jni', // Elden Ring
  'co1rcb', // Overwatch
  'co2mjs', // Cyberpunk 2077
  'co1x78', // Dark Souls
  'co39vk', // Mass Effect: Andromeda
  'co1wyy', // The Witcher 3: Wild Hunt
  'co5s5v', // God of War Ragnarök
  'co3p2d', // The Legend of Zelda: Breath of the Wild
  'co1r76', // Persona 5
  'co1r7d', // Middle-earth: Shadow of Mordor
  'co1x77', // Halo 2
] as const;

/** The fallback covers, as URLs, in the order they are laid out. */
export const SIGNED_OUT_COVERS: readonly string[] = COVER_IMAGE_IDS.map((id) =>
  igdbCoverUrl(id, 't_cover_big'),
);

/** Three columns, five covers each. */
export const WALL_COLUMNS = 3;
export const WALL_ROWS = 5;

/** How many covers the wall has room for: three columns of five. */
export const WALL_SLOTS = WALL_COLUMNS * WALL_ROWS;

/**
 * The best URL for each popular row, rows with no picture at all dropped.
 *
 * One URL rather than the whole `coverCandidates` walk: a wall behind a sign-in
 * sheet does not need a Steam fallback for the one game in fifteen whose IGDB
 * cover 404s. It needs to not have a hole in it, and dropping the row does
 * that — as does the `Cover` primitive the wall now draws through, which falls
 * back to its placeholder rather than to a broken image.
 */
export function popularCoverUrls(rows: readonly PopularGameRow[]): string[] {
  return rows.map((row) => coverCandidates(row, 't_cover_big')[0]).filter((url): url is string => !!url);
}

/**
 * How far above the top of the screen each column starts, in points.
 *
 * Different per column so the top row bleeds off the edge at three different
 * places and the wall reads as staggered rather than as a grid — the job the
 * frame's alternating 160/120/200 heights used to do, now that every cover is
 * drawn whole at its own ratio (rule 29). The screen clips; the image does not.
 *
 * Still three clearly different starts at the 170pt cover the IGDB ratio gives
 * a 120pt column: against the 178pt row pitch the offsets fall at 138, 58 and
 * 98, spread across the pitch rather than bunched, so no two columns line up.
 * Five rows of 170 with 8pt gaps is 882, so the columns end at 842, 762 and 802
 * on an 874pt screen — all of that well below the sheet's top at about 620, and
 * so behind it. If the wall ever has to reach the bottom edge, add rows; do not
 * stretch the covers.
 */
export const COLUMN_TOP_OFFSETS: readonly number[] = [-40, -120, -80];

/**
 * Any list of cover URLs as the wall's three columns.
 *
 * Column-major, so each column is a different run of games, and it cycles when
 * the list is short — `popular_games` is asked for fifteen and a catalog that
 * has fewer should still fill the wall rather than leave gaps down one side.
 * An empty list gives no columns at all, which draws the canvas and is what
 * the caller falls back from.
 */
export function coverColumns(urls: readonly string[]): string[][] {
  if (urls.length === 0) return [];

  return Array.from({ length: WALL_COLUMNS }, (_, column) =>
    Array.from({ length: WALL_ROWS }, (_, row) => urls[(column * WALL_ROWS + row) % urls.length]!),
  );
}
