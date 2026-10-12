/**
 * Media-agnostic core model. Mirrors the tables in supabase/migrations.
 * Game-specific fields live in GameDetails; movies and TV get their own
 * extension types later without touching these.
 *
 * `UserEntry` and `RankingEntry` used to live here too, mirroring
 * `user_entries` and `ranking_entries`. Both drifted from the schema with
 * nobody noticing (ROADMAP.md work queue item 11), because nothing ever
 * imported them: by the time screens needed that data, `packages/api` had
 * already grown its own accurate, RLS-aware shapes for it — `Entry` in
 * `entries.ts` (no `userId`: every row that reaches the app is the caller's,
 * so carrying the id would only invite a screen to filter on something the
 * database already decided) and `RankingEntryPlacement` in `ranking.ts`. Once
 * `UserEntry` and `RankingEntry` were made truthful they were exact
 * duplicates of those two, so they were deleted here rather than kept as a
 * second copy that can drift again. Import `Entry` and `RankingEntryPlacement`
 * from `@verso/api` instead.
 */

export type Medium = 'game' | 'movie' | 'tv';

export type EntryStatus = 'backlog' | 'playing' | 'played' | 'dropped';

export type Tier = 'loved' | 'liked' | 'fine' | 'disliked';

export const TIERS: readonly Tier[] = ['loved', 'liked', 'fine', 'disliked'];

/** Each tier owns a fixed band of the 0 to 10 scale. Position within the tier interpolates inside the band. */
export const TIER_BANDS: Readonly<Record<Tier, readonly [low: number, high: number]>> = {
  loved: [8.5, 10],
  liked: [6.5, 8.4],
  fine: [4, 6.4],
  disliked: [0, 3.9],
};

export type ComparisonOutcome = 'a' | 'b' | 'too_close' | 'cant_compare';

/**
 * Why the comparison screen put this particular opponent in front of the user.
 *
 * 'genre' whenever the opponent shares a genre with the new item that the
 * engine has not been told to ignore, carrying that genre. That is the case the
 * genre-preferring pivot rule exists to produce, and it is also what the screen
 * reacts to: a cue beside the cards and "Which RPG did you enjoy more?" instead
 * of the generic prompt (rule 23 in docs/design/ui-principles.md). A midpoint
 * that happens to be a genre peer counts, because the player sees two games of
 * the same kind either way.
 *
 * 'midpoint' otherwise: plain binary search, generic prompt, no cue.
 *
 * Stored with every comparison so the log says what the user was actually
 * asked, not just what they answered.
 */
export type PivotReason = { kind: 'genre'; genre: string } | { kind: 'midpoint' };

export interface MediaItem {
  id: string;
  medium: Medium;
  title: string;
  year: number | null;
  coverImageId: string | null;
  /**
   * The full release date, where the catalog has one; `year` is the display
   * form of the same fact. Null when IGDB has no date (an announced game with
   * none yet, or an older game IGDB never dated). See
   * supabase/migrations/20260915235900_ownership_release_dates.sql.
   */
  releaseDate: string | null;
  externalIds: Record<string, string | number>;
}

export interface GameDetails {
  mediaItemId: string;
  igdbId: number;
  platforms: string[];
  genres: string[];
  /** IGDB average seconds to reach the credits without notable extras. */
  hastilySeconds: number | null;
  /** IGDB average seconds to finish while mixing in some extras. The single figure the game page shows. */
  normallySeconds: number | null;
  /** IGDB average seconds to reach 100% completion. */
  completelySeconds: number | null;
  developer: string | null;
  summary: string | null;
}

/** One head-to-head answer. Append-only; the ranking can be rebuilt from these. */
export interface ComparisonRecord {
  itemA: string;
  itemB: string;
  outcome: ComparisonOutcome;
  context: {
    tier: Tier;
    sameGenre: boolean;
    /** Size of the tier list at the time of the comparison. */
    tierSize: number;
    /** Why this opponent was the one shown, and so which prompt the user read. */
    pivotReason: PivotReason;
  };
}
