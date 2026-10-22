import { describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import type { Language } from '../src/lib/i18n/model';
import {
  askQuestion,
  askQuestionKey,
  buildTrace as buildTraceLines,
  lengthLine as lengthLineKey,
  picksCaption as picksCaptionKey,
  readMaxMinutes,
  readNote as readNoteLine,
  summaryLabel as summaryWords,
  type AskMedium,
  type TraceLine,
} from '../src/screens/ask/trace';

// The module returns keys; the sheet says them. These say them in English
// (or the language given), so every line below reads as the sheet shows it.
const say = (line: TraceLine, language: Language = 'en') => translate(language, line.key, line.vars);
const buildTrace = (medium: AskMedium, note: string, language: Language = 'en') =>
  buildTraceLines(medium, note).map((line) => say(line, language));
const lengthLine = (minutes: number) => say(lengthLineKey(minutes));
const readNote = (note: string, medium: AskMedium) => {
  const { maxMinutes, line } = readNoteLine(note, medium);
  return { maxMinutes, line: line === null ? null : say(line) };
};
const picksCaption = (medium: AskMedium, onServices: boolean) => translate('en', picksCaptionKey(medium, onServices));
const summaryLabel = (note: string) => summaryWords(note) ?? translate('en', 'lists.ask.anything');

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

// VER-204: the same rules read a Spanish note, whatever the device's language.
describe('a Spanish note', () => {
  describe('buildTrace', () => {
    it('writes the family line', () => {
      expect(buildTrace('movie', 'algo para toda la familia')[2]).toBe('Keeping it for every age');
    });

    it('says co-op for a friend in a game', () => {
      expect(buildTrace('game', 'algo para jugar con un amigo')[2]).toBe('Keeping the co-op games');
    });

    it('keeps the pool first when the note names nothing', () => {
      expect(buildTrace('movie', 'sorpréndeme')[2]).toBe('Keeping your watchlist first');
      expect(buildTrace('game', 'lo que sea')[2]).toBe('Keeping your backlog first');
    });

    it('names a length over every other rule', () => {
      expect(buildTrace('movie', 'una película familiar de menos de 2 horas')[2]).toBe('Keeping it under 2 hours');
    });

    it('reads a group for films, not co-op', () => {
      expect(buildTrace('movie', 'con amigos esta noche')[2]).toBe('Keeping it for a group');
    });

    it('does not read a word inside another word', () => {
      // "niñera" is not "niña", "amigable" is not "amigo", "cortina" is not "corto".
      expect(buildTrace('movie', 'la niñera, nada amigable, tras la cortina')[2]).toBe(
        'Keeping your watchlist first',
      );
    });

    it('reads a word that ends in an accented letter', () => {
      expect(buildTrace('game', 'algo para el sofá')[2]).toBe('Keeping the co-op games');
    });

    it('writes the whole trace in Spanish', () => {
      expect(buildTrace('movie', 'una película familiar de menos de 2 horas', 'es')).toEqual([
        'Leyendo tu ranking',
        'Dejando fuera lo que ya viste',
        'Que dure menos de 2 horas',
      ]);
    });
  });

  describe('the rules', () => {
    it.each([
      ['algo para los niños', 'Keeping it for every age'],
      ['para todas las edades', 'Keeping it for every age'],
      ['algo de miedo', 'Keeping it scary'],
      ['una de terror', 'Keeping it scary'],
      ['algo divertido', 'Keeping it light'],
      ['una comedia', 'Keeping it light'],
      ['algo ligero', 'Keeping it light'],
      ['algo corto', 'Keeping it short'],
      ['algo rápido', 'Keeping it short'],
      ['un clásico', 'Keeping to the classics'],
      ['algo reciente', 'Keeping it recent'],
    ])('reads %s', (note, line) => {
      expect(readNote(note, 'movie')).toEqual({ maxMinutes: null, line });
    });
  });

  describe('readMaxMinutes', () => {
    it.each([
      ['menos de 2 horas', 120],
      ['máximo 2 horas', 120],
      ['maximo 2 horas', 120],
      ['bajo 2 horas', 120],
      ['2 horas o menos', 120],
      ['1,5 horas', 90],
      ['1 hora', 60],
      ['90 minutos', 90],
      ['algo de 45 min', 45],
      ['1 minuto', 1],
      ['más o menos una hora', 60],
    ])('reads %s as %i', (note, minutes) => {
      expect(readMaxMinutes(note)).toBe(minutes);
    });

    it.each(['dos amigos', 'los 2 hobbits', '0 horas', 'a las 2'])('reads no length in %s', (note) => {
      expect(readMaxMinutes(note)).toBeNull();
    });

    it.each([
      ['1 hora 30', 90],
      ['2 horas 15', 135],
      ['menos de 2 horas 15 minutos', 135],
    ])('reads the hours-and-minutes form %s as %i', (note, minutes) => {
      expect(readMaxMinutes(note)).toBe(minutes);
    });

    it.each([
      'más de 2 horas',
      'mas de 90 minutos',
      'algo más largo que 2h',
      'al menos una hora',
      'por lo menos 1 hora',
      'mínimo 1 h 30',
      'minimo 1 h 30',
      '2 horas o más',
      '3 horas o mas',
      'una épica, 2h+',
    ])('reads a floor, %s, as no ceiling', (note) => {
      expect(readMaxMinutes(note)).toBeNull();
    });
  });

  it('lets a floor fall through to the other rules', () => {
    expect(readNote('una película familiar de más de 2 horas', 'movie')).toEqual({
      maxMinutes: null,
      line: 'Keeping it for every age',
    });
    expect(buildTrace('movie', 'al menos 2 horas')[2]).toBe('Keeping your watchlist first');
  });

  it('turns a length into the filter and the line together', () => {
    expect(readNote('rápido, menos de 90 minutos', 'movie')).toEqual({
      maxMinutes: 90,
      line: 'Keeping it under 1 h 30',
    });
  });

  it.each([45, 60, 90, 120, 135, 150])('round-trips the Spanish line for %i minutes', (minutes) => {
    expect(readMaxMinutes(say(lengthLineKey(minutes), 'es'))).toBe(minutes);
  });
});

describe('the sheet\'s other words', () => {
  it('asks the site\'s question per medium', () => {
    expect(askQuestion('movie')).toBe('What do you want to watch?');
    expect(askQuestion('game')).toBe('What do you feel like playing?');
    // The sheet's own title is the key, and Home's English question is the same sentence.
    expect(translate('en', askQuestionKey('movie'))).toBe(askQuestion('movie'));
    expect(translate('en', askQuestionKey('game'))).toBe(askQuestion('game'));
    expect(translate('es', askQuestionKey('movie'))).toBe('¿Qué quieres ver?');
  });

  it('writes the trace in Spanish', () => {
    expect(buildTrace('movie', 'a family movie under 2 hours', 'es')).toEqual([
      'Leyendo tu ranking',
      'Dejando fuera lo que ya viste',
      'Que dure menos de 2 horas',
    ]);
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
