import { describe, expect, it } from 'vitest';
import { answer, startInsertion, type RankableItem } from '../src/ranking';
import {
  comparisonPrompt,
  DEFAULT_BASE_PROMPT,
  genreCue,
  type ComparisonPromptOptions,
} from '../src/prompt';

const g = (id: string, ...genres: string[]): RankableItem => ({ id, genres });

/** One opponent, so the first question is always against that game. */
const against = (pivot: RankableItem, item: RankableItem) =>
  startInsertion('liked', item, [pivot], { genreWindow: 0 });

describe('genreCue', () => {
  it('gives the short form of the shared genre', () => {
    const s = against(g('halo', 'Shooter'), g('doom', 'Shooter'));
    expect(genreCue(s)).toBe('shooter');
  });

  it('is null when nothing is shared', () => {
    expect(genreCue(against(g('gran-turismo', 'Racing'), g('doom', 'Shooter')))).toBeNull();
  });

  it('is null once the insertion is done', () => {
    const s = answer(against(g('halo', 'Shooter'), g('doom', 'Shooter')), 'a');
    expect(s.done).toBe(true);
    expect(genreCue(s)).toBeNull();
  });

  it('is null for an empty tier, which asks nothing at all', () => {
    expect(genreCue(startInsertion('liked', g('doom', 'Shooter'), []))).toBeNull();
  });
});

describe('comparisonPrompt', () => {
  it('names the genre when the pivot is a genre peer', () => {
    const s = against(g('skyrim', 'Role-playing (RPG)'), g('mass-effect', 'Role-playing (RPG)'));
    expect(comparisonPrompt(s)).toBe('Which RPG did you enjoy more?');
  });

  it('uses the base prompt when nothing is shared', () => {
    const s = against(g('gran-turismo', 'Racing'), g('doom', 'Shooter'));
    expect(comparisonPrompt(s)).toBe('Which did you enjoy more?');
    expect(DEFAULT_BASE_PROMPT).toBe('Which did you enjoy more?');
  });

  it('names the first shared genre in the new game\'s order when several are shared', () => {
    const s = against(
      g('borderlands', 'Role-playing (RPG)', 'Shooter'),
      g('destiny', 'Shooter', 'Role-playing (RPG)'),
    );
    // Destiny is the new game and leads with Shooter, so Shooter is what is said.
    expect(genreCue(s)).toBe('shooter');
    expect(comparisonPrompt(s)).toBe('Which shooter did you enjoy more?');
  });

  it('falls back to the base prompt when the only shared genre is ignored', () => {
    const s = against(g('celeste', 'Indie'), g('hades', 'Indie'));
    expect(genreCue(s)).toBeNull();
    expect(comparisonPrompt(s)).toBe('Which did you enjoy more?');
  });

  it('names the real genre when an ignored one is shared alongside it', () => {
    const s = against(g('celeste', 'Indie', 'Platform'), g('hollow-knight', 'Indie', 'Platform'));
    expect(comparisonPrompt(s)).toBe('Which platformer did you enjoy more?');
  });

  it('falls back to the base prompt for a genre with no short form', () => {
    // A genre the display table does not know: shared, but not worth naming.
    const s = against(g('hades', 'Roguelike'), g('slay-the-spire', 'Roguelike'));
    expect(s.pivotReason).toEqual({ kind: 'genre', genre: 'Roguelike' });
    expect(genreCue(s)).toBeNull();
    expect(comparisonPrompt(s)).toBe('Which did you enjoy more?');
  });

  it('uses the base prompt once the insertion is done', () => {
    const s = answer(against(g('halo', 'Shooter'), g('doom', 'Shooter')), 'a');
    expect(comparisonPrompt(s)).toBe('Which did you enjoy more?');
  });

  describe('wording is a parameter, not a constant', () => {
    const options: ComparisonPromptOptions = {
      basePrompt: 'Which would you rather play again tonight?',
      genrePrompt: (genre) => `Which ${genre} would you rather play again tonight?`,
    };

    it('takes an overridden base prompt', () => {
      const s = against(g('gran-turismo', 'Racing'), g('doom', 'Shooter'));
      expect(comparisonPrompt(s, options)).toBe('Which would you rather play again tonight?');
    });

    it('takes an overridden genre prompt', () => {
      const s = against(g('halo', 'Shooter'), g('doom', 'Shooter'));
      expect(comparisonPrompt(s, options)).toBe('Which shooter would you rather play again tonight?');
    });

    it('still falls back to the overridden base prompt when no genre is named', () => {
      const s = against(g('celeste', 'Indie'), g('hades', 'Indie'));
      expect(comparisonPrompt(s, { basePrompt: 'Which is the better game?' })).toBe(
        'Which is the better game?',
      );
    });

    it('overriding only one of the two leaves the other at its default', () => {
      const shared = against(g('halo', 'Shooter'), g('doom', 'Shooter'));
      const unshared = against(g('gran-turismo', 'Racing'), g('doom', 'Shooter'));
      expect(comparisonPrompt(shared, { basePrompt: 'Pick one.' })).toBe(
        'Which shooter did you enjoy more?',
      );
      expect(comparisonPrompt(unshared, { genrePrompt: (x) => `Pick a ${x}.` })).toBe(
        'Which did you enjoy more?',
      );
    });
  });

  it('never disagrees with the cue', () => {
    const tier = [
      g('halo', 'Shooter'),
      g('skyrim', 'Role-playing (RPG)'),
      g('celeste', 'Indie', 'Platform'),
      g('hades', 'Roguelike'),
      g('gran-turismo', 'Racing'),
    ];
    let s = startInsertion('liked', g('doom', 'Shooter', 'Indie', 'Platform'), tier);
    while (!s.done) {
      const cue = genreCue(s);
      const prompt = comparisonPrompt(s);
      if (cue === null) expect(prompt).toBe(DEFAULT_BASE_PROMPT);
      else expect(prompt).toBe(`Which ${cue} did you enjoy more?`);
      s = answer(s, 'b');
    }
    expect(comparisonPrompt(s)).toBe(DEFAULT_BASE_PROMPT);
  });
});
