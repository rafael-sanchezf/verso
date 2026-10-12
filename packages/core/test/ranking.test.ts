import { describe, expect, it } from 'vitest';
import {
  answer,
  applyInsertion,
  choosePivot,
  maxQuestions,
  scoreForPosition,
  sharedGenre,
  sharesGenre,
  startInsertion,
  type InsertionState,
  type RankableItem,
} from '../src/ranking';
import type { ComparisonOutcome } from '../src/model';

const g = (id: string, ...genres: string[]): RankableItem => ({ id, genres });

/** The worked example from docs/design/ranking-algorithm.md, best first. */
const likedTier: RankableItem[] = [
  g('hades', 'roguelike', 'action'),
  g('elden-ring', 'action-rpg', 'open-world'),
  g('outer-wilds', 'exploration', 'puzzle'),
  g('celeste', 'platformer'),
  g('baldurs-gate-3', 'crpg'),
  g('hollow-knight', 'metroidvania', 'action'),
  g('tunic', 'action-adventure'),
  g('stardew-valley', 'farming', 'cozy'),
];

const pivotId = (s: InsertionState) => (s.pivotIndex === null ? null : s.list[s.pivotIndex]!.id);

describe('startInsertion', () => {
  it('finishes immediately for an empty tier', () => {
    const s = startInsertion('liked', g('new'), []);
    expect(s.done).toBe(true);
    expect(s.insertAt).toBe(0);
    expect(applyInsertion(s).map((i) => i.id)).toEqual(['new']);
  });

  it('asks about the midpoint first when the genre preference is off', () => {
    const s = startInsertion('liked', g('slay-the-spire', 'roguelike', 'deckbuilder'), likedTier, { genreWindow: 0 });
    // 8 items, insertion range [0, 8], candidate pivots 0..7, midpoint floor((0 + 7) / 2) = 3 = Celeste.
    expect(pivotId(s)).toBe('celeste');
  });
});

describe('binary insertion (worked example)', () => {
  it('places Slay the Spire between Outer Wilds and Celeste after three answers', () => {
    let s = startInsertion('liked', g('slay-the-spire', 'roguelike', 'deckbuilder'), likedTier, { genreWindow: 0 });
    expect(pivotId(s)).toBe('celeste');
    s = answer(s, 'a'); // beats Celeste -> range [0, 3]
    expect(pivotId(s)).toBe('elden-ring');
    s = answer(s, 'b'); // loses to Elden Ring -> range [2, 3]
    expect(pivotId(s)).toBe('outer-wilds');
    s = answer(s, 'b'); // loses to Outer Wilds -> range [3, 3], done
    expect(s.done).toBe(true);
    expect(s.insertAt).toBe(3);
    const ids = applyInsertion(s).map((i) => i.id);
    expect(ids.slice(2, 5)).toEqual(['outer-wilds', 'slay-the-spire', 'celeste']);
    expect(s.records).toHaveLength(3);
    expect(s.records.map((r) => r.outcome)).toEqual(['a', 'b', 'b']);
    expect(s.records[0]!.context).toEqual({
      tier: 'liked',
      sameGenre: false,
      tierSize: 8,
      pivotReason: { kind: 'midpoint' },
    });
  });

  it('never asks more than ceil(log2(n + 1)) questions with a consistent oracle', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let trial = 0; trial < 200; trial++) {
      const n = Math.floor(rand() * 40);
      const truth = Array.from({ length: n }, (_, i) => g(`t${i}`));
      const trueIndex = Math.floor(rand() * (n + 1));
      let s = startInsertion('fine', g('new'), truth, { genreWindow: 0 });
      let questions = 0;
      while (!s.done) {
        questions++;
        // Oracle: the new item beats everything at or after trueIndex.
        s = answer(s, s.pivotIndex! >= trueIndex ? 'a' : 'b');
      }
      expect(questions).toBeLessThanOrEqual(maxQuestions(n));
      expect(s.insertAt).toBe(trueIndex);
    }
  });

  it('still lands on the true position when genre preference is on', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const genres = ['rpg', 'shooter', 'puzzle', 'cozy'];
    for (let trial = 0; trial < 200; trial++) {
      const n = Math.floor(rand() * 40);
      const truth = Array.from({ length: n }, (_, i) => g(`t${i}`, genres[Math.floor(rand() * genres.length)]!));
      const trueIndex = Math.floor(rand() * (n + 1));
      let s = startInsertion('fine', g('new', 'rpg'), truth, { genreWindow: 2, minGenrePeers: 2 });
      let questions = 0;
      while (!s.done) {
        questions++;
        s = answer(s, s.pivotIndex! >= trueIndex ? 'a' : 'b');
      }
      expect(s.insertAt).toBe(trueIndex);
      // Genre-aware pivots may cost extra questions, but the bound is still small.
      expect(questions).toBeLessThanOrEqual(maxQuestions(n) + 4);
    }
  });
});

