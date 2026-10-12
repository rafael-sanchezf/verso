/**
 * Shapes exchanged with IGDB and with Postgres.
 *
 * Only the fields the mirror actually requests are modelled. Everything IGDB
 * can omit is optional: IGDB leaves a field out entirely rather than sending
 * null, so every consumer has to cope with `undefined`.
 */

export interface IgdbNamed {
  id?: number;
  name?: string;
}

export interface IgdbCover {
  id?: number;
  image_id?: string;
}

/**
 * One of a game's other names, expanded from `alternative_names` on the games
 * query. IGDB's `comment` says what kind of name it is ("Acronym", "Japanese
 * title", "Working title"); it is not requested, because every kind is worth
 * matching a search against and none is shown.
 */
export interface IgdbAlternativeName {
  id?: number;
  name?: string;
}

export interface IgdbInvolvedCompany {
  id?: number;
  developer?: boolean;
  company?: IgdbNamed;
}

/** A row from `POST /v4/games` with the field list in {@link GAME_FIELDS}. */
export interface IgdbGame {
  id: number;
  name?: string;
  /** Unix seconds. */
  first_release_date?: number;
  cover?: IgdbCover;
  genres?: IgdbNamed[];
  platforms?: IgdbNamed[];
  involved_companies?: IgdbInvolvedCompany[];
  /** Other names players use: "GTA 5", "BotW", localized and working titles. */
  alternative_names?: IgdbAlternativeName[];
  summary?: string;
  /** Average of external critic scores, 0-100. Stored as source `igdb_critics`. */
  aggregated_rating?: number;
  /** How many external critic scores that average is over. */
  aggregated_rating_count?: number;
  /** Average IGDB user rating, 0-100. Stored as source `igdb_users`. */
  rating?: number;
  /** How many IGDB users rated it. */
  rating_count?: number;
  /** The blend of the two. Kept in `media_items.metadata`, not scored. */
  total_rating?: number;
  total_rating_count?: number;
  /**
   * IGDB renamed `category` to `game_type` in the 2025 enum-to-table
   * migration. 0 is "main game"; everything else is a DLC, expansion, bundle,
   * port, remake, mod, episode, season, or similar derivative.
   */
  game_type?: number;
  /**
   * The IGDB id this game hangs off, as IGDB files it: the main game for DLC,
   * expansions and ports. Whether IGDB fills it for a remake is unconfirmed.
   * Carried into `media_items.metadata` as is; nothing reads it yet.
   */
  parent_game?: number;
  /** The IGDB id of the game this is an edition or version of. Carried the same way. */
  version_parent?: number;
  /** Unix seconds; the cursor the delta sync filters on. */
  updated_at?: number;
}

/** A row from `POST /v4/game_time_to_beats` with {@link TIME_TO_BEAT_FIELDS}. */
export interface IgdbTimeToBeat {
  /** The time-to-beat record's own id, not the game's. */
  id?: number;
  /** The IGDB game this aggregate belongs to. One row per game. */
  game_id: number;
  /** Average seconds to reach the credits, skipping notable extras. */
  hastily?: number;
  /** Average seconds to finish while mixing in some extras. */
  normally?: number;
  /** Average seconds to reach 100% completion. */
  completely?: number;
  /**
   * How many submissions the averages come from. Requested and carried through
   * the map, but not stored: `game_details` has no column for it yet. It is
   * what a confidence indicator would be built from ("~25 h, from 13 players").
   */
  count?: number;
}

/** A row from `POST /v4/external_games` with {@link EXTERNAL_GAME_FIELDS}. */
export interface IgdbExternalGame {
  /** The external-game record's own id, not the game's and not the store's. */
  id?: number;
  /** The IGDB game this entry belongs to. A game can have several. */
  game: number;
  /**
   * The store's own id for the game, as a string. For Steam this is the app
   * id, always digits.
   */
  uid?: string;
  /**
   * Which store. 1 is Steam; see {@link STEAM_EXTERNAL_GAME_SOURCE}. Replaces
   * the deprecated `category` enum, which IGDB no longer returns.
   */
  external_game_source?: number;
  /** The store page. Present for most entries, null for some older ones. */
  url?: string | null;
}

/** A row destined for `public.media_items`. */
export interface MediaItemRow {
  medium: 'game';
  title: string;
  year: number | null;
  /** ISO `YYYY-MM-DD`, read in UTC. Null when IGDB has no date. */
  release_date: string | null;
  cover_image_id: string | null;
  external_ids: { igdb: number };
  metadata: {
    total_rating: number | null;
    total_rating_count: number | null;
    game_type: number | null;
    /** IGDB's `parent_game`, an IGDB id. No link is built from it yet. */
    parent_game: number | null;
    /** IGDB's `version_parent`, an IGDB id. No link is built from it yet. */
    version_parent: number | null;
  };
  refreshed_at: string;
}

