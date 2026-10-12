import { describe, expect, it } from 'vitest';

import { parseRecent, RECENT_KEY, RECENT_LIMIT, withRecent } from '../src/screens/search/recent';

describe('withRecent', () => {
  it('puts the newest search at the front', () => {
    expect(withRecent(['hades'], 'silksong')).toEqual(['silksong', 'hades']);
  });

  it('moves a repeat rather than duplicating it', () => {
    expect(withRecent(['hades', 'silksong', 'hollow knight'], 'silksong')).toEqual([
      'silksong',
      'hades',
      'hollow knight',
    ]);
  });

  it('treats case and surrounding space as the same search, keeping the newest spelling', () => {
    expect(withRecent(['hades'], '  Hades ')).toEqual(['Hades']);
  });

  it('keeps at most ten', () => {
    const many = Array.from({ length: RECENT_LIMIT }, (_, index) => `game ${index}`);
    const next = withRecent(many, 'silksong');

    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe('silksong');
    expect(next).not.toContain(`game ${RECENT_LIMIT - 1}`);
  });

  it('ignores a blank query, so nothing is remembered from an empty field', () => {
    expect(withRecent(['hades'], '')).toEqual(['hades']);
    expect(withRecent(['hades'], '   ')).toEqual(['hades']);
  });

  it('does not mutate the list it was given', () => {
    const list = ['hades'];
    withRecent(list, 'silksong');
    expect(list).toEqual(['hades']);
  });
});

describe('parseRecent', () => {
  it('reads a stored list', () => {
    expect(parseRecent(JSON.stringify(['hades', 'silksong']))).toEqual(['hades', 'silksong']);
  });

  it('is empty for nothing stored, bad JSON, or a value that is not a list', () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('')).toEqual([]);
    expect(parseRecent('{not json')).toEqual([]);
    expect(parseRecent(JSON.stringify({ hades: true }))).toEqual([]);
  });

  it('drops entries that are not queries and cleans the ones that are', () => {
    expect(parseRecent(JSON.stringify([' hades ', 42, null, '', 'Hades', 'silksong']))).toEqual([
      'hades',
      'silksong',
    ]);
  });

  it('caps a longer stored list', () => {
    const many = Array.from({ length: 25 }, (_, index) => `game ${index}`);
    expect(parseRecent(JSON.stringify(many))).toHaveLength(RECENT_LIMIT);
  });
});

describe('the storage key', () => {
  it('is the one specs/search.md names', () => {
    expect(RECENT_KEY).toBe('search.recent');
  });
});