describe('genre-preferring pivots', () => {
  const newItem = g('slay-the-spire', 'roguelike', 'deckbuilder');
  // Three roguelikes in the tier so the preference is active with the default minGenrePeers of 3.
  const tier: RankableItem[] = [
    g('a', 'shooter'),
    g('b', 'roguelike'),
    g('c', 'platformer'),
    g('d', 'roguelike'),
    g('e', 'strategy'),
    g('f', 'roguelike'),
    g('g', 'racing'),
  ];

  it('prefers a same-genre pivot within the window over the exact midpoint', () => {
    // Candidates 0..6, midpoint 3 = 'd' (roguelike), so midpoint itself is same-genre.
    const s = startInsertion('liked', newItem, tier);
    expect(pivotId(s)).toBe('d');
    // Beat d -> range [0, 3], candidates 0..2, midpoint 1 = 'b' (roguelike).
    const s2 = answer(s, 'a');
    expect(pivotId(s2)).toBe('b');
  });

  it('falls back to the midpoint when no same-genre item is within the window', () => {
    const noPeers: RankableItem[] = [g('x', 'shooter'), g('y', 'racing'), g('z', 'sports')];
    const s = startInsertion('liked', newItem, noPeers);
    expect(pivotId(s)).toBe('y');
  });

  it('ignores genre until the tier has enough genre peers', () => {
    const onePeer: RankableItem[] = [g('x', 'roguelike'), g('y', 'racing'), g('z', 'sports'), g('w', 'shooter')];
    // Midpoint of candidates 0..3 is 1 = 'y'. 'x' is a roguelike one step away, but only one peer exists.
    const s = startInsertion('liked', newItem, onePeer, { minGenrePeers: 3, genreWindow: 1 });
    expect(pivotId(s)).toBe('y');
    const s2 = startInsertion('liked', newItem, onePeer, { minGenrePeers: 1, genreWindow: 1 });
    expect(pivotId(s2)).toBe('x');
  });

  it('marks sameGenre in the comparison record', () => {
    const s = answer(startInsertion('liked', newItem, tier), 'b');
    expect(s.records[0]!.itemB).toBe('d');
    expect(s.records[0]!.context.sameGenre).toBe(true);
  });
});

