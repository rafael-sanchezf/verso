import { describe, expect, it } from 'vitest';

import {
  askQuestion,
  buildTrace,
  lengthLine,
  picksCaption,
  readMaxMinutes,
  readNote,
  summaryLabel,
} from '../src/screens/ask/trace';

describe('buildTrace', () => {
  it('writes the site hero\'s three lines for the family ask', () => {
    expect(buildTrace('movie', 'something for the whole family')).toEqual([
      'Reading your ranked list',
      "Leaving out what you've seen",
      'Keeping it for every age',
    ]);
  });

  it('says played for games, and co-op for a friend', () => {
    expect(buildTrace('game', 'something to play with a friend')).toEqual([
      'Reading your ranked list',
      "Leaving out what you've played",
      'Keeping the co-op games',
    ]);
  });

  it('keeps the pool first when the note names nothing', () => {
    expect(buildTrace('movie', 'surprise me')[2]).toBe('Keeping your watchlist first');
    expect(buildTrace('game', '')[2]).toBe('Keeping your backlog first');
  });

  it('names a length over every other rule', () => {
    expect(buildTrace('movie', 'a family movie under 2 hours')[2]).toBe('Keeping it under 2 hours');
  });

  it('reads a group for films, not co-op', () => {
    expect(buildTrace('movie', 'with friends tonight')[2]).toBe('Keeping it for a group');
  });

  it('does not read a word inside another word', () => {
    // "lighthouse" is not "light", "kidding" is not "kid".
    expect(buildTrace('movie', 'the lighthouse, no kidding')[2]).toBe('Keeping your watchlist first');
  });
});

describe('readMaxMinutes', () => {
  it.each([
    ['under 2 hours', 120],
    ['2h', 120],
    ['1.5 hrs', 90],
    ['1,5 hours', 90],
    ['90 minutes', 90],
    ['something in 45 min', 45],
    ['about an hour', 60],
  ])('reads %s as %i', (note, minutes) => {
    expect(readMaxMinutes(note)).toBe(minutes);
  });

  it.each(['2', 'two friends', 'the 2 hobbits', '0 hours'])('reads no length in %s', (note) => {
    expect(readMaxMinutes(note)).toBeNull();
  });

  it.each([
    ['1 h 30', 90],
    ['2 h 15', 135],
    ['2h30', 150],
    ['under 2 hours 15 min', 135],
  ])('reads the hours-and-minutes form %s as %i', (note, minutes) => {
    expect(readMaxMinutes(note)).toBe(minutes);
  });

  it.each([
    'over 2 hours',
    'more than 90 minutes',
    'something longer than 2h',
    'at least an hour',
    'minimum 1 h 30',
    '2 hours or more',
    '3 hours or longer',
    'an epic, 2h+',
  ])('reads a floor, %s, as no ceiling', (note) => {
    expect(readMaxMinutes(note)).toBeNull();
  });
});

describe('a floor in the note', () => {
  it('sets no filter and no length line, and falls through to the other rules', () => {
    expect(readNote('a family movie over 2 hours', 'movie')).toEqual({
      maxMinutes: null,
      line: 'Keeping it for every age',
    });
    expect(buildTrace('movie', 'at least 2 hours')[2]).toBe('Keeping your watchlist first');
  });
});

describe('lengthLine and readMaxMinutes', () => {
  it.each([45, 60, 90, 120, 135, 150])('round-trip %i minutes', (minutes) => {
    expect(readMaxMinutes(lengthLine(minutes))).toBe(minutes);
  });
});

describe('readNote', () => {
  it('turns a length into the filter and the line together', () => {
    expect(readNote('quick, under 90 minutes', 'movie')).toEqual({
      maxMinutes: 90,
      line: 'Keeping it under 1 h 30',
    });
  });

  it('carries no filter for a mood', () => {
    expect(readNote('something scary', 'movie')).toEqual({ maxMinutes: null, line: 'Keeping it scary' });
  });
});

describe('lengthLine', () => {
  it('says minutes under an hour, hours on the hour, and h with minutes between', () => {
    expect(lengthLine(45)).toBe('Keeping it under 45 minutes');
    expect(lengthLine(60)).toBe('Keeping it under 1 hour');
    expect(lengthLine(150)).toBe('Keeping it under 2 h 30');
  });
});

describe('the sheet\'s other words', () => {
  it('asks the site\'s question per medium', () => {
    expect(askQuestion('movie')).toBe('What do you want to watch?');
    expect(askQuestion('game')).toBe('What do you feel like playing?');
  });

  it('names services under the picks only when the request carried them', () => {
    expect(picksCaption('movie', true)).toBe("From your watchlist and what's on your services");
    expect(picksCaption('movie', false)).toBe('From your watchlist and the catalog');
    expect(picksCaption('game', false)).toBe('From your backlog and the catalog');
  });

  it('shows a blank ask as Anything', () => {
    expect(summaryLabel('  ')).toBe('Anything');
    expect(summaryLabel(' scary ')).toBe('scary');
  });
});
