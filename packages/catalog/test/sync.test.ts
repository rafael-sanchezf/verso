import { describe, expect, it } from 'vitest';
import type { IgdbClient } from '../src/igdb';
import { runSync } from '../src/sync';
import type { IgdbGame } from '../src/types';

/**
 * The sync loop with a stand-in IGDB client and no database: what the trim
 * keeps from a page, end to end through the map. The client's own query is
 * read in igdb.test.ts and the rule itself in trim.test.ts.
 */

const NOW = new Date('2026-10-12T12:00:00.000Z');

function fakeClient(page: IgdbGame[]): IgdbClient {
  return {
    requestCount: 0,
    retryCount: 0,
    async *pages() {
      yield page;
    },
    async timeToBeat() {
      return [];
    },
    async externalGamesSteam() {
      return [];
    },
  } as unknown as IgdbClient;
}

const shown = { cover: { image_id: 'co1' }, total_rating_count: 10 };

describe('runSync', () => {
  it('keeps a main game and a remake from one page, and trims the port and the remaster', async () => {
    const page: IgdbGame[] = [
      { id: 1, name: 'The Original', game_type: 0, ...shown },
      {
        id: 2,
        name: 'The Original, Remade',
        game_type: 8,
        ...shown,
        alternative_names: [{ id: 1, name: 'Original Remake' }],
      },
      { id: 3, name: 'The Original (port)', game_type: 11, ...shown, parent_game: 1 },
      { id: 4, name: 'The Original Remastered', game_type: 9, ...shown },
    ];

    const result = await runSync(
      { client: fakeClient(page), store: null },
      { now: NOW, log: () => {} },
    );

    expect(result.fetched).toBe(4);
    expect(result.kept).toBe(2);
    expect(result.trimmed).toBe(2);
    // The remake's other names ride through the same alias map as any game's.
    expect(result.aliasGames).toBe(1);
  });
});
