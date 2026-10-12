/**
 * Cover art URLs, built from ids the catalog already stores.
 *
 * "Own the user's data, borrow the catalog" (ROADMAP principles) extends to the
 * pictures: the mirror stores `media_items.cover_image_id` and
 * `external_ids.steam`, never a URL and never the bytes, and the app builds the
 * address it needs at the size it needs. So nothing here touches the network,
 * nothing here is stored, and changing a CDN path later is a change to this one
 * file rather than a migration.
 *
 * `coverCandidates` is the function screens use. It returns an ordered list
 * rather than one URL because neither source is complete: IGDB has no cover for
 * some games, and "not every asset exists for older apps" on Steam's CDN
 * (docs/research/game-data-sources.md, 2.5), which answers a request for a
 * missing one with a 404 rather than a placeholder. An image component walks
 * the list and falls through on error, which costs nothing when the first URL
 * works — the usual case, since the mirror fills `cover_image_id` for almost
 * everything.
 *
 * Sources in order: IGDB first, because it is the catalog spine and its covers
 * are portrait box art at a size we choose; Steam second, for the games that
 * have an app id.
 */

import type { Json } from './database.types';

/**
 * IGDB's documented size tokens, without the retina suffix.
 *
 * From docs/research/game-data-sources.md 2.5: `micro` 35x35, `thumb` 90x90,
 * `cover_small` 90x128, `cover_big` 264x374, `logo_med` 284x160,
 * `screenshot_med` 569x320, `screenshot_big` 889x500, `screenshot_huge`
 * 1280x720, `720p` 1280x720, `1080p` 1920x1080.
 */
export type IgdbImageBaseSize =
  | 't_micro'
  | 't_thumb'
  | 't_cover_small'
  | 't_cover_big'
  | 't_logo_med'
  | 't_screenshot_med'
  | 't_screenshot_big'
  | 't_screenshot_huge'
  | 't_720p'
  | 't_1080p';

/**
 * A size token IGDB will serve. Any base size takes a `_2x` suffix for retina,
 * so `t_cover_big_2x` is 528x748.
 */
export type IgdbImageSize = IgdbImageBaseSize | `${IgdbImageBaseSize}_2x`;

/**
 * What a cover asks for unless it says otherwise: retina box art.
 *
 * `t_cover_big_2x` is 528x748, which covers every phone the app renders a cover
 * on, and is the size the research recommends storing image ids for
 * (docs/research/game-data-sources.md, section 10).
 */
export const DEFAULT_COVER_SIZE: IgdbImageSize = 't_cover_big_2x';

const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload';
const STEAM_APP_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

/**
 * The URL for one IGDB image at one size.
 *
 * `imageId` is the opaque id the mirror copies out of IGDB (`co1r7f` and the
 * like), not a number and not a path. A blank one has no URL, so callers that
 * read `cover_image_id` straight out of the catalog should use
 * `coverCandidates`, which skips it.
 *
 * Worth knowing when designing a cache: an image removed or replaced on
 * IGDB.com stays on the CDN for 30 days and then stops resolving.
 */
export function igdbCoverUrl(imageId: string, size: IgdbImageSize = DEFAULT_COVER_SIZE): string {
  return `${IGDB_IMAGE_BASE}/${size}/${imageId}.jpg`;
}

/**
 * Steam's store art for one app id, most portrait and highest resolution first.
 *
 * Every path is predictable from the app id with no API call and no key, which
 * is what makes Steam a usable fallback at all. What is not predictable is
 * which of them exists: the library images were introduced with the 2019
 * library redesign, so older apps often have only `header.jpg`. Hence a list
 * rather than a URL.
 *
 * 1. `library_600x900_2x.jpg`, 1200x1800 portrait box art.
 * 2. `library_600x900.jpg`, the same picture at 600x900.
 * 3. `header.jpg`, 460x215. Landscape, so it is a last resort in a portrait
 *    slot rather than a cover, but it is the one asset essentially every app
 *    has. (`capsule_616x353.jpg` is landscape too and no more likely to exist,
 *    so it would add a round trip without adding a chance of success.)
 *
 * Throws RangeError for anything that is not a Steam app id; use
 * `coverCandidates` for ids read out of `external_ids`, which are untyped jsonb
 * and get parsed rather than trusted.
 */
