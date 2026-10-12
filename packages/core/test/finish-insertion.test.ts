import { describe, expect, it } from 'vitest';
import { answer, startInsertion, type RankableItem } from '../src/ranking';
import { insertionToFinishArgs } from '../src/finish-insertion';

const g = (id: string, ...genres: string[]): RankableItem => ({ id, genres });

/** The worked example from docs/design/ranking-algorithm.md, best first. */
const likedTier: RankableItem[] = [
  g('hades', 'roguelike', 'action'),
  g('elden-ring', 'action-rpg', 'open-world'),
  g('outer-wilds', 'exploration', 'puzzle'),
  g('celeste', 'platformer'),
];

describe('insertionToFinishArgs', () => {
  it('throws while the insertion is still asking questions', () => {
    const s = startInsertion('liked', g('slay-the-spire', 'roguelike'), likedTier, { genreWindow: 0 });
    expect(s.done).toBe(false);
    expect(() => insertionToFinishArgs(s, { medium: 'game' })).toThrow('insertion not finished');
  });

  it('turns an empty-tier insertion into an insert at 0 with no comparisons', () => {
    const s = startInsertion('loved', g('hades', 'roguelike'), []);
    expect(insertionToFinishArgs(s, { medium: 'game' })).toEqual({
      mediaItemId: 'hades',
      medium: 'game',
      tier: 'loved',
      position: 0,
      comparisons: [],
    });
  });

  it('carries the position and every answer through in order', () => {
    // Plain binary search over four items: midpoint is index 1 (Elden Ring).
    let s = startInsertion('liked', g('slay-the-spire', 'roguelike'), likedTier, { genreWindow: 0 });
    s = answer(s, 'b'); // loses to Elden Ring, so it belongs in [2, 4]
    s = answer(s, 'a'); // beats Outer Wilds, so it belongs at 2
    expect(s.done).toBe(true);

    const args = insertionToFinishArgs(s, { medium: 'game' });
    expect(args.position).toBe(2);
    expect(args.medium).toBe('game');
    expect(args.tier).toBe('liked');
    expect(args.comparisons).toEqual([
      {
        item_a: 'slay-the-spire',
        item_b: 'elden-ring',
        outcome: 'b',
        context: { tier: 'liked', sameGenre: false, tierSize: 4, pivotReason: { kind: 'midpoint' } },
      },
      {
        item_a: 'slay-the-spire',
        item_b: 'outer-wilds',
        outcome: 'a',
        context: { tier: 'liked', sameGenre: false, tierSize: 4, pivotReason: { kind: 'midpoint' } },
      },
    ]);
  });

  it('maps engine ids to catalog ids when the UI drives the engine with its own', () => {
    const uuids: Record<string, string> = {
      'slay-the-spire': '00000000-0000-0000-0000-0000000000aa',
      'elden-ring': '00000000-0000-0000-0000-0000000000bb',
      'outer-wilds': '00000000-0000-0000-0000-0000000000cc',
      celeste: '00000000-0000-0000-0000-0000000000dd',
      hades: '00000000-0000-0000-0000-0000000000ee',
    };
    let s = startInsertion('liked', g('slay-the-spire', 'roguelike'), likedTier, { genreWindow: 0 });
    s = answer(s, 'too_close'); // stop right below Elden Ring

    const args = insertionToFinishArgs(s, { medium: 'game', mediaItemId: (id) => uuids[id]! });
    expect(args.mediaItemId).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(args.position).toBe(2);
    expect(args.comparisons).toEqual([
      {
        item_a: '00000000-0000-0000-0000-0000000000aa',
        item_b: '00000000-0000-0000-0000-0000000000bb',
        outcome: 'too_close',
        context: { tier: 'liked', sameGenre: false, tierSize: 4, pivotReason: { kind: 'midpoint' } },
      },
    ]);
  });

  it('carries the pivot reason into the jsonb context', () => {
    // Elden Ring is the midpoint of the four-game tier and the only action-rpg
    // in it, so the first question is a genre match and the log should say so.
    let s = startInsertion('liked', g('dark-souls', 'action-rpg'), likedTier, { genreWindow: 0 });
    s = answer(s, 'a'); // beats Elden Ring
    s = answer(s, 'a'); // beats Hades, so it lands at 0
    expect(s.done).toBe(true);

    const args = insertionToFinishArgs(s, { medium: 'game' });
    expect(args.comparisons[0]!.item_b).toBe('elden-ring');
    expect(args.comparisons[0]!.context).toEqual({
      tier: 'liked',
      sameGenre: true,
      tierSize: 4,
      pivotReason: { kind: 'genre', genre: 'action-rpg' },
    });
    expect(args.comparisons[1]!.context).toMatchObject({ pivotReason: { kind: 'midpoint' } });
    // The payload is plain JSON, which is what finish_insertion parses.
    expect(JSON.parse(JSON.stringify(args.comparisons))).toEqual(args.comparisons);
  });

  it('copies the context rather than aliasing the engine record', () => {
    let s = startInsertion('fine', g('tunic', 'action-adventure'), likedTier, { genreWindow: 0 });
    s = answer(s, 'a');
    s = answer(s, 'a');
    const args = insertionToFinishArgs(s, { medium: 'game' });
    expect(args.comparisons[0]!.context).not.toBe(s.records[0]!.context);
    expect(args.comparisons[0]!.context).toEqual(s.records[0]!.context);
  });
});
