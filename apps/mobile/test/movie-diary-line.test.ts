/**
 * The movie page's diary line, theatrical line and streaming row, and the
 * log sheet's watch ordinal (screens/movie/diary-line.ts).
 */

import { describe, expect, it } from 'vitest';

import { diaryLine, streamingRow, theatricalLine, watchOrdinal } from '../src/screens/movie/diary-line';

const NOW = new Date(2026, 9, 12);

describe('diaryLine', () => {
  it('says nothing for a film the caller does not track', () => {
    expect(diaryLine(null, [], false, NOW)).toEqual({ text: null, action: null, rankIt: false, watched: false });
  });

  it('reads "On your watchlist" for a film on the list, with the two actions still there', () => {
    expect(diaryLine({ status: 'backlog' }, [], false, NOW)).toEqual({
      text: 'On your watchlist',
      action: null,
      rankIt: false,
      watched: false,
    });
  });

  it('reads one watch with Change, and offers Rank it when unranked', () => {
    expect(diaryLine({ status: 'played' }, [{ watchedOn: '2026-09-02' }], false, NOW)).toEqual({
      text: 'Watched Sep 2',
      action: 'change',
      rankIt: true,
      watched: true,
    });
  });

  it('drops Rank it once the film is ranked', () => {
    expect(diaryLine({ status: 'played' }, [{ watchedOn: '2026-09-02' }], true, NOW).rankIt).toBe(false);
  });

  it('counts several watches and names the last, newest first', () => {
    const line = diaryLine(
      { status: 'played' },
      [{ watchedOn: '2026-09-02' }, { watchedOn: '2025-12-24' }],
      true,
      NOW,
    );
    expect(line.text).toBe('Watched 2× · last Sep 2');
    expect(line.action).toBe('open');
  });

  it('writes the year for a watch from another year', () => {
    expect(diaryLine({ status: 'played' }, [{ watchedOn: '2025-12-24' }], true, NOW).text).toBe('Watched Dec 24, 2025');
  });

  it('reads "Watched" for a film marked watched with no diary row', () => {
    expect(diaryLine({ status: 'played' }, [], false, NOW)).toEqual({
      text: 'Watched',
      action: null,
      rankIt: true,
      watched: true,
    });
  });

  it('reads "Seen before Verso" for a film whose only row is undated, never "Watched null"', () => {
    expect(diaryLine({ status: 'played' }, [{ watchedOn: null }], false, NOW)).toEqual({
      text: 'Seen before Verso',
      action: 'open',
      rankIt: true,
      watched: true,
    });
    expect(diaryLine({ status: 'played' }, [{ watchedOn: null }, { watchedOn: null }], true, NOW).text).toBe(
      'Seen 2× before Verso',
    );
  });

  it('takes "last" from the newest dated row when undated rows sit beside dated ones', () => {
    const line = diaryLine({ status: 'played' }, [{ watchedOn: '2026-09-02' }, { watchedOn: null }], true, NOW);
    expect(line).toEqual({ text: 'Watched 2× · last Sep 2', action: 'open', rankIt: false, watched: true });
  });
});

describe('theatricalLine', () => {
  const TODAY = '2026-10-12';

  it('puts the planned day first, the way a ticket reads', () => {
    expect(theatricalLine('opening', '2026-10-22', '2026-10-24', TODAY)).toEqual({
      text: 'Going Sat Oct 24',
      action: 'change',
    });
  });

  it('reads the opening day, then "now" while it plays', () => {
    expect(theatricalLine('opening', '2026-10-22', null, TODAY)).toEqual({ text: 'In theaters Oct 22', action: 'going?' });
    expect(theatricalLine('in_theaters', '2026-10-03', null, TODAY)).toEqual({ text: 'In theaters now', action: 'going?' });
  });

  it('is gone once it streams, and a planned day in the past is forgotten', () => {
    expect(theatricalLine('watchlist', null, null, TODAY)).toBeNull();
    expect(theatricalLine('watchlist', null, '2026-10-01', TODAY)).toBeNull();
  });
});

describe('streamingRow', () => {
  it('reads since with the month and year, from with the day', () => {
    expect(streamingRow('2022-05-20', '2026-10-12')).toEqual({ label: 'Streaming since', value: 'May 2022' });
    expect(streamingRow('2026-12-03', '2026-10-12')).toEqual({ label: 'Streaming from', value: 'Dec 3' });
    expect(streamingRow(null, '2026-10-12')).toBeNull();
  });
});

describe('watchOrdinal', () => {
  it('says nothing for a first watch and counts the rest', () => {
    expect(watchOrdinal(0)).toBeNull();
    expect(watchOrdinal(1)).toBe('2nd watch');
    expect(watchOrdinal(2)).toBe('3rd watch');
    expect(watchOrdinal(3)).toBe('4th watch');
    expect(watchOrdinal(10)).toBe('11th watch');
    expect(watchOrdinal(20)).toBe('21st watch');
  });
});