export function steamCoverUrls(appId: number): string[] {
  if (!Number.isSafeInteger(appId) || appId <= 0) {
    throw new RangeError(`steam app id must be a positive integer, got ${appId}`);
  }
  return [
    `${STEAM_APP_BASE}/${appId}/library_600x900_2x.jpg`,
    `${STEAM_APP_BASE}/${appId}/library_600x900.jpg`,
    `${STEAM_APP_BASE}/${appId}/header.jpg`,
  ];
}

/**
 * The catalog facts a cover is built from, as a read model spells them.
 * `EntryRow` and `GamePage` in `views.ts` both satisfy it, so a screen passes
 * the row it already has.
 */
export interface CoverSource {
  /** `media_items.cover_image_id`: IGDB's image id, or null where it has no cover. */
  coverImageId: string | null;
  /** `media_items.external_ids`, as the column stores it. Untyped on purpose; see below. */
  externalIds: Json;
}

/**
 * The same two facts as a database function returns them.
 *
 * `tier_list` is an RPC, so its rows arrive with the column names Postgres
 * gave them and the Ranking tab reads `row.cover_image_id`, while the read
 * models in `views.ts` are hand-written in camelCase. Rather than make one of
 * the two screens convert a row before it can draw a picture, `coverCandidates`
 * takes either.
 */
export interface CoverSourceRow {
  /** `media_items.cover_image_id`, straight off the RPC. */
  cover_image_id: string | null;
  /** `media_items.external_ids`, straight off the RPC. */
  external_ids: Json;
}

/** Either spelling of the two facts. */
export type AnyCoverSource = CoverSource | CoverSourceRow;

/** Pick the two fields out of whichever spelling arrived. */
function coverFieldsOf(item: AnyCoverSource): CoverSource {
  return 'coverImageId' in item
    ? item
    : { coverImageId: item.cover_image_id, externalIds: item.external_ids };
}

/**
 * Every URL worth trying for this game's cover, best first.
 *
 * Feed it to an image component that advances on error. An empty list means the
 * catalog knows no picture for this game and the screen should draw its own
 * placeholder, which is a real case: an IGDB game with no cover and no Steam
 * page has nothing to show.
 *
 * `size` applies to the IGDB URL only. Steam's paths are fixed sizes, which is
 * the other reason IGDB goes first: it is the only source that can answer the
 * question the screen actually asked.
 *
 * Takes a read model from `views.ts` or `profile.ts` (`coverImageId`,
 * `externalIds`) or a row from the `tier_list` RPC (`cover_image_id`,
 * `external_ids`), because both are rows a screen has in hand and neither
 * should have to be rewritten to draw a picture.
 */
export function coverCandidates(
  item: AnyCoverSource,
  size: IgdbImageSize = DEFAULT_COVER_SIZE,
): string[] {
  const { coverImageId, externalIds } = coverFieldsOf(item);
  const urls: string[] = [];

  const imageId = coverImageId?.trim();
  if (imageId) urls.push(igdbCoverUrl(imageId, size));

  const appId = steamAppIdOf(externalIds);
  if (appId !== null) urls.push(...steamCoverUrls(appId));

  return urls;
}

/**
 * Pull the Steam app id out of a `media_items.external_ids` blob.
 *
 * The column is jsonb with no shape the database enforces, so this is a parse
 * and not a cast: the catalog mirror writes a number (`selectSteamAppId` in
 * `packages/catalog`), a hand-written row or an import might write the digits
 * as a string, and anything else is treated as "no Steam id" rather than
 * coerced into a URL that would 404. Same shape as `igdbIdOf` in `export.ts`,
 * for the same reason.
 */
function steamAppIdOf(externalIds: Json): number | null {
  if (typeof externalIds !== 'object' || externalIds === null || Array.isArray(externalIds)) {
    return null;
  }
  const raw = externalIds['steam'];
  const id = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
  if (id === null || !Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}
