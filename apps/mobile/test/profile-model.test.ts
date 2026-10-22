import type { ProfileStats } from '@verso/api';
import { afterEach, describe, expect, it } from 'vitest';

import { translate, type TranslationKey, type TranslationVars } from '../src/lib/i18n/dictionary';
import { languageStore } from '../src/lib/i18n/store';
import {
  ACTIVITY_LINES,
  activityLine,
  dayLabel,
  editFormFrom,
  editPatch,
  initialsFor,
  monthGrid,
  monthName,
  monthTitle,
  nameLine,
  profileShareText,
  profileTiles,
  profileView,
  sectionCounts,
  shiftMonth,
  shortAgo,
  shownMedia,
  switcherOptions,
  toggleMedium,
  topPercentLabel,
  weekdayLetters,
} from '../src/screens/profile/model';

/** The screens' `t`, in English: the sentences these tests read are the English dictionary's. */
const say = (key: TranslationKey, vars?: TranslationVars) => translate('en', key, vars);

function stats(partial: Partial<ProfileStats>): ProfileStats {
  return { ranked: 0, backlog: 0, upcoming: 0, playing: 0, played: 0, dropped: 0, ...partial };
}

describe('the verb rule', () => {
  it('names a verb for every kind the read returns', () => {
    expect(Object.keys(ACTIVITY_LINES).sort()).toEqual(['finished', 'ranked', 'watched']);
    expect(say(ACTIVITY_LINES.ranked.plain, { title: 'Hades' })).toBe('Ranked Hades');
  });

  it('reads a placement as Ranked with the score and no rank number', () => {
    expect(activityLine({ kind: 'ranked', title: 'Dune: Part Two', score: 9.6 }, say)).toBe('Ranked Dune: Part Two · 9.6');
  });

  it('reads a logged film as Watched, with no score when it is not ranked', () => {
    expect(activityLine({ kind: 'watched', title: 'Parasite', score: null }, say)).toBe('Watched Parasite');
  });

  it('reads a game the log flow finished as Finished, with the folded score', () => {
    expect(activityLine({ kind: 'finished', title: 'Elden Ring', score: 9.4 }, say)).toBe('Finished Elden Ring · 9.4');
  });

  it('keeps one decimal on a whole score', () => {
    expect(activityLine({ kind: 'ranked', title: 'Hades', score: 10 }, say)).toBe('Ranked Hades · 10.0');
  });

  it('puts the title where Spanish puts it', () => {
    const es = (key: TranslationKey, vars?: TranslationVars) => translate('es', key, vars);
    expect(activityLine({ kind: 'watched', title: 'Parasite', score: 8.2 }, es)).toBe('Viste Parasite · 8.2');
  });
});

describe('the switcher', () => {
  const some = stats({ ranked: 3, played: 3 });
  const none = stats({});

  it('shows a tracked medium only once it holds an entry, ranked or listed', () => {
    expect(shownMedia(['game', 'movie'], { game: some, movie: none })).toEqual(['game']);
    expect(shownMedia(['game', 'movie'], { game: some, movie: stats({ backlog: 1 }) })).toEqual(['game', 'movie']);
  });

  it("keeps a person with nothing on their first tracked medium's page", () => {
    expect(shownMedia(['movie', 'game'], { game: none, movie: none })).toEqual(['game']);
    expect(shownMedia(['movie'], { movie: none })).toEqual(['movie']);
  });

  it('waits while any tracked medium is still loading', () => {
    expect(shownMedia(['game', 'movie'], { game: some })).toBeNull();
  });

  it('never shows the held media', () => {
    expect(shownMedia(['game', 'tv'], { game: some })).toEqual(['game']);
  });

  it('offers All then each shown medium in order when there are several', () => {
    expect(switcherOptions(['game', 'movie'])).toEqual(['all', 'game', 'movie']);
  });

  it('is absent with one medium shown', () => {
    expect(switcherOptions(['movie'])).toEqual([]);
    expect(switcherOptions([])).toEqual([]);
  });

  it('shows the one medium page whatever was picked when one medium is shown', () => {
    expect(profileView('all', ['movie'])).toBe('movie');
    expect(profileView('game', ['movie'])).toBe('movie');
  });

  it('keeps the pick with several media, and reads a pick outside them as All', () => {
    expect(profileView('movie', ['game', 'movie'])).toBe('movie');
    expect(profileView('all', ['game', 'movie'])).toBe('all');
    expect(profileView('tv' as never, ['game', 'movie'])).toBe('all');
  });
});

