import { STEAM_EXTERNAL_GAME_SOURCE } from './igdb';
import type {
  CrossLinkRow,
  ExternalScoreInput,
  ExternalScoreRow,
  GameDetailsRow,
  IgdbExternalGame,
  IgdbGame,
  IgdbTimeToBeat,
  MappedGame,
  MediaItemRow,
  OpenCriticGame,
  OpenCriticScoreResult,
  SparqlResults,
  SteamAppDetailsEntry,
  SteamAppReviewsResponse,
  TimeToBeatRow,
} from './types';
import { CROSS_LINK_PROPERTIES, MAX_IDENTIFIER_LENGTH } from './wikidata';

/**
 * IGDB's `first_release_date`, which is unix seconds, as the two forms the
 * catalog stores: the full `release_date` the Upcoming segment compares
 * against, and the `year` the app displays.
 *
 * Read in UTC on purpose: the mirror must produce the same date whether it
 * runs on a laptop in New York or on a GitHub runner, so a game released on
 * January 1 does not flip to the previous year depending on the machine. Both
 * forms come from one Date so they can never disagree.
 */
function releaseDate(firstReleaseDate: number | undefined): {
  date: string | null;
  year: number | null;
} {
  if (firstReleaseDate === undefined) return { date: null, year: null };

  const released = new Date(firstReleaseDate * 1000);
  return {
    // toISOString is UTC by definition, so this is the same slice everywhere.
    date: released.toISOString().slice(0, 10),
    year: released.getUTCFullYear(),
  };
}

/** Names of a joined IGDB sub-resource, skipping entries with no name. */
function names(items: Array<{ name?: string }> | undefined): string[] {
  if (!items) return [];
  return items.flatMap((item) => (item.name ? [item.name] : []));
}

/**
 * The developer credit: the first involved company flagged `developer: true`.
 *
 * IGDB attaches several companies to a game with boolean roles (developer,
 * publisher, porting, supporting) and a game often has more than one
 * developer. The catalog shows a single studio, and IGDB returns involved
 * companies in a stable order, so the first developer is the one to show.
 */
function developerName(game: IgdbGame): string | null {
  const involved = game.involved_companies?.find((entry) => entry.developer === true);
  return involved?.company?.name ?? null;
}

/**
 * Map one IGDB game onto the two rows it becomes: `media_items` (the
 * media-agnostic catalog row) and `game_details` (the per-medium extension).
 *
 * Pure: no clock, no network. `now` is the refresh timestamp stamped on the
 * `media_items` row, passed in so the whole batch shares one instant and so
 * tests are deterministic.
 *
 * Returns `null` for a game with no name, which IGDB does occasionally return
 * for placeholder records. `media_items.title` is NOT NULL and an untitled row
 * is useless to the app, so it is dropped rather than given a fallback title.
 */
/**
 * A rating as `external_scores.score` takes it: `numeric(5, 2)`.
 *
 * Rounded here rather than left to Postgres so the value the mirror holds in
 * memory is byte-for-byte the value in the column. That matters for the Steam
 * phase, which hands the stored percentage to `steamReviewPhrase`: a threshold
 * is an inclusive lower bound, and a figure that rounds up on the way into the
 * database would change the phrase after the fact.
 *
 * Returns null for anything that is not a real 0-100 rating, which is how a
 * missing rating is skipped: IGDB omits the field entirely rather than sending
 * null, and a rating outside the range would be rejected by the column anyway.
 */
function rating(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
}

