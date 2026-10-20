/**
 * Where the review goes after Done, and where "Rank more" goes, per source.
 */

import { describe, expect, it } from 'vitest';

import { doneTarget, PC_PLATFORM, rankMoreTarget } from '../src/screens/onboarding/session/navigation';

describe('doneTarget', () => {
  it('offers Link Steam to a new PC player with no link, and sends everyone else home', () => {
    expect(doneTarget('steam-or-tabs', { platforms: [PC_PLATFORM, 'PlayStation 5'], steamLinked: false })).toBe('steam');
    expect(doneTarget('steam-or-tabs', { platforms: [PC_PLATFORM], steamLinked: true })).toBe('tabs');
    expect(doneTarget('steam-or-tabs', { platforms: ['PlayStation 5'], steamLinked: false })).toBe('tabs');
    expect(doneTarget('steam-or-tabs', { platforms: [], steamLinked: false })).toBe('tabs');
  });

  it('goes home when either read failed rather than to a screen nobody checked', () => {
    expect(doneTarget('steam-or-tabs', { platforms: null, steamLinked: false })).toBe('tabs');
    expect(doneTarget('steam-or-tabs', { platforms: [PC_PLATFORM], steamLinked: null })).toBe('tabs');
  });

  it('leaves the stack for a door, and goes on to the deck after the seeds', () => {
    expect(doneTarget('back', { platforms: null, steamLinked: null })).toBe('leave');
    expect(doneTarget('deck', { platforms: [PC_PLATFORM], steamLinked: false })).toBe('deck');
  });

  it('ends the film deck on the Letterboxd door, never on Link Steam (movies-build.md, PR 6)', () => {
    expect(doneTarget('letterboxd', { platforms: [PC_PLATFORM], steamLinked: false })).toBe('letterboxd');
    expect(doneTarget('letterboxd', { platforms: null, steamLinked: null })).toBe('letterboxd');
  });
});

describe('rankMoreTarget', () => {
  it('goes back to the deck it came from, to add-many, or to the returning deck from the drain', () => {
    expect(rankMoreTarget({ source: 'deck', onDone: 'steam-or-tabs' })).toBe('back-to-deck');
    expect(rankMoreTarget({ source: 'deck', onDone: 'back' })).toBe('back-to-deck');
    expect(rankMoreTarget({ source: 'add-many', onDone: 'back' })).toBe('search-add-many');
    expect(rankMoreTarget({ source: 'drain', onDone: 'back' })).toBe('deck-returning');
    expect(rankMoreTarget({ source: 'seeds', onDone: 'deck' })).toBe('deck-new');
  });
});