describe('ignoredGenres', () => {
  const indieRpg = g('new', 'Indie', 'Role-playing (RPG)');

  it('ignores Indie by default, so a shared Indie tag is not a genre match', () => {
    expect(sharesGenre(indieRpg, g('other', 'Indie'))).toBe(false);
    expect(sharedGenre(indieRpg, g('other', 'Indie'))).toBeNull();
    expect(sharesGenre(indieRpg, g('other', 'Indie', 'Role-playing (RPG)'))).toBe(true);
    expect(sharedGenre(indieRpg, g('other', 'Indie', 'Role-playing (RPG)'))).toBe('Role-playing (RPG)');
  });

  it('names the first shared genre in the NEW item\'s order, not the pivot\'s', () => {
    const newItem = g('new', 'Shooter', 'Adventure');
    const pivot = g('pivot', 'Adventure', 'Shooter');
    expect(sharedGenre(newItem, pivot)).toBe('Shooter');
    expect(sharedGenre(pivot, newItem)).toBe('Adventure');
  });

  it('honours an explicit ignore list instead of the default', () => {
    expect(sharesGenre(indieRpg, g('other', 'Indie'), [])).toBe(true);
    expect(sharesGenre(indieRpg, g('other', 'Role-playing (RPG)'), ['Role-playing (RPG)'])).toBe(false);
  });

  it('keeps an ignored genre from attracting a pivot', () => {
    const newItem = g('new', 'Indie', 'Shooter');
    // Candidates 0..4, midpoint 2 = 'c'. 'b' and 'd' share only "Indie".
    const tier = [
      g('a', 'Racing'),
      g('b', 'Indie'),
      g('c', 'Racing'),
      g('d', 'Indie'),
      g('e', 'Indie', 'Shooter'),
    ];
    const s = startInsertion('liked', newItem, tier, { minGenrePeers: 1, genreWindow: 1 });
    expect(pivotId(s)).toBe('c');
    // With nothing ignored, the same tier pulls the pivot onto an Indie peer.
    const loose = startInsertion('liked', newItem, tier, {
      minGenrePeers: 1,
      genreWindow: 1,
      ignoredGenres: [],
    });
    expect(['b', 'd']).toContain(pivotId(loose));
  });

  it('keeps an ignored genre from counting towards minGenrePeers', () => {
    const newItem = g('new', 'Indie', 'Shooter');
    // Four Indie peers, but only one real genre peer, so the preference stays off.
    const tier = [
      g('a', 'Indie'),
      g('b', 'Indie'),
      g('c', 'Racing'),
      g('d', 'Indie'),
      g('e', 'Indie'),
    ];
    const s = startInsertion('liked', newItem, tier, { minGenrePeers: 3, genreWindow: 1 });
    expect(pivotId(s)).toBe('c');
  });

  it('reports sameGenre in the log without counting the ignored genre', () => {
    const newItem = g('new', 'Indie', 'Shooter');
    const s = answer(startInsertion('liked', newItem, [g('only', 'Indie')], { genreWindow: 0 }), 'a');
    expect(s.records[0]!.context.sameGenre).toBe(false);
  });
});