/**
 * Every value the mirror writes into `external_scores.source`.
 *
 * One scoreboard per source (docs/design/ui-principles.md rule 21): each row
 * is one named source's own number, never a blend of two, and the app labels
 * it with the source it came from.
 *
 *   * `igdb_critics` - IGDB's `aggregated_rating`, an average of external
 *     critic scores, 0-100. `score_count` is how many critics.
 *   * `igdb_users`   - IGDB's `rating`, the average IGDB user rating, 0-100.
 *     `score_count` is how many IGDB users.
 *   * `steam`        - the positive share of Steam reviews, 0-100.
 *     `score_count` is the total review count. The app shows this as a phrase
 *     (`steamReviewPhrase` in @verso/core), never as a number.
 *   * `metacritic`   - the metascore, 0-100, taken only from Valve's licensed
 *     `metacritic` field on Steam's `appdetails`. `score_count` is null:
 *     Valve does not say how many critics are behind it. Metacritic's user
 *     score has no legitimate source and is never stored.
 *   * `opencritic`   - OpenCritic's `topCriticScore`, the average of its Top
 *     Critic outlets, 0-100. `score_count` is `numTopCriticReviews`, the
 *     number of those outlets.
 *   * `opencritic_recommended` - OpenCritic's `percentRecommended`, the share
 *     of those same critics who recommend the game, 0-100. A different
 *     statistic from the average rather than a rounding of it, so rule 21
 *     makes it its own row rather than a second column on the one above.
 *     `score_count` is the same `numTopCriticReviews` it is computed over.
 *   * `tmdb`         - TMDB's `vote_average` times ten, so it shares the
 *     0-100 scale every other source here uses; the app divides by ten to
 *     show "7.9 TMDB". `score_count` is `vote_count`. Written only for a
 *     film or series somebody has voted on, because TMDB answers 0 for one
 *     nobody has and a zero in this column would read as a verdict.
 */
export type ExternalScoreSource =
  | 'igdb_critics'
  | 'igdb_users'
  | 'steam'
  | 'metacritic'
  | 'opencritic'
  | 'opencritic_recommended'
  | 'tmdb';

/**
 * A row destined for `public.external_scores`, minus `media_item_id`, which is
 * only known once the matching `media_items` row has been upserted.
 */
export interface ExternalScoreInput {
  source: ExternalScoreSource;
  /** numeric(5,2) in Postgres, so already rounded to two decimals here. */
  score: number;
  /** How many opinions the score is over, when the source says. */
  score_count: number | null;
}

/** An {@link ExternalScoreInput} with the catalog row it belongs to. */
export interface ExternalScoreRow extends ExternalScoreInput {
  media_item_id: string;
}

/**
 * A Steam app id destined for `media_items.external_ids.steam`, keyed by IGDB
 * id because `/v4/external_games` never mentions our `media_item_id`.
 */
export interface SteamAppIdRow {
  igdb_id: number;
  steam_app_id: number;
}

/** One game the Steam scores phase should fetch, from the selection query. */
export interface SteamScoreTarget {
  media_item_id: string;
  steam_app_id: number;
  /** True when some user has this in their entries or their ranking. */
  tracked: boolean;
}

/** The `query_summary` of `GET /appreviews/{appid}?json=1`. */
export interface SteamReviewSummary {
  num_reviews?: number;
  review_score?: number;
  review_score_desc?: string;
  total_positive?: number;
  total_negative?: number;
  total_reviews?: number;
}

export interface SteamAppReviewsResponse {
  success?: number;
  query_summary?: SteamReviewSummary;
}

/**
 * One app's entry in `GET /api/appdetails?...&filters=metacritic`.
 *
 * `data` is an object when the filter matched and an empty **array** when it
 * did not, which is a real quirk of the endpoint confirmed against it on
 * 2026-09-16 (appid 1966720 answers `{"success":true,"data":[]}`).
 */
export interface SteamAppDetailsEntry {
  success?: boolean;
  data?: { metacritic?: { score?: number; url?: string } } | unknown[];
}

export type SteamAppDetailsResponse = Record<string, SteamAppDetailsEntry | undefined>;

/** What one game's storefront round trip yielded. */
export interface SteamScoreResult {
  media_item_id: string;
  steam_app_id: number;
  /** The `steam` row, absent when the app has no reviews at all. */
  review: ExternalScoreRow | null;
  /** The `metacritic` row, absent when Valve licenses no metascore for it. */
  metacritic: ExternalScoreRow | null;
  /** Metacritic's page for the game, for `media_items.metadata.metacritic_url`. */
  metacriticUrl: string | null;
}

