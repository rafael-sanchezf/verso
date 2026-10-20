import type { DeckCandidateRow } from '@verso/api';
import { expandPlatforms, type Tier } from '@verso/core';
import { describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import type { Sentence } from '../src/screens/onboarding/sentence';
import {
  deckMetaLine,
  deckRowMeta,
  doneForNow,
  hasMorePages,
  markRow,
  markedRows,
  mergePages,
  orderPage,
  playedOnFor,
  progressCount,
  progressFraction,
  progressLabel,
  rankButtonLabel,
  filmDeckMetaLine,
  pendingCount,
  seenRows,
  showsSlider,
  toggleSeen,
} from '../src/screens/onboarding/deck-page';

/** The sentence a screen would show, in English. */
const say = (sentence: Sentence) => translate('en', sentence.key, sentence.vars);

function row(id: string, popularityRank: number, overrides: Partial<DeckCandidateRow> = {}): DeckCandidateRow {
  return {
    mediaItemId: id,
    title: `Game ${id}`,
    year: 2020,
    coverImageId: null,
    externalIds: null,
    genres: [],
    platforms: ['PlayStation 5'],
    popularityRank,
    boost: 0,
    ...overrides,
  };
}

function page(start: number, count = 10): DeckCandidateRow[] {
  return Array.from({ length: count }, (_, i) => row(`g${start + i}`, start + i));
}

const NO_MARKS = new Map<string, Tier>();

describe('the marks and the count', () => {
  it('counts ranked games plus the rows marked on this page', () => {
    let marks = markRow(NO_MARKS, 'a', 'loved');
    marks = markRow(marks, 'b', 'fine');
    expect(progressCount(3, marks)).toBe(5);
    expect(progressCount(0, NO_MARKS)).toBe(0);
  });

  it('counts a row once however often its slider moves', () => {
    let marks = markRow(NO_MARKS, 'a', 'loved');
    marks = markRow(marks, 'a', 'liked');
    expect(marks.size).toBe(1);
    expect(marks.get('a')).toBe('liked');
  });

  it('never mutates the marks it was given', () => {
    const before = markRow(NO_MARKS, 'a', 'loved');
    markRow(before, 'b', 'fine');
    expect([...before.keys()]).toEqual(['a']);
  });

  it('keeps counting past ten while the line and the bar stop at ten', () => {
    expect(say(progressLabel(4))).toBe('4 of 10');
    expect(say(progressLabel(10))).toBe('10 of 10');
    expect(say(progressLabel(14))).toBe('10 of 10');
    expect(progressFraction(4)).toBeCloseTo(0.4);
    expect(progressFraction(14)).toBe(1);
    expect(progressFraction(-1)).toBe(0);
  });

  it('labels the button "Rank N", never "Rank these N" (VER-228), and plainly at zero', () => {
    expect(say(rankButtonLabel(0))).toBe('Rank');
    expect(say(rankButtonLabel(1))).toBe('Rank 1');
    expect(say(rankButtonLabel(6))).toBe('Rank 6');
    expect(translate('es', rankButtonLabel(6).key, rankButtonLabel(6).vars)).toBe('Clasificar 6');
  });
});

describe('the pages', () => {
  it('pins the three most popular on page one whatever the boost', () => {
    const rows = [row('a', 1), row('b', 2), row('c', 3), row('d', 4), row('e', 9, { boost: 3 })];
    expect(orderPage(rows, 0).map((r) => r.mediaItemId)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('pins nothing on a later page', () => {
    const rows = [row('k', 11), row('l', 12), row('m', 19, { boost: 3 })];
    expect(orderPage(rows, 10).map((r) => r.mediaItemId)).toEqual(['m', 'k', 'l']);
  });

  it('appends each page below the last, each game once', () => {
    const first = page(1);
    const second = [row('g10', 10), ...page(11, 9)];
    const merged = mergePages([first, second]);
    expect(merged).toHaveLength(19);
    expect(merged.filter((r) => r.mediaItemId === 'g10')).toHaveLength(1);
    expect(merged.slice(0, 10).map((r) => r.mediaItemId)).toEqual(first.map((r) => r.mediaItemId));
  });

  it('keeps the rows above a page that is still loading', () => {
    expect(mergePages([page(1), undefined]).map((r) => r.mediaItemId)).toEqual(page(1).map((r) => r.mediaItemId));
  });

  it('offers another page only after a full one', () => {
    expect(hasMorePages([page(1)])).toBe(true);
    expect(hasMorePages([page(1), page(11, 4)])).toBe(false);
    expect(hasMorePages([page(1), undefined])).toBe(false);
    expect(hasMorePages([])).toBe(false);
  });

  it('hands the session the marked rows in the order the page shows them', () => {
    const rows = page(1, 4);
    let marks = markRow(NO_MARKS, 'g4', 'fine');
    marks = markRow(marks, 'g2', 'loved');
    expect(markedRows(rows, marks)).toEqual([
      { row: rows[1], tier: 'loved' },
      { row: rows[3], tier: 'fine' },
    ]);
  });
});

describe('the meta lines', () => {
  it('names where the rows come from, the first two picks only', () => {
    expect(say(deckMetaLine(expandPlatforms(['ps5', 'switch-2', 'pc'])))).toBe(
      'Popular on PS5 and Switch 2 · tap how it was',
    );
    expect(say(deckMetaLine(expandPlatforms(['switch-2'])))).toBe('Popular on Switch 2 · tap how it was');
  });

  it('does not name a fold as a pick', () => {
    expect(say(deckMetaLine(expandPlatforms(['ps5'])))).toBe('Popular on PS5 · tap how it was');
  });

  it('says "Popular everywhere" with no platforms', () => {
    expect(say(deckMetaLine([]))).toBe('Popular everywhere · tap how it was');
    expect(say(deckMetaLine(null))).toBe('Popular everywhere · tap how it was');
  });

  it('gives a row its year and platforms, the user\'s first', () => {
    const game = { year: 2017, platforms: ['PC (Microsoft Windows)', 'PlayStation 4', 'Nintendo Switch'] };
    expect(deckRowMeta(game, expandPlatforms(['switch']))).toBe('2017 · Switch, PC, PS4');
    expect(deckRowMeta(game, [])).toBe('2017 · PC, PS4, Switch');
  });

  it('caps the platforms at three and counts the rest', () => {
    const game = {
      year: 2020,
      platforms: ['PlayStation 5', 'PlayStation 4', 'Xbox One', 'Xbox Series X|S', 'Nintendo Switch'],
    };
    expect(deckRowMeta(game, [])).toBe('2020 · PS5, PS4, Xbox One +2');
  });

  it('falls back to whichever half exists', () => {
    expect(deckRowMeta({ year: null, platforms: ['Nintendo Switch'] }, [])).toBe('Switch');
    expect(deckRowMeta({ year: 2001, platforms: [] }, [])).toBe('2001');
    expect(deckRowMeta({ year: null, platforms: [] }, [])).toBeNull();
  });
});

describe('the played-on pre-fill', () => {
  const pc = expandPlatforms(['pc']);
  const ps5 = expandPlatforms(['ps5']);

  it('fills the one platform the game shares with the profile', () => {
    expect(playedOnFor(['PC (Microsoft Windows)', 'PlayStation 4'], pc)).toBe('PC (Microsoft Windows)');
    expect(playedOnFor(['PlayStation 4', 'Xbox One'], ps5)).toBe('PlayStation 4');
  });

  it('fills nothing when the game shares several or none', () => {
    expect(playedOnFor(['PlayStation 5', 'PlayStation 4'], ps5)).toBeNull();
    expect(playedOnFor(['PC (Microsoft Windows)', 'Mac'], pc)).toBeNull();
    expect(playedOnFor(['Xbox One'], ps5)).toBeNull();
    expect(playedOnFor(['Xbox One'], [])).toBeNull();
  });
});

describe('"Done for now"', () => {
  it('goes to the session with marks', () => {
    expect(doneForNow(2, false)).toBe('write');
    expect(doneForNow(2, true)).toBe('write');
  });

  it('goes onward for a new user and back for a returning one', () => {
    expect(doneForNow(0, false)).toBe('onward');
    expect(doneForNow(0, true)).toBe('back');
  });
});

describe('the film deck', () => {
  const NO_SEEN = new Set<string>();

  it('shows no slider on a film row until it is checked as seen (Rafa, 2026-10-14)', () => {
    expect(showsSlider(true, NO_SEEN, 'a')).toBe(false);
    const { seen } = toggleSeen(NO_SEEN, NO_MARKS, 'a');
    expect(showsSlider(true, seen, 'a')).toBe(true);
    expect(showsSlider(true, seen, 'b')).toBe(false);
  });

  it('shows the slider on every games row, as before', () => {
    expect(showsSlider(false, NO_SEEN, 'a')).toBe(true);
  });

  it('takes the tier away with the check, so the slider never hides a mark', () => {
    const checked = toggleSeen(NO_SEEN, NO_MARKS, 'a');
    const marks = markRow(checked.marks, 'a', 'loved');
    const unchecked = toggleSeen(checked.seen, marks, 'a');
    expect(unchecked.seen.has('a')).toBe(false);
    expect(unchecked.marks.has('a')).toBe(false);
    expect(showsSlider(true, unchecked.seen, 'a')).toBe(false);
  });

  it('never mutates what it was given', () => {
    const seen = new Set(['a']);
    const marks = markRow(NO_MARKS, 'a', 'liked');
    toggleSeen(seen, marks, 'a');
    expect([...seen]).toEqual(['a']);
    expect(marks.get('a')).toBe('liked');
  });

  it('counts the tiers on the button and the checks with no tier only for the x', () => {
    let state = toggleSeen(NO_SEEN, NO_MARKS, 'a');
    state = toggleSeen(state.seen, state.marks, 'b');
    const marks = markRow(state.marks, 'a', 'loved');
    expect(rankButtonLabel(marks.size).vars).toEqual({ count: 1 });
    expect(pendingCount(marks, state.seen)).toBe(2);
    expect(pendingCount(NO_MARKS, NO_SEEN)).toBe(0);
    expect(doneForNow(pendingCount(NO_MARKS, state.seen), false)).toBe('write');
  });

  it('writes the checked films in the page order', () => {
    const rows = page(1, 4);
    expect(seenRows(rows, new Set(['g3', 'g1'])).map((r) => r.mediaItemId)).toEqual(['g1', 'g3']);
  });

  it('says where the films come from, by popularity and never by service', () => {
    expect(say(filmDeckMetaLine())).toBe('Popular films · slide how it was');
  });
});