describe('the tiles', () => {
  const both = { game: stats({ ranked: 48, played: 60 }), movie: stats({ ranked: 31, played: 31 }) };

  it('shows Ranked across media, Top N% and Hours on All', () => {
    const tiles = profileTiles('all', ['game', 'movie'], { stats: both, percentile: 92.3, hours: 127.6 }, say);
    expect(tiles.map((tile) => [tile.value, tile.label])).toEqual([
      ['79', 'Ranked'],
      ['Top 8%', 'of rankers'],
      ['128', 'Hours'],
    ]);
  });

  it("shows a film's four: Watched, Ranked, Top N%, Hours", () => {
    const tiles = profileTiles('movie', ['game', 'movie'], { stats: both, percentile: 88, hours: 64 }, say);
    expect(tiles.map((tile) => tile.label)).toEqual(['Watched', 'Ranked', 'of rankers', 'Hours']);
    expect(tiles.map((tile) => tile.value)).toEqual(['31', '31', 'Top 12%', '64']);
  });

  it("shows a game's four with Played first", () => {
    const tiles = profileTiles('game', ['game'], { stats: both, percentile: 50, hours: 10 }, say);
    expect(tiles.map((tile) => `${tile.value} ${tile.label}`)).toEqual(['60 Played', '48 Ranked', 'Top 50% of rankers', '10 Hours']);
  });

  it('hides the Top tile when there is no percentile (a cohort under ten)', () => {
    const tiles = profileTiles('all', ['game', 'movie'], { stats: both, percentile: null, hours: 0 }, say);
    expect(tiles.map((tile) => tile.key)).toEqual(['ranked', 'hours']);
  });

  it('holds every place with a dash while loading', () => {
    const tiles = profileTiles(
      'all',
      ['game', 'movie'],
      { stats: { game: both.game }, percentile: undefined, hours: undefined },
      say,
    );
    expect(tiles.map((tile) => tile.value)).toEqual(['—', '—', '—']);
  });

  it('never says Top 0%, and hides rather than say Top 100%', () => {
    expect(topPercentLabel(100, say)).toBe('Top 1%');
    expect(topPercentLabel(1, say)).toBe('Top 99%');
    expect(topPercentLabel(0, say)).toBeNull();
    expect(topPercentLabel(0.4, say)).toBeNull();
    expect(topPercentLabel(null, say)).toBeNull();
  });

  it("counts each section in its medium's words", () => {
    expect(sectionCounts('game', stats({ ranked: 48, backlog: 10, upcoming: 2 }), say)).toBe('48 ranked · 12 backlog');
    expect(sectionCounts('movie', stats({ ranked: 31, backlog: 12 }), say)).toBe('31 ranked · 12 watchlist');
    expect(sectionCounts('movie', undefined, say)).toBeNull();
  });
});

