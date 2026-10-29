/**
 * The movie page's diary line, theatrical line and streaming row, and the
 * log sheet's watch ordinal (screens/movie/diary-line.ts).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import { languageStore } from '../src/lib/i18n/store';
import { say, type Words } from '../src/screens/game/phrase';
import {
  diaryLine as diaryPhrase,
  streamingRow as streamingPhrase,
  theatricalLine as theatricalPhrase,
  watchOrdinal as watchOrdinalPhrase,
} from '../src/screens/movie/diary-line';

import { english } from './english';

/** The lines as the page says them in English (the module returns phrases). */
function diaryLine(...args: Parameters<typeof diaryPhrase>) {
  const line = diaryPhrase(...args);
  return { ...line, text: line.text && english(line.text) };
}

function theatricalLine(...args: Parameters<typeof theatricalPhrase>) {
  const line = theatricalPhrase(...args);
  return line && { ...line, text: english(line.text) };
}

function streamingRow(...args: Parameters<typeof streamingPhrase>) {
  const row = streamingPhrase(...args);
  return row && { label: english(row.label), value: english(row.value) };
}

function watchOrdinal(existingWatches: number): string | null {
  const ordinal = watchOrdinalPhrase(existingWatches);
  return ordinal && english(ordinal);
}

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

describe('every month and weekday word', () => {
  afterEach(() => languageStore.setPreference('system'));

  const TODAY = '2026-10-12';
  const spanish = (words: Words) => say((key, vars) => translate('es', key, vars), words);
  // The fifth of each month of 2026 (ahead of TODAY from November on), the fifth
  // of each month of 2022 (streaming already), and each day of the week of
  // Sunday 25 October 2026 (planned, so ahead of TODAY).
  const month = (n: number) => String(n).padStart(2, '0');
  const of2026 = Array.from({ length: 12 }, (_, i) => `2026-${month(i + 1)}-05`);
  const of2022 = Array.from({ length: 12 }, (_, i) => `2022-${month(i + 1)}-05`);
  const of2027 = Array.from({ length: 12 }, (_, i) => `2027-${month(i + 1)}-05`);
  const week = Array.from({ length: 7 }, (_, i) => `2026-10-${25 + i}`);

  /** The theatrical line, said by `words`; the lines here all exist, so never null. */
  const theatrical = (words: (w: Words) => string, ...args: Parameters<typeof theatricalPhrase>) =>
    words(theatricalPhrase(...args)!.text);
  const opening = (words: (w: Words) => string) => of2026.map((day) => theatrical(words, 'opening', day, null, TODAY));
  const going = (words: (w: Words) => string) =>
    week.map((day) => theatrical(words, 'opening', '2026-10-22', day, TODAY));

  it('says English months and weekdays in the theatrical and streaming lines', () => {
    expect(opening(english)).toEqual([
      'In theaters Jan 5', 'In theaters Feb 5', 'In theaters Mar 5', 'In theaters Apr 5', 'In theaters May 5',
      'In theaters Jun 5', 'In theaters Jul 5', 'In theaters Aug 5', 'In theaters Sep 5', 'In theaters Oct 5',
      'In theaters Nov 5', 'In theaters Dec 5',
    ]);
    expect(going(english)).toEqual([
      'Going Sun Oct 25', 'Going Mon Oct 26', 'Going Tue Oct 27', 'Going Wed Oct 28', 'Going Thu Oct 29',
      'Going Fri Oct 30', 'Going Sat Oct 31',
    ]);
    expect(of2022.map((day) => english(streamingPhrase(day, TODAY)!.value))).toEqual([
      'Jan 2022', 'Feb 2022', 'Mar 2022', 'Apr 2022', 'May 2022', 'Jun 2022', 'Jul 2022', 'Aug 2022', 'Sep 2022',
      'Oct 2022', 'Nov 2022', 'Dec 2022',
    ]);
    expect(of2027.map((day) => english(streamingPhrase(day, TODAY)!.value))).toEqual([
      'Jan 5', 'Feb 5', 'Mar 5', 'Apr 5', 'May 5', 'Jun 5', 'Jul 5', 'Aug 5', 'Sep 5', 'Oct 5', 'Nov 5', 'Dec 5',
    ]);
  });

  it('says Spanish months and weekdays with the day first', () => {
    languageStore.setPreference('es');
    expect(opening(spanish)).toEqual([
      'En cines el 5 ene', 'En cines el 5 feb', 'En cines el 5 mar', 'En cines el 5 abr', 'En cines el 5 may',
      'En cines el 5 jun', 'En cines el 5 jul', 'En cines el 5 ago', 'En cines el 5 sept', 'En cines el 5 oct',
      'En cines el 5 nov', 'En cines el 5 dic',
    ]);
    expect(going(spanish)).toEqual([
      'Vas el dom 25 oct', 'Vas el lun 26 oct', 'Vas el mar 27 oct', 'Vas el mié 28 oct', 'Vas el jue 29 oct',
      'Vas el vie 30 oct', 'Vas el sáb 31 oct',
    ]);
    expect(of2022.map((day) => spanish(streamingPhrase(day, TODAY)!.value))).toEqual([
      'ene 2022', 'feb 2022', 'mar 2022', 'abr 2022', 'may 2022', 'jun 2022', 'jul 2022', 'ago 2022', 'sept 2022',
      'oct 2022', 'nov 2022', 'dic 2022',
    ]);
    expect(of2027.map((day) => spanish(streamingPhrase(day, TODAY)!.value))).toEqual([
      '5 ene', '5 feb', '5 mar', '5 abr', '5 may', '5 jun', '5 jul', '5 ago', '5 sept', '5 oct', '5 nov', '5 dic',
    ]);
    expect(spanish(diaryPhrase({ status: 'played' }, [{ watchedOn: '2026-09-02' }], false, NOW).text!)).toBe('Vista el 2 sept');
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
