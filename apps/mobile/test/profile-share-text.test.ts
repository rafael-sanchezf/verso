import { describe, expect, it } from 'vitest';

import { topTenShareText } from '../src/screens/profile/share-text';

describe('topTenShareText', () => {
  it('numbers each line with its rank, title and score, ending with the sign-off', () => {
    const text = topTenShareText([
      { rank: 1, title: 'Hades', score: 9.4 },
      { rank: 2, title: 'Silksong', score: 9.1 },
    ]);
    expect(text).toBe('1. Hades — 9.4\n2. Silksong — 9.1\nRanked with Verso');
  });

  it('rounds the score to one decimal place, same as ScoreBadge', () => {
    expect(topTenShareText([{ rank: 1, title: 'Celeste', score: 8.049 }])).toBe(
      '1. Celeste — 8.0\nRanked with Verso',
    );
  });

  it('is just the sign-off for an empty list', () => {
    expect(topTenShareText([])).toBe('Ranked with Verso');
  });
});