/**
 * A row destined for `public.game_details`, minus `media_item_id`, which only
 * exists once the matching `media_items` row has been upserted.
 */
export interface GameDetailsRow {
  igdb_id: number;
  platforms: string[];
  genres: string[];
  developer: string | null;
  summary: string | null;
}

export interface MappedGame {
  mediaItem: MediaItemRow;
  gameDetails: GameDetailsRow;
  /**
   * The IGDB score rows for this game, `igdb_critics` and `igdb_users`, in
   * that order, and only the ones IGDB actually has a rating for. Written in
   * the same transaction as the two rows above, because `external_scores` is
   * keyed by `media_item_id` and that uuid is only known from the
   * `media_items` upsert's RETURNING.
   */
  scores: ExternalScoreInput[];
  /**
   * IGDB's alternative names for this game, cleaned by `mapAliases`: trimmed,
   * never the title itself, one per search key. Written to `media_aliases`
   * with source `igdb` in the same transaction, replacing whatever IGDB said
   * last time. Empty when IGDB lists none, which clears the game's igdb rows.
   */
  aliases: string[];
}

/**
 * The time-to-beat triple destined for `public.game_details`, keyed by IGDB id
 * because that is the only handle the time-to-beat endpoint gives us: it never
 * mentions our media_item_id.
 */
export interface TimeToBeatRow {
  igdb_id: number;
  hastily_seconds: number | null;
  normally_seconds: number | null;
  completely_seconds: number | null;
}

// --- Wikidata --------------------------------------------------------------

/** One bound variable in a SPARQL results document. */
export interface SparqlBinding {
  type?: string;
  value?: string;
  datatype?: string;
  'xml:lang'?: string;
}

/**
 * The `application/sparql-results+json` document the Wikidata Query Service
 * returns. Only the part we read is modelled: a list of rows, each row a map
 * from variable name to binding. A variable that matched nothing in a row is
 * absent from that row's map rather than null, which is why every lookup here
 * has to cope with `undefined`.
 */
export interface SparqlResults {
  head?: { vars?: string[] };
  results?: { bindings?: Array<Record<string, SparqlBinding | undefined>> };
}

/**
 * One row of the cross-link query: the identifiers Wikidata bound for one
 * IGDB id, keyed by IGDB id because Wikidata has never heard of our
 * `media_item_id`.
 *
 * Every identifier is optional because every column but `?igdb` is OPTIONAL in
 * the query, and one game can produce several of these rows when a column is
 * multi-valued. `dedupeCrossLinks` in db.ts is what collapses them into one
 * answer per game; nothing here decides anything.
 *
 * The keys are exactly {@link CrossLinkKey}, so a new identifier is a row in
 * `CROSS_LINK_PROPERTIES` and nothing else.
 */
export type CrossLinkRow = { igdb_id: number } & Partial<
  Record<'opencritic' | 'hltb' | 'steam', number> & Record<'metacritic' | 'gog' | 'epic', string>
>;

/** One game the cross-link pass should ask Wikidata about. */
export interface CrossLinkCandidate {
  media_item_id: string;
  igdb_id: number;
  /** True when some user has this in their entries or their ranking. */
  tracked: boolean;
}

// --- OpenCritic ------------------------------------------------------------

/**
 * The part of `GET /game/{id}` the catalog reads.
 *
 * Field names taken from the OpenCritic API's own shape, cross-checked on
 * 2026-09-16 against two independent open-source clients of it rather than
 * invented: the `opencritic-mcp` package, which calls this RapidAPI listing
 * and types `GET /game/{id}` with exactly these names, and `southern_light`'s
 * `opencritic_integration.ApiGame` Go struct. The RapidAPI documentation page
 * renders its example response in JavaScript and could not be fetched, so the
 * fixtures in test/fixtures are assembled from those field names rather than
 * captured from the docs; the first live run is the thing that confirms them.
 *
 * Everything is optional because a game with no reviews yet is still a valid
 * response, and OpenCritic has historically answered such a game with a
 * sentinel (`topCriticScore` of -1) rather than with a missing field. The
 * mapper therefore tests the range instead of trusting the presence.
 */
export interface OpenCriticGame {
  id?: number;
  name?: string;
  /** Average of OpenCritic's Top Critic outlets, 0-100. */
  topCriticScore?: number | null;
  /** Share of those critics who recommend the game, 0-100. */
  percentRecommended?: number | null;
  /** Every review OpenCritic has, Top Critic or not. */
  numReviews?: number | null;
  /** Reviews from Top Critic outlets: what both figures above are over. */
  numTopCriticReviews?: number | null;
  /** "Mighty", "Strong", "Fair", "Weak"; null while a game is unscored. */
  tier?: string | null;
}

