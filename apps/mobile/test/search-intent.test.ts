import { describe, expect, it } from 'vitest';

import { isSelectedTab, parseSearchIntent, playingIntentControl, searchHref } from '../src/screens/search/intent';

describe('playingIntentControl', () => {
  const today = '2026-09-23';

  it('offers Playing for a game that is out, today included', () => {
    expect(playingIntentControl('2020-09-17', { today })).toBe('play');
    expect(playingIntentControl(today, { today })).toBe('play');
  });

  it('never offers Playing for a game that is not out: the row keeps the add pill (phone feedback entry 10)', () => {
    expect(playingIntentControl('2026-09-24', { today })).toBe('add');
    expect(playingIntentControl('2027-02-12', { today })).toBe('add');
  });

  it('treats an undated game, and one whose date has not been read yet, as out', () => {
    // The same rule as the add sheet; the write asks the catalog again anyway.
    expect(playingIntentControl(null, { today })).toBe('play');
    expect(playingIntentControl(undefined, { today })).toBe('play');
  });
});

describe('parseSearchIntent', () => {
  it('reads the playing intent', () => {
    expect(parseSearchIntent('playing')).toBe('playing');
  });

  it("reads the add-many intent, Ranking's \"I know what I played\"", () => {
    expect(parseSearchIntent('addmany')).toBe('addmany');
    expect(parseSearchIntent('add-many')).toBeNull();
    expect(parseSearchIntent('addMany')).toBeNull();
  });

  it('is plain Search with no param', () => {
    expect(parseSearchIntent(undefined)).toBeNull();
    expect(parseSearchIntent(null)).toBeNull();
  });

  it('is plain Search once the screen has cleared the param', () => {
    // The screen writes back an empty string to take the request off the route.
    expect(parseSearchIntent('')).toBeNull();
  });

  it('refuses a value it has no drawing for, rather than guessing', () => {
    expect(parseSearchIntent('backlog')).toBeNull();
    expect(parseSearchIntent('Playing')).toBeNull();
    expect(parseSearchIntent(' playing ')).toBeNull();
  });

  it('takes the first value when the query string repeats the key', () => {
    expect(parseSearchIntent(['playing', 'backlog'])).toBe('playing');
    expect(parseSearchIntent(['backlog', 'playing'])).toBeNull();
    expect(parseSearchIntent([])).toBeNull();
  });
});

describe('searchHref', () => {
  it('points at the Search tab with the intent as its param', () => {
    expect(searchHref('playing')).toEqual({ pathname: '/search', params: { intent: 'playing' } });
  });

  it('round-trips through the parser', () => {
    expect(parseSearchIntent(searchHref('playing').params.intent)).toBe('playing');
    expect(parseSearchIntent(searchHref('addmany').params.intent)).toBe('addmany');
  });
});

describe('isSelectedTab', () => {
  const tabs = {
    routes: [{ key: 'index-1' }, { key: 'search-2' }, { key: 'ranking-3' }],
  };

  it('keeps the intent while Search is the selected tab', () => {
    expect(isSelectedTab({ ...tabs, index: 1 }, 'search-2')).toBe(true);
  });

  it('ends it when another tab is selected, Home after a pick included', () => {
    expect(isSelectedTab({ ...tabs, index: 0 }, 'search-2')).toBe(false);
    expect(isSelectedTab({ ...tabs, index: 2 }, 'search-2')).toBe(false);
  });

  it('keeps it when the navigator state is not known', () => {
    expect(isSelectedTab(undefined, 'search-2')).toBe(true);
    expect(isSelectedTab(null, 'search-2')).toBe(true);
  });

  it('ends it for an index that points at nothing', () => {
    expect(isSelectedTab({ ...tabs, index: 7 }, 'search-2')).toBe(false);
  });
});
