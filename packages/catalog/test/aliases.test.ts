import { describe, expect, it } from 'vitest';
import { GAME_FIELDS } from '../src/igdb';
import { MAX_ALIASES_PER_GAME, MAX_ALIAS_LENGTH, mapAliases, mapGame, searchKey } from '../src/map';
import type { IgdbGame } from '../src/types';
import recorded from './fixtures/igdb-games-alternative-names.json';

/**
 * IGDB's alternative names, from the field list to the rows `media_aliases`
 * gets. The statement that writes them is read in db-sql.test.ts and run
 * against a real database in aliases-live.test.ts.
 */

const NOW = new Date('2026-09-23T12:00:00.000Z');

/** The recorded games, by IGDB id. Pulled live from IGDB on 2026-09-23. */
const fixture = new Map((recorded as IgdbGame[]).map((game) => [game.id, game]));
const GTA_V = 1020;
const BREATH_OF_THE_WILD = 7346;

function game(names: Array<string | undefined>, title = 'Grand Theft Auto V'): IgdbGame {
  return {
    id: 1,
    name: title,
    game_type: 0,
    alternative_names: names.map((name, index) => ({ id: index + 1, name })),
  };
}

describe('GAME_FIELDS', () => {
  it('expands alternative_names on the games query, so the names cost no request of their own', () => {
    expect(GAME_FIELDS.split(',')).toContain('alternative_names.name');
  });
});

describe('the recorded response', () => {
  it('carries alternative names as objects with a name, the shape the map reads', () => {
    const gtaV = fixture.get(GTA_V)!;
    expect(gtaV.name).toBe('Grand Theft Auto V');
    expect(Array.isArray(gtaV.alternative_names)).toBe(true);
    for (const entry of gtaV.alternative_names!) expect(typeof entry.name).toBe('string');
  });

  it('maps GTA V to names a player types, never its own title', () => {
    const aliases = mapGame(fixture.get(GTA_V)!, NOW)!.aliases;

    expect(aliases.map(searchKey)).toContain('gtav');
    expect(aliases).not.toContain('Grand Theft Auto V');
    // One row per key, whatever IGDB repeats.
    expect(new Set(aliases.map(searchKey)).size).toBe(aliases.length);
  });

  it('maps every recorded game without dropping one that has names', () => {
    for (const recordedGame of fixture.values()) {
      const mapped = mapGame(recordedGame, NOW)!;
      const named = (recordedGame.alternative_names ?? []).some((entry) => entry.name?.trim());
      if (named) expect(mapped.aliases.length).toBeGreaterThan(0);
      else expect(mapped.aliases).toEqual([]);
    }
    expect(fixture.has(BREATH_OF_THE_WILD)).toBe(true);
  });
});

describe('mapAliases', () => {
  it('keeps IGDB order and trims the names', () => {
    expect(mapAliases(game(['  GTA 5 ', 'GTA   Five']))).toEqual(['GTA 5', 'GTA Five']);
  });

  it('skips a missing or blank name rather than storing an empty alias', () => {
    expect(mapAliases(game([undefined, '', '   ', 'GTA 5']))).toEqual(['GTA 5']);
  });

  it('drops the title itself, in any spelling', () => {
    expect(mapAliases(game(['Grand Theft Auto V', 'grand theft auto: v', 'GTA 5']))).toEqual(['GTA 5']);
  });

  it('keeps one name per search key, the first IGDB lists', () => {
    expect(mapAliases(game(['GTA V', 'GTA-V', 'gta v', 'GTAV', 'GTA 5']))).toEqual(['GTA V', 'GTA 5']);
  });

  it('keeps a name in another script, whose key is its own letters', () => {
    expect(mapAliases(game(['グランド・セフト・オートV']))).toEqual(['グランド・セフト・オートV']);
  });

  it('skips a name that is only punctuation, which has no key to search by', () => {
    expect(mapAliases(game(['!!!', '...', 'GTA 5']))).toEqual(['GTA 5']);
  });

  it('skips a name longer than the column allows instead of cutting it short', () => {
    const long = 'A'.repeat(MAX_ALIAS_LENGTH + 1);
    expect(mapAliases(game([long, 'GTA 5']))).toEqual(['GTA 5']);
    expect(mapAliases(game(['B'.repeat(MAX_ALIAS_LENGTH)]))).toHaveLength(1);
  });

  it('stops at the per-game cap', () => {
    const names = Array.from({ length: MAX_ALIASES_PER_GAME + 10 }, (_, i) => `Name ${i}`);
    expect(mapAliases(game(names))).toHaveLength(MAX_ALIASES_PER_GAME);
  });

  it('maps a remake the same way as a main game: nothing in the map looks at game_type', () => {
    const remake: IgdbGame = {
      ...game(['OoT Remake', ' Zelda OoT '], 'A Remade Classic'),
      game_type: 8,
    };
    expect(mapAliases(remake)).toEqual(['OoT Remake', 'Zelda OoT']);
    expect(mapGame(remake, NOW)!.aliases).toEqual(['OoT Remake', 'Zelda OoT']);
  });

  it('is empty for a game IGDB lists no names for, which clears the stored ones', () => {
    expect(mapAliases({ id: 1, name: 'Hades', game_type: 0 })).toEqual([]);
    expect(mapGame({ id: 1, name: 'Hades', game_type: 0 }, NOW)!.aliases).toEqual([]);
  });
});

describe('searchKey', () => {
  it('lower-cases and drops spaces and punctuation, like public.search_key', () => {
    expect(searchKey('GTA V')).toBe('gtav');
    expect(searchKey('GTA-V')).toBe('gtav');
    expect(searchKey('Halo: Reach')).toBe('haloreach');
    expect(searchKey('Baldur’s Gate 3')).toBe('baldursgate3');
  });
});