describe('the month grid', () => {
  const events = [
    { day: 12, title: 'Get Out' },
    { day: 12, title: 'Top Gun: Maverick' },
    { day: 9, title: 'Hades' },
    { day: 9, title: 'Elden Ring' },
    { day: 9, title: 'Barbie' },
    { day: 2, title: 'Parasite' },
  ];

  it('lays October 2026 out from Sunday in five weeks', () => {
    const weeks = monthGrid(2026, 10, events);
    expect(weeks).toHaveLength(5);
    // October 1, 2026 is a Thursday.
    expect(weeks[0]!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0]![4]!.day).toBe(1);
    expect(weeks[4]![6]!.day).toBe(31);
  });

  it('puts the newest event of a day on it and counts the rest as +N', () => {
    const cells = monthGrid(2026, 10, events).flat();
    const day = (n: number) => cells.find((cell) => cell?.day === n)!;
    expect(day(9).first?.title).toBe('Hades');
    expect(day(9).more).toBe(2);
    expect(day(12).more).toBe(1);
    expect(day(2).more).toBe(0);
    expect(day(3).first).toBeNull();
  });

  it('pads the last week and drops a day outside the month', () => {
    const weeks = monthGrid(2026, 2, [{ day: 30, title: 'Nope' }]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(28);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('names and moves months across a year', () => {
    expect(monthTitle(2026, 10, say)).toBe('October 2026');
    expect(monthName(10)).toBe('October');
    expect(monthName(13)).toBe('');
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("reads the month and the week row off format.ts's tables, in the app's language", () => {
    expect(weekdayLetters()).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    try {
      languageStore.setPreference('es');
      expect(monthTitle(2026, 10, (key, vars) => translate('es', key, vars))).toBe('Octubre de 2026');
      expect(weekdayLetters()).toEqual(['D', 'L', 'M', 'M', 'J', 'V', 'S']);
    } finally {
      languageStore.setPreference('system');
    }
  });
});

describe('the times', () => {
  const now = new Date(2026, 9, 12, 21, 0);

  it('reads days and weeks as the frames write them', () => {
    expect(shortAgo('2026-10-12', say, now)).toBe('Today');
    expect(shortAgo('2026-10-08', say, now)).toBe('4d');
    expect(shortAgo('2026-10-02', say, now)).toBe('1w');
    expect(shortAgo('2026-08-01', say, now)).toBe('Aug 1');
  });

  it('reads late last night as 1d once midnight has passed', () => {
    const justAfterMidnight = new Date(2026, 9, 13, 0, 30);
    expect(shortAgo('2026-10-12', say, justAfterMidnight)).toBe('1d');
    expect(shortAgo('2026-10-13', say, justAfterMidnight)).toBe('Today');
  });

  it('dates the Activity list, with the year only when it is not this one', () => {
    expect(dayLabel('2026-10-09', now)).toBe('Oct 9');
    expect(dayLabel('2025-12-31', now)).toBe('Dec 31, 2025');
  });
});

describe('identity', () => {
  it('names a person by their name, else their handle, else asks', () => {
    expect(nameLine({ displayName: ' Rafa Sanchez ', username: 'rafa' })).toBe('Rafa Sanchez');
    expect(nameLine({ displayName: null, username: 'rafa' })).toBe('rafa');
    expect(nameLine({ displayName: '  ', username: null })).toBeNull();
  });

  it('draws two initials from a name and one from a handle', () => {
    expect(initialsFor({ displayName: 'Rafa Sanchez', username: null })).toBe('RS');
    expect(initialsFor({ displayName: 'Rafa', username: null })).toBe('R');
    expect(initialsFor({ displayName: null, username: 'rafa' })).toBe('R');
    expect(initialsFor({ displayName: null, username: null })).toBe('');
  });
});

describe('share', () => {
  it('shares one top ten plainly on one medium', () => {
    expect(profileShareText([{ medium: 'movie', items: [{ title: 'Heat', score: 9.8 }] }], say)).toBe(
      '1. Heat — 9.8\n\nRanked with Verso',
    );
  });

  it('heads each block with its medium when there are several, skipping an empty one', () => {
    const text = profileShareText(
      [
        { medium: 'game', items: [{ title: 'Hades', score: 9.8 }] },
        { medium: 'movie', items: [{ title: 'Heat', score: 9.1 }] },
      ],
      say,
      'rafa',
    );
    expect(text).toBe('My top games\n1. Hades — 9.8\n\nMy top movies\n1. Heat — 9.1\n\nRanked with Verso · @rafa');
    expect(profileShareText([{ medium: 'game', items: [] }], say)).toBeNull();
  });
});

describe('Edit profile', () => {
  const profile = { displayName: 'Rafa', username: 'rafa', media: ['game' as const], isPublic: false };

  it('saves nothing when nothing changed', () => {
    expect(editPatch(profile, editFormFrom(profile))).toBeNull();
  });

  it('sends only what changed, with a blank as null and the @ dropped', () => {
    const form = { ...editFormFrom(profile), name: '  ', username: '@rafa_s', isPublic: true };
    expect(editPatch(profile, form)).toEqual({ displayName: null, username: 'rafa_s', isPublic: true });
  });

  it('adds a medium in the switcher order and never removes the last one', () => {
    expect(toggleMedium(['movie'], 'game')).toEqual(['game', 'movie']);
    expect(toggleMedium(['game', 'movie'], 'game')).toEqual(['movie']);
    expect(toggleMedium(['game'], 'game')).toEqual(['game']);
    expect(editPatch(profile, { ...editFormFrom(profile), media: ['game', 'movie'] })).toEqual({ media: ['game', 'movie'] });
  });
});
