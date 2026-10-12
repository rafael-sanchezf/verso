/**
 * The sentence under the buttons and the label on the button beside "I finished
 * this". Both are chains of conditions, and both are read by someone deciding
 * what to do next, so a wrong one is a wrong instruction rather than a cosmetic
 * bug.
 */

import { releaseState } from '@verso/api';
import { describe, expect, it } from 'vitest';

import { primaryAction, secondaryAction, statusChoices, statusLine } from '../src/screens/game/status';

import type { Entry } from '@verso/api';

/** A fixed "now" so nothing here depends on the day the suite runs. */
const NOW = new Date(2026, 8, 16, 14, 30); // Wednesday 16 September 2026

function entry(patch: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    mediaItemId: 'game-1',
    status: 'backlog',
    addedAt: '2026-09-02T10:00:00Z',
    startedAt: null,
    finishedAt: null,
    purchasedAt: null,
    notes: null,
    playtimeMinutes: null,
    playtimeSource: null,
    playedPlatforms: [],
    backlogPosition: 0,
    plannedOn: null,
    ...patch,
  };
}

describe('statusLine', () => {
  it('says nothing for a game the caller does not track', () => {
    expect(statusLine(null, NOW)).toBeNull();
  });

  it('dates the backlog from when it was added', () => {
    expect(statusLine(entry(), NOW)).toEqual({
      text: 'In your backlog since Sep 2',
      playing: false,
    });
  });

  it('names the source of an imported playtime and marks the dot', () => {
    const line = statusLine(
      entry({
        status: 'playing',
        startedAt: '2026-09-10T18:00:00Z',
        playtimeMinutes: 845,
        playtimeSource: 'steam',
      }),
      NOW,
    );

    expect(line).toEqual({ text: 'Playing since Sep 10 · 14 h on Steam', playing: true });
  });

  it('says a hand-entered figure is hand-entered', () => {
    const line = statusLine(
      entry({ status: 'playing', startedAt: '2026-09-10T18:00:00Z', playtimeMinutes: 120, playtimeSource: 'manual' }),
      NOW,
    );

    expect(line?.text).toBe('Playing since Sep 10 · 2 h by hand');
  });

  it('drops the parts it does not have', () => {
    expect(statusLine(entry({ status: 'playing' }), NOW)?.text).toBe('Playing');
    expect(statusLine(entry({ status: 'played' }), NOW)?.text).toBe('Played');
  });

  it('dates a finished game, and shows the year once it is not this one', () => {
    expect(statusLine(entry({ status: 'played', finishedAt: '2026-09-14' }), NOW)?.text).toBe(
      'Finished Sep 14',
    );
    expect(statusLine(entry({ status: 'played', finishedAt: '2025-12-30' }), NOW)?.text).toBe(
      'Finished Dec 30, 2025',
    );
  });

  it('has one word for a dropped game', () => {
    expect(statusLine(entry({ status: 'dropped' }), NOW)).toEqual({
      text: 'Dropped',
      playing: false,
    });
  });
});

/** The day the release cases below are judged from. */
const TODAY = '2026-09-16';

/** A game that came out years ago, as the page builds its release state. */
const OUT = releaseState('2020-09-17', { today: TODAY });

/** A game that is not out yet: dated after today, and undated with the catalog saying so. */
const SOON = releaseState('2026-11-19', { today: TODAY });
const ANNOUNCED = releaseState(null, { today: TODAY, status: 'unreleased' });

