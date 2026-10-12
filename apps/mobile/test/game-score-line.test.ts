/**
 * The score line is rule 21 in code: one scoreboard per source, every number
 * labelled, nothing averaged, no zeroes standing in for missing data. All of
 * that is decided by which source wins a fallback chain, which is exactly the
 * kind of thing that looks right on screen while being wrong.
 */

import { describe, expect, it } from 'vitest';

import { criticsItem, playersItem, scoreLineItems } from '../src/screens/game/score-line';

import type { ExternalScore, ScoresBySource } from '@verso/api';

function score(source: string, value: number | null, count: number | null = null): ExternalScore {
  return { source, score: value, scoreCount: count, fetchedAt: '2026-09-16T00:00:00Z' };
}

describe('criticsItem', () => {
  it('prefers Metacritic and says so', () => {
    const scores: ScoresBySource = {
      metacritic: score('metacritic', 92),
      igdb_critics: score('igdb_critics', 88.4, 12),
    };

    expect(criticsItem(scores)).toEqual({ key: 'critics', value: '92', label: 'Metacritic' });
  });

  it('falls back to IGDB, rounded, and says which IGDB figure it is', () => {
    expect(criticsItem({ igdb_critics: score('igdb_critics', 88.6, 12) })).toEqual({
      key: 'critics',
      value: '89',
      label: 'IGDB critics',
    });
  });

  it('hides a source with no data rather than drawing a zero', () => {
    expect(criticsItem({})).toBeNull();
    expect(criticsItem({ metacritic: score('metacritic', null) })).toBeNull();
    expect(criticsItem({ igdb_critics: score('igdb_critics', 0, 0) })).toBeNull();
  });
});

describe('playersItem', () => {
  it("is Steam's phrase, never a percentage next to a metascore", () => {
    const scores: ScoresBySource = {
      steam: score('steam', 96.2, 1200),
      igdb_users: score('igdb_users', 91),
    };

    expect(playersItem(scores)).toEqual({
      key: 'players',
      value: 'Overwhelmingly Positive',
      label: 'Steam',
    });
  });

  it('falls through to IGDB when Steam has too few reviews to summarise', () => {
    const scores: ScoresBySource = {
      steam: score('steam', 100, 4),
      igdb_users: score('igdb_users', 78.5),
    };

    expect(playersItem(scores)).toEqual({ key: 'players', value: '79', label: 'IGDB users' });
  });

  it('has nothing to say when Steam has a review count but no percentage', () => {
    expect(playersItem({ steam: score('steam', null, 900) })).toBeNull();
  });
});

describe('scoreLineItems', () => {
  it('draws the sources it has, in order', () => {
    const items = scoreLineItems(
      { metacritic: score('metacritic', 90), steam: score('steam', 85, 400) },
      null,
    );

    expect(items).toEqual([
      { key: 'critics', value: '90', label: 'Metacritic' },
      { key: 'players', value: 'Very Positive', label: 'Steam' },
    ]);
  });

  it('adds "You" only once the game is ranked', () => {
    expect(scoreLineItems({}, null)).toEqual([]);
    expect(scoreLineItems({}, { score: 8.4 })).toEqual([{ key: 'you', score: 8.4, label: 'You' }]);
  });

  it('never labels two sources the same when both fall back to IGDB', () => {
    // The real-data run's "93 IGDB 89 IGDB" (game-page.md, 2026-09-16): a game
    // with no metascore and no Steam page reads as one source contradicting
    // itself unless each label carries its kind.
    const items = scoreLineItems(
      { igdb_critics: score('igdb_critics', 93.4, 40), igdb_users: score('igdb_users', 88.7, 900) },
      null,
    );

    expect(items).toEqual([
      { key: 'critics', value: '93', label: 'IGDB critics' },
      { key: 'players', value: '89', label: 'IGDB users' },
    ]);
    expect(new Set(items.map((item) => item.label)).size).toBe(items.length);
  });

  it('puts the caller last, after whoever published a number', () => {
    const items = scoreLineItems({ igdb_critics: score('igdb_critics', 80) }, { score: 9.1 });

    expect(items.map((item) => item.key)).toEqual(['critics', 'you']);
  });
});
