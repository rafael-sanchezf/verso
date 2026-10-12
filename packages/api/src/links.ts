/**
 * Link-outs for a game page, built from ids the catalog already stores.
 *
 * The same bargain as `covers.ts`: the mirror stores identifiers, never URLs,
 * and the app builds the address it needs. Here the bargain is also a legal
 * one. Metacritic has no API and Fandom's terms forbid automated access, and
 * HowLongToBeat has no API and no published terms
 * (docs/research/game-data-sources.md 3.1 and 8.1), so the only honest way to
 * show either is a number we are licensed to show and a link to the page it
 * came from. The nightly Wikidata pass in `packages/catalog` collects the ids
 * (ROADMAP V1, "Cross-linking IDs"), and this file turns them into the links.
 * Nothing here touches the network and nothing here is stored.
 *
 * Every link carries a source label, because rule 21 of
 * `docs/design/ui-principles.md` says a number - and by the same argument the
 * link that explains it - is never shown without naming where it came from.
 *
 * `linkOuts` is the function screens use. It returns an ordered list of the
 * links worth showing for one game, best first and never a link that would
 * 404: an id that is not the shape the source's own rule says it is is dropped
 * rather than turned into an address.
 */

import type { Json } from './database.types';

/**
 * The sources a game page can link out to, in the order it shows them.
 *
 * Scores first (Metacritic, then HowLongToBeat's time to beat, then
 * OpenCritic), stores after, because the first three answer "is this good and
 * how long is it" and the rest answer "where do I buy it".
 */
export type LinkOutSource = 'metacritic' | 'hltb' | 'opencritic' | 'steam' | 'gog' | 'epic';

/** One link, with the label rule 21 requires beside it. */
export interface LinkOut {
  /** Stable key, the same spelling as the `external_ids` key it came from. */
  source: LinkOutSource;
  /** What the UI prints beside the link. */
  label: string;
  url: string;
}

/**
 * How each source's URL is built, and what an id has to look like first.
 *
 * The formatter URLs and the value regexes are Wikidata's own published
 * `formatter URL` (P1630) and `format as a regular expression` (P1793) for the
 * property the catalog fills the id from, read off wikidata.org on 2026-09-16.
 * They are repeated here rather than imported because `packages/api` is what
 * ships in the app and `packages/catalog` is a Node script that talks to
 * Postgres; the catalog's `CROSS_LINK_PROPERTIES` is the same table, and
 * `packages/catalog/src/wikidata.ts` carries the property pages they were read
 * from.
 *
 *   source      property  label             formatter
 *   metacritic  P12054    Metacritic        https://www.metacritic.com/game/$1/
 *   hltb        P2816     HowLongToBeat     https://howlongtobeat.com/game/$1
 *   opencritic  P2864     OpenCritic        https://opencritic.com/game/$1/-
 *   steam       P1733     Steam             https://store.steampowered.com/app/$1/
 *   gog         P2725     GOG               https://www.gog.com/$1
 *   epic        P6278     Epic Games Store  https://store.epicgames.com/p/$1
 *
 * `steam` is the one id here the Wikidata pass does not own: IGDB's
 * `external_games` fills it on every sync and Wikidata only fills the gaps, so
 * the value can be either source's and the shape check is the same either way.
 *
 * Every regex confines a value to lower-case letters, digits, hyphens,
 * underscores and (for GOG) a single slash, so an id that passes it cannot
 * carry a `?`, a `#`, a `..` or a scheme into the URL it is interpolated into.
 * That is why the check runs before the URL is built rather than after.
 */