describe('pivotReason', () => {
  const shooter = g('new', 'Shooter');
  // Candidates 0..4, midpoint 2. Only 'c' shares a genre, so with the preference
  // off the plain midpoint lands on a genre peer anyway.
  const tier = [
    g('a', 'Racing'),
    g('b', 'Racing'),
    g('c', 'Shooter'),
    g('d', 'Racing'),
    g('e', 'Racing'),
  ];

  it('names the shared genre when the pivot is a genre peer', () => {
    const s = startInsertion('liked', shooter, tier, { genreWindow: 0 });
    expect(pivotId(s)).toBe('c');
    expect(s.pivotReason).toEqual({ kind: 'genre', genre: 'Shooter' });
  });

  it('is a midpoint when the pivot shares nothing', () => {
    const s = startInsertion('liked', g('new', 'Puzzle'), tier, { genreWindow: 0 });
    expect(s.pivotReason).toEqual({ kind: 'midpoint' });
  });

  it('names the first shared genre in the new item\'s order', () => {
    const s = startInsertion('liked', g('new', 'Adventure', 'Shooter'), [g('only', 'Shooter', 'Adventure')]);
    expect(s.pivotReason).toEqual({ kind: 'genre', genre: 'Adventure' });
  });

  it('skips an ignored genre when naming the shared one', () => {
    const s = startInsertion('liked', g('new', 'Indie', 'Shooter'), [g('only', 'Indie', 'Shooter')]);
    expect(s.pivotReason).toEqual({ kind: 'genre', genre: 'Shooter' });
  });

  it('follows the pivot when "can\'t compare" swaps it', () => {
    const s = startInsertion('liked', shooter, tier, { genreWindow: 0 });
    expect(s.pivotReason).toEqual({ kind: 'genre', genre: 'Shooter' });
    const swapped = answer(s, 'cant_compare');
    expect(pivotId(swapped)).not.toBe('c');
    expect(swapped.pivotReason).toEqual({ kind: 'midpoint' });
  });

  it('follows the pivot when the range narrows', () => {
    const s = startInsertion('liked', shooter, tier, { genreWindow: 0 });
    const narrowed = answer(s, 'a'); // beats 'c' -> range [0, 2], midpoint 0 = 'a' (Racing)
    expect(pivotId(narrowed)).toBe('a');
    expect(narrowed.pivotReason).toEqual({ kind: 'midpoint' });
  });

  it('is null exactly when there is no pivot', () => {
    const empty = startInsertion('liked', shooter, []);
    expect(empty.pivotIndex).toBeNull();
    expect(empty.pivotReason).toBeNull();

    const done = answer(startInsertion('liked', shooter, [g('only', 'Shooter')]), 'too_close');
    expect(done.done).toBe(true);
    expect(done.pivotIndex).toBeNull();
    expect(done.pivotReason).toBeNull();
  });

  it('reaches the comparison log', () => {
    const s = answer(startInsertion('liked', shooter, tier, { genreWindow: 0 }), 'a');
    expect(s.records[0]!.itemB).toBe('c');
    expect(s.records[0]!.context.pivotReason).toEqual({ kind: 'genre', genre: 'Shooter' });
    expect(s.records[0]!.context.sameGenre).toBe(true);
  });

  it('matches the pivot in every reachable state, and in every record', () => {
    // An independent reading of the rule, so this checks the engine rather than
    // checking sharedGenre against itself.
    const expectedReason = (item: RankableItem, pivot: RankableItem, ignored: readonly string[]) => {
      const ignoredLower = ignored.map((x) => x.toLowerCase());
      for (const genre of item.genres) {
        if (ignoredLower.includes(genre.toLowerCase())) continue;
        if (pivot.genres.includes(genre)) return { kind: 'genre', genre };
      }
      return { kind: 'midpoint' };
    };

    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

    const pool = ['Shooter', 'Role-playing (RPG)', 'Indie', 'Puzzle', 'Adventure', 'Platform'];
    const outcomes: ComparisonOutcome[] = ['a', 'b', 'too_close', 'cant_compare'];
    const ignoreLists: readonly string[][] = [['Indie'], [], ['Indie', 'Adventure'], ['indie']];

    let sawGenre = false;
    let sawMidpoint = false;

    for (let trial = 0; trial < 400; trial++) {
      const n = Math.floor(rand() * 30);
      const genresOf = () => Array.from({ length: Math.floor(rand() * 3) }, () => pick(pool));
      const list = Array.from({ length: n }, (_, i) => g(`t${i}`, ...genresOf()));
      const item = g('new', ...genresOf());
      const ignoredGenres = pick(ignoreLists);
      const options = {
        genreWindow: Math.floor(rand() * 4),
        minGenrePeers: Math.floor(rand() * 5),
        maxConsecutiveCantCompare: 1 + Math.floor(rand() * 3),
        ignoredGenres,
      };

      let s = startInsertion('fine', item, list, options);
      for (let step = 0; step < 60; step++) {
        if (s.pivotIndex === null) {
          expect(s.pivotReason).toBeNull();
          break;
        }
        // The reason describes the pivot that is actually on screen.
        const pivot = s.list[s.pivotIndex]!;
        expect(s.pivotReason).toEqual(expectedReason(item, pivot, ignoredGenres));
        // And the stored pivot is the one choosePivot picks for this state.
        expect(s.pivotIndex).toBe(choosePivot(s));
        if (s.pivotReason!.kind === 'genre') {
          sawGenre = true;
          const { genre } = s.pivotReason as { kind: 'genre'; genre: string };
          expect(item.genres).toContain(genre);
          expect(pivot.genres).toContain(genre);
          expect(ignoredGenres.map((x) => x.toLowerCase())).not.toContain(genre.toLowerCase());
        } else {
          sawMidpoint = true;
        }
        s = answer(s, pick(outcomes));
      }
      expect(s.done).toBe(true);
      expect(s.pivotReason).toBeNull();

      // Every logged comparison carries the reason for the opponent it names.
      for (const r of s.records) {
        const pivot = list.find((x) => x.id === r.itemB)!;
        expect(r.context.pivotReason).toEqual(expectedReason(item, pivot, ignoredGenres));
        expect(r.context.sameGenre).toBe(r.context.pivotReason.kind === 'genre');
      }
    }

    // The trials actually exercised both arms.
    expect(sawGenre).toBe(true);
    expect(sawMidpoint).toBe(true);
  });
});