/** A non-negative whole count, or null. */
function count(value: number | undefined): number | null {
  if (value === undefined || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * The two `external_scores` rows IGDB gives us for a game.
 *
 * Two sources, never one blended number (docs/design/ui-principles.md rule
 * 21): `igdb_critics` is the external critic aggregate and `igdb_users` is the
 * IGDB community's own average. IGDB's `total_rating` mixes the two, so it
 * stays in `media_items.metadata` as a sort key and is never presented as a
 * score.
 *
 * A source with no rating produces no row at all, rather than a row with a
 * null score: "we do not know" is the absence of the row, so a game IGDB later
 * gains critic scores for simply gets one.
 *
 * Order is fixed (critics, then users) so a batch's statement parameters are
 * deterministic and the tests can compare arrays.
 */
export function mapExternalScores(game: IgdbGame): ExternalScoreInput[] {
  const rows: ExternalScoreInput[] = [];

  const critics = rating(game.aggregated_rating);
  if (critics !== null) {
    rows.push({
      source: 'igdb_critics',
      score: critics,
      score_count: count(game.aggregated_rating_count),
    });
  }

  const users = rating(game.rating);
  if (users !== null) {
    rows.push({ source: 'igdb_users', score: users, score_count: count(game.rating_count) });
  }

  return rows;
}

/**
 * A Steam app id, as `external_ids.steam` stores it: a positive integer.
 *
 * IGDB's `uid` is a string, and for Steam it is always digits (checked against
 * every Steam row for the 200 most-rated games on 2026-09-16). Anything else
 * is treated as not an app id rather than coerced, so a future change of
 * format cannot put `NaN` or a truncated number into the catalog.
 */
function steamAppId(uid: string | undefined): number | null {
  if (uid === undefined || !/^\d+$/.test(uid)) return null;
  const id = Number(uid);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The one Steam app id for a game, out of however many `/v4/external_games`
 * returns for it.
 *
 * Several Steam entries per game is normal, not an edge case: 14 of the 200
 * most-rated games had more than one on 2026-09-16. The extras are standalone
 * multiplayer clients (Black Ops II and its multiplayer app), VR spin-offs
 * (Borderlands 2 and Borderlands 2 VR), later re-releases and regional
 * duplicates, all filed by IGDB under the same game.
 *
 * **The rule: the smallest app id wins.** Steam assigns app ids in ascending
 * order, so the smallest is the oldest store page, which is the base game
 * rather than the thing that came after it. It is also total and order-
 * independent, so the mirror picks the same id whatever order IGDB returns
 * rows in and whichever page of the walk it saw them on. Spot-checked against
 * the multi-entry games above: it picks Half-Life over its duplicate, the
 * original Dead Space over the remake's entry, Mass Effect 2 over its 2010
 * re-release, Borderlands 2 over the VR edition, and Black Ops II over the
 * multiplayer client.
 *
 * Entries from other stores are ignored, as are entries with no usable id.
 * Returns null when the game is not on Steam, which is common: The Last of Us
 * Part II has no Steam entry at all.
 */
export function selectSteamAppId(rows: IgdbExternalGame[]): number | null {
  let best: number | null = null;

  for (const row of rows) {
    if (row.external_game_source !== STEAM_EXTERNAL_GAME_SOURCE) continue;
    const id = steamAppId(row.uid);
    if (id === null) continue;
    if (best === null || id < best) best = id;
  }

  return best;
}

/** `media_aliases.alias` is checked at 200 characters; anything longer is not a name anyone types. */
export const MAX_ALIAS_LENGTH = 200;

/** More than this many other names for one game is a data problem, not a search aid. */
export const MAX_ALIASES_PER_GAME = 50;

/**
 * The same normal form as `public.search_key` in
 * supabase/migrations/20260923110000_search_aliases.sql: lower case with
 * whitespace and punctuation removed. Used only to de-duplicate here; the
 * database computes the stored key itself.
 */
export function searchKey(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}‘’“”–—·]+/gu, '');
}