/** One game the scores pass should fetch, from the selection query. */
export interface OpenCriticScoreTarget {
  media_item_id: string;
  opencritic_id: number;
  /** True when some user has this in their entries or their ranking. */
  tracked: boolean;
}

/** What one game's OpenCritic round trip yielded. */
export interface OpenCriticScoreResult {
  media_item_id: string;
  opencritic_id: number;
  /** The `opencritic` row, absent while the game has no Top Critic reviews. */
  topCritic: ExternalScoreRow | null;
  /** The `opencritic_recommended` row, absent on the same condition. */
  recommended: ExternalScoreRow | null;
  /**
   * True when `percentRecommended` came back strictly between 0 and 1, which
   * reads as a fraction rather than a percentage. The row is withheld and the
   * run says so once. See `mapOpenCriticScores` for why.
   */
  recommendedScaleSuspect: boolean;
}
// Where to play ---------------------------------------------------------------
// Subscription availability, ROADMAP.md V1. Three sources, one table: see
// supabase/migrations/20260916183000_game_availability.sql and availability.ts.

/** One entry of NVIDIA's supported-game JSON (game-data-sources.md 9.4). */
export interface GfnEntry {
  /** NVIDIA's own id for the entry. Goes into `source_ref`. */
  id?: number;
  title?: string;
  /**
   * The Steam store page, or the empty string for an Epic, Ubisoft Connect,
   * GOG or Origin entry. Present on every record either way.
   */
  steamUrl?: string;
  store?: string;
  publisher?: string;
  genres?: string[];
  /** `AVAILABLE`, `MAINTENANCE` or `PATCHING`. Not filtered on: see gfn.ts. */
  status?: string;
}

/** One Game Pass collection and the `service` id its members get. */
export interface GamePassCollection {
  service: string;
  /** The opaque collection id `catalog.gamepass.com/sigls/v2` takes. */
  siglId: string;
}

/**
 * One element of a `sigls/v2` answer: either the collection's header (which
 * carries `siglId` and a title) or a member (which carries only `id`).
 */
export interface SiglEntry {
  siglId?: string;
  id?: string;
  title?: string;
  description?: string;
}

/** One product of a displaycatalog answer, trimmed to what we read. */
export interface DisplayCatalogProduct {
  ProductId?: string;
  ProductType?: string;
  /** One entry per requested language; we ask for one. */
  LocalizedProperties?: Array<{ ProductTitle?: string; ShortTitle?: string }>;
}

export interface DisplayCatalogResponse {
  Products?: DisplayCatalogProduct[];
}

/** One subscription IsThereAnyDeal reports a game is in. */
export interface ItadSubscription {
  /** ITAD's numeric id for the subscription. Not stored: the slug is. */
  id?: number;
  name?: string;
  /** ISO timestamp when the game is announced to leave, or null. */
  leaving?: string | null;
}

/** One element of a `/games/subs/v1` answer. */
export interface ItadGameSubscriptions {
  /** ITAD's game id (a uuid), the one we asked about. */
  id?: string;
  subs?: ItadSubscription[];
}

/** A catalog row reduced to what a title match needs. */
export interface CatalogTitleRow {
  media_item_id: string;
  title: string;
}

/** One source entry, reduced to the key it joins on. */
export interface SourceKey {
  /** The normalized title, or the Steam app id as text. */
  key: string;
  /** The source's own id for the game, destined for `source_ref`. */
  sourceRef: string | null;
  /** The source's title, for the log only. Never matched on directly. */
  title: string;
}

/** What one source's entries mapped to, before the catalog is consulted. */
export interface GfnMatchKey extends SourceKey {}

export interface MatchCounts {
  /** Entries dropped because two of them shared one key. */
  ambiguousSource: number;
  /** Entries dropped because two catalog rows shared the key. */
  ambiguousCatalog: number;
  /** Entries whose key is not in the catalog at all. */
  unmatched: number;
}

export interface MatchResult {
  matched: Array<{ media_item_id: string; source_ref: string | null }>;
  counts: MatchCounts;
  /** A few titles of each kind of miss, so a log line is actionable. */
  examples: { ambiguousSource: string[]; ambiguousCatalog: string[]; unmatched: string[] };
}

/** A row destined for `public.game_availability`, minus the timestamps. */
export interface AvailabilityRow {
  media_item_id: string;
  service: string;
  region: string;
  source_ref: string | null;
}

/** One game the IsThereAnyDeal pass should ask about. */
export interface ItadTarget {
  media_item_id: string;
  steam_app_id: number;
  /** True when some user has this in their entries or their ranking. */
  tracked: boolean;
}