describe('escape hatches', () => {
  it('"too close" places the item directly below the pivot', () => {
    const s = startInsertion('liked', g('new'), likedTier, { genreWindow: 0 });
    expect(pivotId(s)).toBe('celeste');
    const done = answer(s, 'too_close');
    expect(done.done).toBe(true);
    expect(done.insertAt).toBe(4);
    expect(applyInsertion(done).map((i) => i.id).slice(3, 5)).toEqual(['celeste', 'new']);
    expect(done.records[0]!.outcome).toBe('too_close');
  });

  it('"can\'t compare" swaps the pivot without narrowing the range', () => {
    const s = startInsertion('liked', g('new'), likedTier, { genreWindow: 0 });
    const s2 = answer(s, 'cant_compare');
    expect(s2.done).toBe(false);
    expect(s2.lo).toBe(0);
    expect(s2.hi).toBe(8);
    expect(s2.pivotIndex).not.toBe(3);
    expect(s2.declined).toEqual([3]);
  });

  it('two consecutive "can\'t compare" answers end at the range midpoint', () => {
    const s = startInsertion('liked', g('new'), likedTier, { genreWindow: 0 });
    const done = answer(answer(s, 'cant_compare'), 'cant_compare');
    expect(done.done).toBe(true);
    expect(done.insertAt).toBe(4);
    expect(done.records).toHaveLength(2);
  });

  it('a normal answer resets the consecutive counter', () => {
    const s = startInsertion('liked', g('new'), likedTier, { genreWindow: 0 });
    const s2 = answer(answer(s, 'cant_compare'), 'a');
    expect(s2.consecutiveCantCompare).toBe(0);
    expect(s2.declined).toEqual([]);
  });

  it('"can\'t compare" prefers a same-genre replacement pivot', () => {
    const newItem = g('new', 'roguelike');
    const tier = [g('a', 'shooter'), g('b', 'roguelike'), g('c', 'shooter'), g('d', 'roguelike'), g('e', 'shooter')];
    // minGenrePeers 2 so preference is active. Candidates 0..4, midpoint 2 = 'c' (shooter); window 1 reaches 'b' and 'd'.
    const s = startInsertion('liked', newItem, tier, { minGenrePeers: 2, genreWindow: 1 });
    expect(['b', 'd']).toContain(pivotId(s));
  });

  it('a single-item tier with "can\'t compare" still finishes', () => {
    const s = startInsertion('liked', g('new'), [g('only')], { genreWindow: 0 });
    const done = answer(s, 'cant_compare');
    expect(done.done).toBe(true);
    expect([0, 1]).toContain(done.insertAt);
  });
});

describe('answer on a finished state', () => {
  it('is a no-op', () => {
    const s = startInsertion('liked', g('new'), []);
    expect(answer(s, 'a')).toBe(s);
  });
});

describe('scoreForPosition', () => {
  it('spans the tier band from best to worst', () => {
    expect(scoreForPosition('loved', 0, 4)).toBe(10);
    expect(scoreForPosition('loved', 3, 4)).toBe(8.5);
    expect(scoreForPosition('liked', 0, 3)).toBe(8.4);
    expect(scoreForPosition('liked', 2, 3)).toBe(6.5);
    expect(scoreForPosition('disliked', 0, 2)).toBe(3.9);
    expect(scoreForPosition('disliked', 1, 2)).toBe(0);
  });

  it('puts a single item at the band midpoint', () => {
    expect(scoreForPosition('fine', 0, 1)).toBe(5.2);
  });

  it('never lets a lower tier outscore a higher one', () => {
    expect(scoreForPosition('liked', 0, 1)).toBeLessThan(scoreForPosition('loved', 0, 1));
    expect(scoreForPosition('fine', 0, 1)).toBeLessThan(scoreForPosition('liked', 99, 100));
  });

  it('rejects impossible positions', () => {
    expect(() => scoreForPosition('fine', 0, 0)).toThrow();
    expect(() => scoreForPosition('fine', 5, 5)).toThrow();
  });
});

describe('maxQuestions', () => {
  it('matches log2 bounds', () => {
    expect(maxQuestions(0)).toBe(0);
    expect(maxQuestions(1)).toBe(1);
    expect(maxQuestions(8)).toBe(4);
    expect(maxQuestions(7)).toBe(3);
    expect(maxQuestions(64)).toBe(7);
  });
});