/**
 * IGDB's alternative names for one game, as `media_aliases` takes them.
 *
 * * A name that is missing, blank, or longer than {@link MAX_ALIAS_LENGTH} is
 *   skipped, never stored as an empty alias or cut short.
 * * Whitespace is trimmed and collapsed, so "GTA  V " and "GTA V" are one row.
 * * A name whose search key is the title's is dropped: the title already
 *   matches itself, and "Grand Theft Auto V" as an alias of itself would only
 *   make every hit on the title a hit on an alias too.
 * * One name per search key, the first IGDB lists, so "GTA V", "GTA-V" and
 *   "gta v" are one row: search compares keys, and three rows would be the
 *   same match three times.
 *
 * Order is IGDB's, and at most {@link MAX_ALIASES_PER_GAME}.
 */
export function mapAliases(game: IgdbGame): string[] {
  if (!game.alternative_names || !game.name) return [];

  const seen = new Set<string>([searchKey(game.name)]);
  const aliases: string[] = [];

  for (const entry of game.alternative_names) {
    const name = entry.name?.replace(/\s+/g, ' ').trim();
    if (!name || name.length > MAX_ALIAS_LENGTH) continue;

    const key = searchKey(name);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);

    aliases.push(name);
    if (aliases.length >= MAX_ALIASES_PER_GAME) break;
  }

  return aliases;
}

export function mapGame(game: IgdbGame, now: Date): MappedGame | null {
  if (!game.name) return null;

  const released = releaseDate(game.first_release_date);

  const mediaItem: MediaItemRow = {
    medium: 'game',
    title: game.name,
    year: released.year,
    release_date: released.date,
    cover_image_id: game.cover?.image_id ?? null,
    external_ids: { igdb: game.id },
    metadata: {
      total_rating: game.total_rating ?? null,
      total_rating_count: game.total_rating_count ?? null,
      game_type: game.game_type ?? null,
      parent_game: game.parent_game ?? null,
      version_parent: game.version_parent ?? null,
    },
    refreshed_at: now.toISOString(),
  };

  const gameDetails: GameDetailsRow = {
    igdb_id: game.id,
    platforms: names(game.platforms),
    genres: names(game.genres),
    developer: developerName(game),
    summary: game.summary ?? null,
  };

  return { mediaItem, gameDetails, scores: mapExternalScores(game), aliases: mapAliases(game) };
}

/**
 * A non-negative whole number of seconds, or null.
 *
 * `game_details` checks each time-to-beat column `>= 0`, so a negative or
 * fractional figure from upstream would abort the whole batch's UPDATE rather
 * than spoil one row. IGDB has never returned one, but a mirror that dies on a
 * single bad aggregate is worse than one that records "we do not know" for it.
 */
