import { describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import { say } from '../src/screens/game/phrase';
import { lookupPhase, noFilmsCopy, openFound } from '../src/screens/search/tmdb-lookup';
import { english } from './english';

const spanish = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate('es', key, vars);

describe('lookupPhase', () => {
  it('is idle with no lookup, and for any query but the one looked up', () => {
    expect(lookupPhase(null, 'coherence')).toBe('idle');
    expect(lookupPhase({ query: 'coherence', phase: 'not_found' }, 'coherent')).toBe('idle');
  });

  it('is the lookup\'s phase for the query it asked', () => {
    expect(lookupPhase({ query: 'coherence', phase: 'pending' }, 'coherence')).toBe('pending');
    expect(lookupPhase({ query: 'coherence', phase: 'limited' }, 'coherence')).toBe('limited');
  });
});

describe('noFilmsCopy', () => {
  it('offers the one button, naming the query, before anything is asked', () => {
    const copy = noFilmsCopy('idle', 'coherence');
    expect(english(copy.body)).toBe('Check the spelling or try a shorter title.');
    expect(copy.action && english(copy.action)).toBe('Search TMDB for “coherence”');
    expect(copy.busy).toBe(false);
  });

  it('says so while the lookup is out, and the button does nothing', () => {
    const copy = noFilmsCopy('pending', 'coherence');
    expect(copy.action && english(copy.action)).toBe('Searching TMDB…');
    expect(copy.busy).toBe(true);
  });

  it('has nothing left to offer when TMDB has nothing either', () => {
    const copy = noFilmsCopy('not_found', 'zzzz');
    expect(english(copy.body)).toBe('TMDB has nothing by that name either.');
    expect(copy.action).toBeNull();
  });

  it('keeps the button to try again after a spent meter or a failure', () => {
    expect(english(noFilmsCopy('limited', 'x').body)).toBe('That’s a lot of lookups. Try again in a minute.');
    expect(noFilmsCopy('limited', 'x').action).not.toBeNull();
    expect(english(noFilmsCopy('error', 'x').body)).toBe("Couldn't reach TMDB just now.");
    expect(noFilmsCopy('error', 'x').action).not.toBeNull();
  });

  it('says the button in Spanish too', () => {
    const copy = noFilmsCopy('idle', 'coherence');
    expect(copy.action && say(spanish, copy.action)).toBe('Buscar “coherence” en TMDB');
    expect(spanish(noFilmsCopy('not_found', 'x').body)).toBe('TMDB tampoco tiene nada con ese nombre.');
  });
});

describe('openFound', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('opens the film when the search still does not list it', () => {
    expect(openFound(id, [], 'coherence', 'coherence')).toBe(true);
    expect(openFound(id, [{ media_item_id: 'other' }], 'coherence', 'coherence')).toBe(true);
  });

  it('leaves the results to show it when the search lists it', () => {
    expect(openFound(id, [{ media_item_id: id }], 'coherence', 'coherence')).toBe(false);
  });

  it('never opens a page under somebody who has typed something else', () => {
    expect(openFound(id, [], 'coherence', 'cohere')).toBe(false);
  });
});
