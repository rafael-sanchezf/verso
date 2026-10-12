/**
 * `releaseState` is pure, so this suite needs no stack. It pins the rule to
 * the one the Upcoming list applies in SQL (`release_date > today`, undated
 * means released): the add sheet and Coming up must never disagree about
 * whether a game is out.
 */

import { describe, expect, it } from 'vitest';

import { todayLocal } from '../src/entries';
import { releaseState } from '../src/release';

const TODAY = '2026-09-23';

describe('releaseState', () => {
  it('calls a game with a future date unreleased, and carries the date', () => {
    expect(releaseState('2026-11-19', { today: TODAY })).toEqual({
      released: false,
      releaseDate: '2026-11-19',
    });
  });

  it('calls a game out tomorrow unreleased', () => {
    expect(releaseState('2026-09-24', { today: TODAY })).toEqual({
      released: false,
      releaseDate: '2026-09-24',
    });
  });

  it('calls a game out today released, the day it leaves Upcoming', () => {
    expect(releaseState(TODAY, { today: TODAY })).toEqual({ released: true });
  });

  it('calls a game with a past date released', () => {
    expect(releaseState('2020-09-17', { today: TODAY })).toEqual({ released: true });
  });

  it('lets the date decide when there is one, whatever the status says', () => {
    expect(releaseState('2020-09-17', { today: TODAY, status: 'unreleased' })).toEqual({
      released: true,
    });
    expect(releaseState('2027-02-01', { today: TODAY, status: 'released' })).toEqual({
      released: false,
      releaseDate: '2027-02-01',
    });
  });

  it('calls an undated game released when the catalog stores no status', () => {
    expect(releaseState(null, { today: TODAY })).toEqual({ released: true });
    expect(releaseState(undefined, { today: TODAY })).toEqual({ released: true });
    expect(releaseState(null, { today: TODAY, status: null })).toEqual({ released: true });
  });

  it('calls an undated game unreleased only when a stored status says so', () => {
    expect(releaseState(null, { today: TODAY, status: 'unreleased' })).toEqual({
      released: false,
      releaseDate: null,
    });
    expect(releaseState(null, { today: TODAY, status: 'released' })).toEqual({ released: true });
  });

  it('reads today from the device when not told', () => {
    const today = todayLocal();
    expect(releaseState(today)).toEqual({ released: true });
    expect(releaseState('9999-12-31')).toEqual({ released: false, releaseDate: '9999-12-31' });
    expect(releaseState('1970-01-01')).toEqual({ released: true });
  });
});