function seconds(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/**
 * Map one row from IGDB's `game_time_to_beats` endpoint onto the triple that
 * goes into `game_details`.
 *
 * Returns `null` when all three figures are missing, so a row carrying only a
 * submission count never issues a pointless UPDATE that would blank three
 * columns we already had values for.
 */
export function mapTimeToBeat(row: IgdbTimeToBeat): TimeToBeatRow | null {
  const hastily = seconds(row.hastily);
  const normally = seconds(row.normally);
  const completely = seconds(row.completely);

  if (hastily === null && normally === null && completely === null) return null;

  return {
    igdb_id: row.game_id,
    hastily_seconds: hastily,
    normally_seconds: normally,
    completely_seconds: completely,
  };
}

/**
 * The `steam` score row for one game, from `appreviews`' `query_summary`.
 *
 * `score` is the positive share of all reviews as a percentage to two
 * decimals, and `score_count` is the total review count. Those two facts are
 * all that is stored: the phrase Steam shows ("Mostly Positive") is derived
 * from them by `steamReviewPhrase` in @verso/core, so there is one
 * representation of the fact rather than two that can disagree.
 *
 * Returns null when there is no percentage to compute: `appreviews` answers
 * `success: 1` with a zeroed summary both for an app nobody has reviewed and
 * for an app id that does not exist at all (confirmed against the endpoint on
 * 2026-09-16), and a zero total is either a division by zero or a fake 0%.
 *
 * The positive share is computed from `total_positive` and `total_reviews`
 * rather than read off `review_score`, which is Valve's own 0-9 bucket: that
 * bucket is the pre-rounded summary, and rule 21 says the summary is a phrase,
 * not a number.
 */
export function mapSteamReviews(
  mediaItemId: string,
  response: SteamAppReviewsResponse,
): ExternalScoreRow | null {
  const summary = response.query_summary;
  if (!summary) return null;

  const total = summary.total_reviews;
  const positive = summary.total_positive;
  if (!Number.isInteger(total) || !Number.isInteger(positive)) return null;
  if (total! <= 0 || positive! < 0 || positive! > total!) return null;

  return {
    media_item_id: mediaItemId,
    source: 'steam',
    score: Math.round((positive! / total!) * 10_000) / 100,
    score_count: total!,
  };
}

/**
 * The metascore Valve licenses for a Steam app, from `appdetails` with
 * `filters=metacritic`, and the Metacritic page that goes with it.
 *
 * This is the only legitimate route to a Metacritic number for us
 * (docs/research/game-data-sources.md 3.1: no API, no developer programme, and
 * Fandom's terms forbid automated access), so the mirror reads Valve's field
 * and nothing else. `score_count` is null because Valve does not say how many
 * critics are behind the number, and Metacritic's *user* score is not in this
 * response and is never stored.
 *
 * Two shapes have to be tolerated, both seen live on 2026-09-16: an app the
 * filter matched answers `{"success":true,"data":{"metacritic":{...}}}`, and
 * one it did not answers `{"success":true,"data":[]}`, with `data` an empty
 * **array** rather than an object. A missing or unsuccessful entry yields
 * nulls, and so does an app that has a Metacritic URL but no score.
 */
export function mapSteamMetacritic(
  mediaItemId: string,
  entry: SteamAppDetailsEntry | undefined,
): { score: ExternalScoreRow | null; url: string | null } {
  const empty = { score: null, url: null };
  if (!entry?.success) return empty;

  const data = entry.data;
  if (!data || Array.isArray(data) || typeof data !== 'object') return empty;

  const metacritic = (data as { metacritic?: { score?: number; url?: string } }).metacritic;
  const score = rating(metacritic?.score);
  const url = typeof metacritic?.url === 'string' && metacritic.url ? metacritic.url : null;

  if (score === null) return { score: null, url };

  return {
    score: { media_item_id: mediaItemId, source: 'metacritic', score, score_count: null },
    url,
  };
}

/**
 * The identifiers bound in each row of a cross-link SPARQL results document.
 *
 * Every Wikidata property here is an *external identifier*, so every value
 * arrives as a string however numeric it looks, and every value is checked
 * against the property's own published regex (P1793, recorded beside the
 * property in `CROSS_LINK_PROPERTIES`) rather than trusted: a constraint
 * violation on Wikidata is a warning on a page, not a rejected edit. A value
 * the property's own rule rejects is dropped rather than written, because what
 * these become is a link a user taps and an id the scores pass spends its
 * daily allowance on.
 *
 * A row with no valid identifier at all yields nothing, and a row whose `igdb`
 * did not bind or did not parse is skipped entirely: the Query Service omits
 * an unbound variable from a row instead of sending null.
 *
 * Nothing is decided here. One game can produce several rows (each OPTIONAL
 * column multiplies), so this is a faithful list of what came back and
 * `dedupeCrossLinks` picks the answer.
 */
export function mapCrossLinks(results: SparqlResults): CrossLinkRow[] {
  const rows: CrossLinkRow[] = [];

  for (const binding of results.results?.bindings ?? []) {
    const igdb = externalId(binding.igdb?.value);
    if (igdb === null) continue;

    const row: CrossLinkRow = { igdb_id: igdb };
    let bound = false;

    for (const property of CROSS_LINK_PROPERTIES) {
      const raw = binding[property.key]?.value;
      // Length before pattern, always: see MAX_IDENTIFIER_LENGTH. Nothing this
      // long is a valid identifier under any of the rules, so the cheap test
      // is also the correct one.
      if (raw === undefined || raw.length > MAX_IDENTIFIER_LENGTH) continue;
      if (!property.pattern.test(raw)) continue;

      if (property.kind === 'integer') {
        const parsed = externalId(raw);
        if (parsed === null) continue;
        (row as Record<string, unknown>)[property.key] = parsed;
      } else {
        (row as Record<string, unknown>)[property.key] = raw;
      }
      bound = true;
    }

    if (bound) rows.push(row);
  }

  return rows;
}

/** A Wikidata external-identifier value as a positive integer, or null. */
function externalId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The `external_scores` rows for one game, from `GET /game/{id}`.
 *
 * Two rows, not one, and both or neither:
 *
 *   * `opencritic` carries `topCriticScore`, the average of OpenCritic's Top
 *     Critic outlets, with `numTopCriticReviews` as the count.
 *   * `opencritic_recommended` carries `percentRecommended`, the share of
 *     those same critics who recommend the game, over the same count. It is
 *     the figure OpenCritic itself leads with, and it answers a different
 *     question from the average ("would they tell you to play it" rather than
 *     "what did they score it"), so rule 21's one scoreboard per source makes
 *     it a source of its own rather than a second column.
 *
 * `numTopCriticReviews` is the gate for both. A game OpenCritic has a page for
 * but no Top Critic reviews of answers with a sentinel rather than an omission
 * - historically `topCriticScore: -1` - so presence proves nothing and the
 * range is tested instead: a count of zero, or a figure outside 0-100, yields
 * no row at all rather than a zero the game page would print as a verdict.
 *
 * `percentRecommended` gets one guard the average does not: a value strictly
 * between 0 and 1 is refused as an unknown scale. A range check alone is
 * defensive about the field being *missing* and not about it being *in the
 * wrong units*, and 0.9714 passes "is it between 0 and 100" while meaning
 * 97.14%. Storing it would put "0.97" on the game page under a label reading
 * percent recommended, which is worse than showing nothing: no number is
 * better than a wrong number. Only this field carries the guard, because only
 * this field is a percentage - the kind of value an API plausibly ships as a
 * 0-to-1 fraction - whereas `topCriticScore` is an average of published review
 * scores, where a value below 1 is an absurd but real reading rather than a
 * unit mix-up. 0 and 1 exactly are kept: on the percentage scale they are
 * legitimate, and there is nothing to distinguish them from their fractional
 * twins anyway.
 */
export function mapOpenCriticScores(
  mediaItemId: string,
  openCriticId: number,
  game: OpenCriticGame,
): OpenCriticScoreResult {
  const reviews = count(game.numTopCriticReviews ?? undefined);
  const empty: OpenCriticScoreResult = {
    media_item_id: mediaItemId,
    opencritic_id: openCriticId,
    topCritic: null,
    recommended: null,
    recommendedScaleSuspect: false,
  };

  if (reviews === null || reviews === 0) return empty;

  const top = rating(game.topCriticScore ?? undefined);
  const raw = game.percentRecommended ?? undefined;
  const scaleSuspect = raw !== undefined && Number.isFinite(raw) && raw > 0 && raw < 1;
  const recommended = scaleSuspect ? null : rating(raw);

  return {
    media_item_id: mediaItemId,
    opencritic_id: openCriticId,
    topCritic:
      top === null
        ? null
        : { media_item_id: mediaItemId, source: 'opencritic', score: top, score_count: reviews },
    recommended:
      recommended === null
        ? null
        : {
            media_item_id: mediaItemId,
            source: 'opencritic_recommended',
            score: recommended,
            score_count: reviews,
          },
    recommendedScaleSuspect: scaleSuspect,
  };
}