const SOURCES: ReadonlyArray<{
  source: LinkOutSource;
  label: string;
  /**
   * What the catalog stores under this key. An `integer` id is written as a
   * JSON number and tolerated as digits; a `slug` is written as a JSON string
   * and a number under that key means somebody wrote the wrong thing, not that
   * a game's Epic page is called "620".
   */
  kind: 'integer' | 'slug';
  pattern: RegExp;
  url: (id: string) => string;
}> = [
  {
    source: 'metacritic',
    label: 'Metacritic',
    kind: 'slug',
    pattern: /^(?!1300\d{6})-?[a-z\d]+(-[a-z\d]+){0,19}-?$/,
    url: (id) => `https://www.metacritic.com/game/${id}/`,
  },
  {
    source: 'hltb',
    label: 'HowLongToBeat',
    kind: 'integer',
    pattern: /^[1-9]\d{0,5}$/,
    url: (id) => `https://howlongtobeat.com/game/${id}`,
  },
  {
    source: 'opencritic',
    label: 'OpenCritic',
    kind: 'integer',
    pattern: /^[1-9]\d{0,4}$/,
    url: (id) => `https://opencritic.com/game/${id}/-`,
  },
  {
    source: 'steam',
    label: 'Steam',
    kind: 'integer',
    pattern: /^[1-9]\d{0,6}$/,
    url: (id) => `https://store.steampowered.com/app/${id}/`,
  },
  {
    source: 'gog',
    label: 'GOG',
    kind: 'slug',
    pattern: /^(movie|game)\/[a-z\d]+([_]{1,2}[a-z\d]+){0,10}$/,
    url: (id) => `https://www.gog.com/${id}`,
  },
  {
    source: 'epic',
    label: 'Epic Games Store',
    kind: 'slug',
    // Deliberately not Wikidata's P1793 verbatim, unlike the other five:
    // `^[a-z\d]+([\-]{0,3}[\_]?[^\sA-Z\W\_]+)*$` degenerates to
    // `([a-z\d]+)*` - both quantifiers before the character class can match
    // empty - and backtracks catastrophically on any value it rejects, 6.9 ms
    // at twenty characters and roughly doubling per character after that. The
    // form below accepts the same language with a mandatory separator instead
    // of an optional one. `packages/catalog/src/wikidata.ts` carries the
    // measurements and the equivalence check.
    pattern: /^[a-z\d]+(?:-{1,3}_?[a-z\d]+|_[a-z\d]+)*$/,
    url: (id) => `https://store.epicgames.com/p/${id}`,
  },
];

/**
 * The longest value any pattern above is run against.
 *
 * The same bound, and the same reasoning, as `MAX_IDENTIFIER_LENGTH` in
 * `packages/catalog/src/wikidata.ts`: these are copies of rules a wiki
 * publishes, judging values that came from that same wiki, and length is the
 * one check whose cost cannot depend on the pattern. It matters less here than
 * in the nightly job - this runs on a phone against one game's row - but a
 * screen that stops painting is not a better outcome than a job that stops
 * running.
 */
const MAX_IDENTIFIER_LENGTH = 200;

/**
 * The catalog facts a link is built from, as a read model spells them.
 *
 * `metadata` is optional because not every read model carries it: `GamePage`
 * in `views.ts` selects `external_ids` and not `metadata` today, so a caller
 * passing a game page gets the Wikidata slug rather than Valve's URL until
 * that read widens. The links are the same page either way.
 */
export interface LinkSource {
  /** `media_items.external_ids`, as the column stores it. Untyped on purpose. */
  externalIds: Json;
  /** `media_items.metadata`, for `metacritic_url`. */
  metadata?: Json;
}

/**
 * The same facts as a database function or a raw select returns them.
 *
 * `tier_list` is an RPC and `popular_games` is another, so their rows arrive
 * with the column names Postgres gave them. Rather than make a screen convert
 * a row before it can draw a link, `linkOuts` takes either spelling, exactly
 * as `coverCandidates` does in covers.ts.
 */
export interface LinkSourceRow {
  /** `media_items.external_ids`, straight off the row. */
  external_ids: Json;
  /** `media_items.metadata`, straight off the row. */
  metadata?: Json;
}

/** Either spelling of the two facts. */
export type AnyLinkSource = LinkSource | LinkSourceRow;

