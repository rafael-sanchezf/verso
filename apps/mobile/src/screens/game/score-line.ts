/**
 * Which number the score line shows, and whose number it is.
 *
 * Rule 21, one scoreboard per source: every figure on this row carries the name
 * of the source that published it, and two sources are never averaged into a
 * number nobody published. So each of the two columns is a fallback chain of
 * named sources rather than a value:
 *
 *   Critics  Valve's licensed metascore, labelled "Metacritic"; failing that
 *            IGDB's critic aggregate, labelled "IGDB critics".
 *   Players  Steam's review phrase, labelled "Steam"; failing that IGDB's
 *            community rating, labelled "IGDB users".
 *
 * The two IGDB labels carry their kind rather than reading "IGDB" twice
 * (game-page.md, decided 2026-09-16): the first real-data run turned up a game
 * with neither a metascore nor a Steam page, and the row read "93 IGDB 89
 * IGDB", which looks like one source disagreeing with itself. Labelled by kind
 * they are two sources again, which is what rule 21 is for.
 *
 * A source with no data is hidden, never drawn as a zero (rule 9): a metascore
 * of 0 is not a thing that happens, so a 0 in the column means the mirror has
 * nothing and the column does not render.
 *
 * "You" is the third item and appears only once the game is ranked, because the
 * score is read off the ranked list's position and does not exist before then.
 * It is not in the frame; it is rule 21's last sentence, coded from the
 * convention.
 *
 * Pure on purpose — this is the part of the page that is wrong in ways nobody
 * notices by looking at it.
 */

import { steamReviewPhrase } from '@verso/core';

import type { TranslationKey } from '../../lib/i18n/dictionary';

import type { ScoresBySource } from '@verso/api';

/**
 * One column of the score line. The label is a dictionary key the row says
 * (the Spanish wave): a source's name reads the same in both languages, "IGDB
 * critics" and "You" do not.
 */
export type ScoreLineItem =
  /** A published figure and the name of whoever published it. */
  | { key: 'critics' | 'players'; value: string; label: TranslationKey }
  /** The caller's own score, drawn as a `ScoreBadge` rather than as text. */
  | { key: 'you'; score: number; label: 'browse.game.scores.you' };

/** The caller's placement, as `gamePage` returns it. Only the score is needed here. */
interface Placement {
  score: number;
}

/**
 * A published rating, if there is one worth showing.
 *
 * `external_scores.score` is `numeric(5, 2)` and arrives as a number or null.
 * Anything that is not a real, positive rating counts as "no data", which keeps
 * the zero case out of the UI at the only place that can decide it.
 */
function rating(score: number | null | undefined): number | null {
  if (score === null || score === undefined || !Number.isFinite(score) || score <= 0) return null;
  return Math.round(score);
}

/** Critics: Metacritic where Valve licenses it, otherwise IGDB's aggregate. */
export function criticsItem(scores: ScoresBySource): ScoreLineItem | null {
  const metacritic = rating(scores.metacritic?.score);
  if (metacritic !== null) return { key: 'critics', value: String(metacritic), label: 'browse.game.scores.metacritic' };

  const igdb = rating(scores.igdb_critics?.score);
  if (igdb !== null) return { key: 'critics', value: String(igdb), label: 'browse.game.scores.igdbCritics' };

  return null;
}

/**
 * Players: Steam's phrase, otherwise IGDB's user rating.
 *
 * The phrase is derived from the percentage and the review count and is null
 * below ten reviews, where Steam itself shows no summary. That is a fall
 * through to IGDB rather than an empty column: the game has players, we just
 * cannot honestly summarise Steam's opinion of it.
 */
export function playersItem(scores: ScoresBySource): ScoreLineItem | null {
  const steam = scores.steam;
  if (steam && steam.score !== null && steam.scoreCount !== null) {
    const phrase = steamReviewPhrase(steam.score, Math.round(steam.scoreCount));
    if (phrase !== null) return { key: 'players', value: phrase, label: 'browse.game.scores.steam' };
  }

  const igdb = rating(scores.igdb_users?.score);
  if (igdb !== null) return { key: 'players', value: String(igdb), label: 'browse.game.scores.igdbUsers' };

  return null;
}

/** The whole row, left to right, with the columns that have nothing left out. */
export function scoreLineItems(
  scores: ScoresBySource,
  ranking: Placement | null,
): ScoreLineItem[] {
  const items: ScoreLineItem[] = [];

  const critics = criticsItem(scores);
  if (critics) items.push(critics);

  const players = playersItem(scores);
  if (players) items.push(players);

  if (ranking) items.push({ key: 'you', score: ranking.score, label: 'browse.game.scores.you' });

  return items;
}