describe('primaryAction', () => {
  it('is the core loop until the game is ranked', () => {
    expect(primaryAction(null, OUT)).toEqual({ label: 'I finished this', disabled: false });
  });

  it('becomes the score, and stops being a button', () => {
    expect(primaryAction({ score: 8.4 }, OUT)).toEqual({ label: 'Ranked · 8.4', disabled: true });
    expect(primaryAction({ score: 10 }, OUT)).toEqual({ label: 'Ranked · 10.0', disabled: true });
  });

  it('is not offered for a game that is not out (phone feedback entry 10)', () => {
    expect(primaryAction(null, SOON)).toBeNull();
    expect(primaryAction(null, ANNOUNCED)).toBeNull();
  });

  it('is offered for a game out today, and for an undated one the catalog says nothing about', () => {
    expect(primaryAction(null, releaseState(TODAY, { today: TODAY }))?.label).toBe('I finished this');
    expect(primaryAction(null, releaseState(null, { today: TODAY }))?.label).toBe('I finished this');
  });

  it('still shows the score of a ranked game that is not out, which is a fact rather than an offer', () => {
    expect(primaryAction({ score: 7 }, SOON)).toEqual({ label: 'Ranked · 7.0', disabled: true });
  });
});

describe('secondaryAction', () => {
  it('offers the backlog for a game the caller does not track', () => {
    expect(secondaryAction(null, false, OUT)).toEqual({ label: 'Add to backlog', kind: 'backlog' });
  });

  it('starts a backlog game, one tap (rule 10)', () => {
    expect(secondaryAction(entry({ status: 'backlog' }), false, OUT)).toEqual({
      label: 'Start playing',
      kind: 'play',
    });
  });

  it('offers the ranking to a game that was played and never ranked', () => {
    expect(secondaryAction(entry({ status: 'played' }), false, OUT)).toEqual({
      label: 'Rank it',
      kind: 'rank',
    });
  });

  it('sends a playing or dropped game back to the backlog', () => {
    expect(secondaryAction(entry({ status: 'playing' }), false, OUT)?.kind).toBe('backlog');
    expect(secondaryAction(entry({ status: 'dropped' }), false, OUT)?.kind).toBe('backlog');
  });

  it('is about position once the game is ranked, whatever its status', () => {
    expect(secondaryAction(entry({ status: 'played' }), true, OUT)).toEqual({
      label: 'Move in Ranking',
      kind: 'move',
    });
    expect(secondaryAction(null, true, OUT)?.kind).toBe('move');
  });
});

describe('secondaryAction for a game that is not out', () => {
  it('offers the backlog to a game the caller does not track', () => {
    expect(secondaryAction(null, false, SOON)).toEqual({ label: 'Add to backlog', kind: 'backlog' });
    expect(secondaryAction(null, false, ANNOUNCED)).toEqual({ label: 'Add to backlog', kind: 'backlog' });
  });

  it('never offers Start playing or Rank it', () => {
    for (const status of ['backlog', 'playing', 'played', 'dropped'] as const) {
      const action = secondaryAction(entry({ status }), false, SOON);
      expect(action === null || action.kind === 'backlog').toBe(true);
    }
  });

  it('has nothing to offer once the game is in the backlog', () => {
    expect(secondaryAction(entry({ status: 'backlog' }), false, SOON)).toBeNull();
  });

  it('sends a game marked playing, played or dropped before it was out back to the backlog', () => {
    expect(secondaryAction(entry({ status: 'playing' }), false, SOON)?.kind).toBe('backlog');
    expect(secondaryAction(entry({ status: 'played' }), false, SOON)?.kind).toBe('backlog');
    expect(secondaryAction(entry({ status: 'dropped' }), false, SOON)?.kind).toBe('backlog');
  });
});

describe('statusChoices', () => {
  it('offers all four statuses for a game that is out', () => {
    expect(statusChoices(OUT).map((choice) => choice.label)).toEqual([
      'Backlog',
      'Playing',
      'Played',
      'Dropped',
    ]);
  });

  it('offers Backlog alone for a game that is not out (polish list question 1)', () => {
    expect(statusChoices(SOON).map((choice) => choice.status)).toEqual(['backlog']);
    expect(statusChoices(ANNOUNCED).map((choice) => choice.status)).toEqual(['backlog']);
  });
});
