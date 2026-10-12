import { describe, expect, it } from 'vitest';

import { popularSubtitle, searchSubtitle } from '../src/screens/search/subtitle';

/** A `search_games` hit, with only the fields the subtitle reads. */
function hit(overrides: Partial<Parameters<typeof searchSubtitle>[0]> = {}) {
  return {
    year: 2025 as number | null,
    platforms: ['Switch 2', 'PC'],
    developer: 'Team Cherry' as string | null,
    ...overrides,
  };
}

describe('searchSubtitle', () => {
  it('is the year and the platforms', () => {
    expect(searchSubtitle(hit())).toBe('2025 · Switch 2, PC');
  });

  it('caps the platforms at three and counts the rest', () => {
    expect(
      searchSubtitle(hit({ platforms: ['PC', 'PS5', 'Switch 2', 'Xbox Series X', 'macOS'] })),
    ).toBe('2025 · PC, PS5, Switch 2 +2');
  });

  it('falls back to the year alone when the catalog lists no platforms', () => {
    expect(searchSubtitle(hit({ platforms: [] }))).toBe('2025');
  });

  it('shows the platforms alone when the catalog has no year', () => {
    expect(searchSubtitle(hit({ year: null }))).toBe('Switch 2, PC');
  });

  it('falls back to the developer when neither is known', () => {
    expect(searchSubtitle(hit({ year: null, platforms: [] }))).toBe('Team Cherry');
  });

  it('is null rather than an empty line when nothing is known', () => {
    expect(searchSubtitle(hit({ year: null, platforms: [], developer: null }))).toBeNull();
    expect(searchSubtitle(hit({ year: null, platforms: [], developer: '  ' }))).toBeNull();
  });
});

describe('popularSubtitle', () => {
  it('is the year and the platforms', () => {
    expect(popularSubtitle({ year: 2025, platforms: ['Switch 2', 'PC'] })).toBe('2025 · Switch 2, PC');
  });

  it('has no developer to fall back to, so it can be null', () => {
    expect(popularSubtitle({ year: null, platforms: [] })).toBeNull();
  });
});