/** Pick the two fields out of whichever spelling arrived. */
function linkFieldsOf(item: AnyLinkSource): LinkSource {
  return 'externalIds' in item
    ? item
    : { externalIds: item.external_ids, metadata: item.metadata };
}

/** A jsonb blob as a plain object, or null for anything that is not one. */
function objectOf(value: Json | undefined): Record<string, Json | undefined> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, Json | undefined>;
}

/**
 * One `external_ids` value as the string a formatter takes, or null.
 *
 * The column is jsonb with no shape the database enforces, so this is a parse
 * and not a cast: the catalog writes a number for the integer identifiers and
 * a string for the slugs, but a hand-written row or an import might write the
 * digits as a string, and anything else - an object, an array, a boolean, a
 * fraction - is treated as "no id" rather than coerced into a URL that would
 * 404. Same shape as `steamAppIdOf` in covers.ts, for the same reason.
 */
function identifierOf(
  externalIds: Json,
  source: (typeof SOURCES)[number],
): string | null {
  const ids = objectOf(externalIds);
  if (!ids) return null;

  const raw = ids[source.source];
  if (typeof raw === 'number') {
    // Only for the integer identifiers: a number under a slug key is a wrong
    // write, and `620` happens to satisfy the Epic and Metacritic regexes.
    if (source.kind !== 'integer') return null;
    if (!Number.isSafeInteger(raw) || raw <= 0) return null;
    return source.pattern.test(String(raw)) ? String(raw) : null;
  }
  if (typeof raw !== 'string') return null;
  // Length before pattern, always: see MAX_IDENTIFIER_LENGTH. Checked on the
  // untrimmed value too, so a megabyte of whitespace costs nothing either.
  if (raw.length > MAX_IDENTIFIER_LENGTH) return null;

  const trimmed = raw.trim();
  return trimmed && source.pattern.test(trimmed) ? trimmed : null;
}

/**
 * Valve's own Metacritic URL, which is the one to prefer where we have it.
 *
 * `appdetails` returns a `metacritic` object with the score and the page it
 * belongs to, and the Steam pass stores that URL in
 * `metadata.metacritic_url` (work queue item 8). Preferring it means the
 * number on the page and the link under it always point at the same place,
 * including the platform, which the Wikidata slug has no room for: Valve's
 * URL names `/game/pc/...` where the slug names only the game.
 *
 * Checked rather than trusted, because a URL is the one kind of stored string
 * that does something when a user taps it. Anything that is not an http(s)
 * URL on metacritic.com falls through to the slug.
 */
function valveMetacriticUrl(metadata: Json | undefined): string | null {
  const blob = objectOf(metadata);
  const raw = blob?.['metacritic_url'];
  if (typeof raw !== 'string' || !raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.hostname !== 'metacritic.com' && url.hostname !== 'www.metacritic.com') return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Every link worth showing for this game, in the order to show them.
 *
 * An empty list means the catalog knows no id for this game and the page
 * should draw no link row at all, which is a real case: an indie game IGDB has
 * but Wikidata does not.
 *
 * Takes a read model (`externalIds`, `metadata`) or a row straight off an RPC
 * (`external_ids`, `metadata`), because both are rows a screen has in hand.
 */
export function linkOuts(item: AnyLinkSource): LinkOut[] {
  const { externalIds, metadata } = linkFieldsOf(item);
  const links: LinkOut[] = [];

  for (const source of SOURCES) {
    if (source.source === 'metacritic') {
      const licensed = valveMetacriticUrl(metadata);
      if (licensed) {
        links.push({ source: 'metacritic', label: source.label, url: licensed });
        continue;
      }
    }

    const id = identifierOf(externalIds, source);
    if (id !== null) links.push({ source: source.source, label: source.label, url: source.url(id) });
  }

  return links;
}

/** The one link for a source, or null. A convenience for a page that shows one row. */
export function linkOut(item: AnyLinkSource, source: LinkOutSource): LinkOut | null {
  return linkOuts(item).find((link) => link.source === source) ?? null;
}
