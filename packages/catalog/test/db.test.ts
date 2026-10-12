import { describe, expect, it } from 'vitest';
import { dedupeByIgdbId, isLocal } from '../src/db';
import { mapGame } from '../src/map';
import type { MappedGame } from '../src/types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function mapped(id: number, title: string): MappedGame {
  return mapGame({ id, name: title, game_type: 0 }, NOW)!;
}

describe('dedupeByIgdbId', () => {
  it('keeps the last row for a repeated IGDB id', () => {
    const rows = dedupeByIgdbId([mapped(1, 'Old'), mapped(2, 'Other'), mapped(1, 'New')]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.gameDetails.igdb_id === 1)!.mediaItem.title).toBe('New');
  });

  it('leaves a batch with no repeats alone', () => {
    const rows = [mapped(1, 'A'), mapped(2, 'B'), mapped(3, 'C')];
    expect(dedupeByIgdbId(rows)).toEqual(rows);
  });
});

describe('isLocal', () => {
  it('recognises the local Supabase stack', () => {
    expect(isLocal('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toBe(true);
    expect(isLocal('postgresql://postgres:postgres@localhost:54322/postgres')).toBe(true);
  });

  it('treats a pooler host as remote, so TLS stays on', () => {
    expect(isLocal('postgresql://user:pw@aws-0-us-west-2.pooler.supabase.com:5432/postgres')).toBe(
      false,
    );
  });
});
