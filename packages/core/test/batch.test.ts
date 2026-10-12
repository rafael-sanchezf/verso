import { describe, expect, it } from 'vitest';
import {
  answerBatch,
  applyBatch,
  batchFinishArgs,
  nextQuestion,
  placeRest,
  remainingEstimate,
  startBatch,
  type BatchInput,
  type BatchItem,
  type BatchState,
  type PredictionConfidence,
} from '../src/batch';
import { answer, maxQuestions, scoreForPosition, startInsertion, type RankableItem } from '../src/ranking';
import { comparisonPrompt } from '../src/prompt';
import { TIERS, type ComparisonOutcome, type Tier } from '../src/model';

const g = (id: string, ...genres: string[]): RankableItem => ({ id, genres });
const ids = (xs: readonly RankableItem[]) => xs.map((x) => x.id);

function item(
  id: string,
  tier: Tier,
  predictedScore: number | null,
  confidence: PredictionConfidence | null = 'high',
  genres: string[] = [],
): BatchItem {
  return { item: g(id, ...genres), tier, predictedScore, confidence };
}

/** Position of every id in its tier's true order, best first. */
function truthOf(orders: Partial<Record<Tier, readonly string[]>>): Map<string, number> {
  const out = new Map<string, number>();
  for (const order of Object.values(orders)) order?.forEach((id, i) => out.set(id, i));
  return out;
}

/** Answer every question from the true order. */
function solve(state: BatchState, truth: ReadonlyMap<string, number>) {
  let s = state;
  let asked = 0;
  const pivots: string[] = [];
  for (let q = nextQuestion(s); q; q = nextQuestion(s)) {
    if (++asked > 10_000) throw new Error('runaway session');
    pivots.push(q.pivot.id);
    s = answerBatch(s, truth.get(q.item.id)! < truth.get(q.pivot.id)! ? 'a' : 'b');
  }
  return { state: s, asked, pivots };
}

function lcg(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Questions one-by-one binary insertion asks for the same games, answered from the truth. */
function plainCount(
  tier: Tier,
  existing: readonly RankableItem[],
  added: readonly RankableItem[],
  truth: ReadonlyMap<string, number>,
  options = {},
): { asked: number; order: string[] } {
  let list = existing.slice();
  let asked = 0;
  for (const it of added) {
    let s = startInsertion(tier, it, list, options);
    while (!s.done) {
      asked++;
      s = answer(s, truth.get(it.id)! < truth.get(list[s.pivotIndex!]!.id)! ? 'a' : 'b');
    }
    list = [...list];
    list.splice(s.insertAt!, 0, it);
  }
  return { asked, order: ids(list) };
}

/** A score halfway between the existing scores around gap `slot` of a tier of `n`. */
function scoreAtSlot(tier: Tier, slot: number, n: number): number {
  const above = slot > 0 ? scoreForPosition(tier, slot - 1, n) : 11;
  const below = slot < n ? scoreForPosition(tier, slot, n) : -1;
  return (above + below) / 2;
}

describe('startBatch', () => {
  it('throws when a game appears twice or is already ranked', () => {
    expect(() => startBatch({ items: [item('x', 'liked', 7), item('x', 'fine', 5)] })).toThrow('duplicate');
    expect(() => startBatch({ items: [item('x', 'liked', 7)], tiers: { loved: [g('x')] } })).toThrow('duplicate');
  });

  it('places the only new game of an empty tier with no question, as Option A does', () => {
    const s = startBatch({ items: [item('x', 'fine', null, null)] });
    expect(nextQuestion(s)).toBeNull();
    expect(remainingEstimate(s)).toBe(0);
    const result = applyBatch(s);
    expect(result.placements).toEqual([
      { item: g('x'), tier: 'fine', position: 0, placedBy: 'user', log: [] },
    ]);
  });
});

describe('starting from the guess', () => {
  // Liked, four ranked: scores 8.4, 7.8, 7.1, 6.5.
  const liked = [g('a'), g('b'), g('c'), g('d')];

  it('reads the existing order on the scale scoreForPosition gives it', () => {
    expect(liked.map((_, i) => scoreForPosition('liked', i, 4))).toEqual([8.4, 7.8, 7.1, 6.5]);
  });

  it('costs one question for a right guess at the top or the bottom of the tier', () => {
    const top = solve(startBatch({ items: [item('x', 'liked', 9.1)], tiers: { liked } }), truthOf({ liked: ['x', 'a', 'b', 'c', 'd'] }));
    expect(top.asked).toBe(1);
    expect(top.pivots).toEqual(['a']);
    expect(ids(applyBatch(top.state).tiers.liked)).toEqual(['x', 'a', 'b', 'c', 'd']);

    const bottom = solve(startBatch({ items: [item('x', 'liked', 6.0)], tiers: { liked } }), truthOf({ liked: ['a', 'b', 'c', 'd', 'x'] }));
    expect(bottom.asked).toBe(1);
    expect(bottom.pivots).toEqual(['d']);
  });

  it('costs two questions for a right guess between two ranked games, the nearer neighbour first', () => {
    // 7.5 sits between b (7.8, 0.3 away) and c (7.1, 0.4 away).
    const r = solve(startBatch({ items: [item('x', 'liked', 7.5)], tiers: { liked } }), truthOf({ liked: ['a', 'b', 'x', 'c', 'd'] }));
    expect(r.pivots).toEqual(['b', 'c']);
    expect(r.asked).toBe(2);
    expect(applyBatch(r.state).placements[0]).toMatchObject({ position: 2, placedBy: 'user' });
  });

  it('costs at most one question per open side when right, and at most three when off by one', () => {
    for (let n = 1; n <= 16; n++) {
      const list = Array.from({ length: n }, (_, i) => g(`t${i}`));
      for (let slot = 0; slot <= n; slot++) {
        const predicted = scoreAtSlot('liked', slot, n);
        for (const truthSlot of [slot - 1, slot, slot + 1]) {
          if (truthSlot < 0 || truthSlot > n) continue;
          const order = ids(list);
          order.splice(truthSlot, 0, 'x');
          const r = solve(startBatch({ items: [item('x', 'liked', predicted)], tiers: { liked: list } }), truthOf({ liked: order }));
          expect(ids(applyBatch(r.state).tiers.liked)).toEqual(order);
          if (truthSlot === slot) expect(r.asked).toBe(slot === 0 || slot === n ? 1 : 2);
          else expect(r.asked).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('widens by doubling steps once an answer disagrees', () => {
    // Twenty ranked; guessed at the top, truly 13th. Plain binary search would ask 5.
    const list = Array.from({ length: 20 }, (_, i) => g(`t${i}`));
    const order = ids(list);
    order.splice(12, 0, 'x');
    const r = solve(startBatch({ items: [item('x', 'liked', 9.5)], tiers: { liked: list } }), truthOf({ liked: order }));
    // t0 contradicts the guess, then t1, t3, t7, t15 by doubling, then binary search between t7 and t15.
    expect(r.pivots.slice(0, 5)).toEqual(['t0', 't1', 't3', 't7', 't15']);
    expect(ids(applyBatch(r.state).tiers.liked)).toEqual(order);
    expect(r.asked).toBeLessThanOrEqual(2 * maxQuestions(20));
  });

  it('prefers the neighbour that shares a genre once the tier has enough genre peers', () => {
    const rpg = 'Role-playing (RPG)';
    const tier = [g('a', rpg), g('b', rpg), g('c', 'Shooter'), g('d', rpg)];
    // Scores 8.4, 7.8, 7.1, 6.5; 7.2 is nearer c, but b shares the genre.
    const s = startBatch({ items: [item('x', 'liked', 7.2, 'high', [rpg])], tiers: { liked: tier } });
    expect(nextQuestion(s)!.pivot.id).toBe('b');
    expect(nextQuestion(s)!.pivotReason).toEqual({ kind: 'genre', genre: rpg });
    expect(comparisonPrompt(nextQuestion(s)!.insertion)).toBe('Which RPG did you enjoy more?');
    const off = startBatch({ items: [item('x', 'liked', 7.2, 'high', [rpg])], tiers: { liked: tier } }, { genreWindow: 0 });
    expect(nextQuestion(off)!.pivot.id).toBe('c');
  });

  it('says when the opponent is another game of the batch', () => {
    const s = startBatch({ items: [item('x', 'fine', 6), item('y', 'fine', 5)] });
    const q = nextQuestion(s)!;
    expect(q.item.id).toBe('y');
    expect(q.pivot.id).toBe('x');
    expect(q.pivotIsNew).toBe(true);
  });
});

describe('a game with no prediction', () => {
  it('asks exactly what startInsertion asks', () => {
    const rand = lcg(11);
    const pool = ['RPG', 'Shooter', 'Puzzle', 'Indie'];
    for (let trial = 0; trial < 200; trial++) {
      const n = Math.floor(rand() * 30);
      const list = Array.from({ length: n }, (_, i) => g(`t${i}`, pool[Math.floor(rand() * pool.length)]!));
      const x = g('x', pool[Math.floor(rand() * pool.length)]!);
      const order = ids(list);
      order.splice(Math.floor(rand() * (n + 1)), 0, 'x');
      const truth = truthOf({ fine: order });
      const options = { minGenrePeers: 2, genreWindow: 1 };

      const plain: string[] = [];
      let s = startInsertion('fine', x, list, options);
      while (!s.done) {
        plain.push(list[s.pivotIndex!]!.id);
        s = answer(s, truth.get('x')! < truth.get(list[s.pivotIndex!]!.id)! ? 'a' : 'b');
      }
      const r = solve(startBatch({ items: [{ item: x, tier: 'fine', predictedScore: null, confidence: null }], tiers: { fine: list } }, options), truth);
      expect(r.pivots).toEqual(plain);
    }
  });

  it('inserts several one by one in the tie-break order, as the log flow would', () => {
    const rand = lcg(5);
    for (let trial = 0; trial < 100; trial++) {
      const m = Math.floor(rand() * 8);
      const k = 1 + Math.floor(rand() * 6);
      const existing = Array.from({ length: m }, (_, i) => g(`e${i}`));
      const added = Array.from({ length: k }, (_, i) => g(`n${i}`));
      const order = ids(existing);
      for (const it of added) order.splice(Math.floor(rand() * (order.length + 1)), 0, it.id);
      const truth = truthOf({ fine: order });
      const tieBreak = shuffle(ids(added), rand);
      const byTieBreak = tieBreak.map((id) => added.find((a) => a.id === id)!);

      const r = solve(
        startBatch({ items: added.map((it) => ({ item: it, tier: 'fine', predictedScore: null, confidence: null })), tiers: { fine: existing }, tieBreak }),
        truth,
      );
      const plain = plainCount('fine', existing, byTieBreak, truth);
      expect(r.asked).toBe(plain.asked);
      expect(ids(applyBatch(r.state).tiers.fine)).toEqual(order);
    }
  });
});

describe('the worked example (three seeds in Loved; 3 Loved, 4 Liked, 2 Fine, 1 Didn\'t like)', () => {
  const seeds = [g('hades'), g('elden-ring'), g('hollow-knight')];
  const truth = {
    loved: ['botw', 'hades', 'astro-bot', 'elden-ring', 'animal-crossing', 'hollow-knight'],
    liked: ['odyssey', 'celeste', 'stardew', 'dread'],
    fine: ['mario-kart', 'ragnarok'],
    disliked: ['silksong'],
  };
  const tierOf = (id: string) => (Object.keys(truth) as Tier[]).find((t) => truth[t].includes(id))!;
  const newIds = Object.values(truth).flat().filter((id) => !ids(seeds).includes(id));
  /** Predictions in the true order inside each tier: every guess right. */
  const right: Record<string, number> = {
    botw: 9.8, 'astro-bot': 9.5, 'animal-crossing': 8.8,
    odyssey: 8.2, celeste: 7.6, stardew: 7.1, dread: 6.7,
    'mario-kart': 6.0, ragnarok: 5.0, silksong: 2.0,
  };
  const input = (predict: (id: string) => number | null): BatchInput => ({
    items: newIds.map((id) => ({ item: g(id), tier: tierOf(id), predictedScore: predict(id), confidence: predict(id) === null ? null : 'high' })),
    tiers: { loved: seeds },
    tieBreak: newIds,
  });
  const truthMap = truthOf(truth);
  const binary = (() => {
    let total = 0;
    for (const tier of TIERS) {
      const existing = tier === 'loved' ? seeds : [];
      const added = truth[tier].filter((id) => newIds.includes(id)).map((id) => g(id));
      total += plainCount(tier, existing, added, truthMap).asked;
    }
    return total;
  })();

  it('costs plain binary insertion 14 at worst and 13 here', () => {
    expect(binary).toBe(13);
  });

  it('costs 9 questions with right guesses and perfect answers, and lands every game where it belongs', () => {
    const r = solve(startBatch(input((id) => right[id]!)), truthMap);
    expect(r.asked).toBe(9);
    expect(r.asked).toBeLessThanOrEqual(14);
    const result = applyBatch(r.state);
    for (const tier of TIERS) expect(ids(result.tiers[tier])).toEqual(truth[tier]);
    expect(result.placements.every((p) => p.placedBy === 'user')).toBe(true);
  });

  it('costs what binary insertion costs with no predictions', () => {
    const r = solve(startBatch(input(() => null)), truthMap);
    expect(r.asked).toBe(binary);
  });

  it('never costs more than twice binary insertion with a useless guess, and still lands every game', () => {
    const reversed: Record<string, number> = Object.fromEntries(Object.entries(right).map(([id, s]) => [id, 10 - s]));
    const guesses: ((id: string) => number)[] = [(id) => reversed[id]!, () => 5, () => 9.9, () => 0];
    const rand = lcg(3);
    for (let i = 0; i < 50; i++) {
      const random = Object.fromEntries(newIds.map((id) => [id, rand() * 10]));
      guesses.push((id) => random[id]!);
    }
    for (const guess of guesses) {
      const r = solve(startBatch(input(guess)), truthMap);
      expect(r.asked).toBeLessThanOrEqual(2 * binary);
      const result = applyBatch(r.state);
      for (const tier of TIERS) expect(ids(result.tiers[tier])).toEqual(truth[tier]);
    }
  });
});

describe('perfect answers', () => {
  it('always land the true order, all placed by the user, within twice the binary-insertion bound', () => {
    const rand = lcg(2026);
    const confidences: (PredictionConfidence | null)[] = ['high', 'medium', 'needs_more_data', null];
    for (let trial = 0; trial < 300; trial++) {
      const tier = TIERS[Math.floor(rand() * 4)]!;
      const m = Math.floor(rand() * 15);
      const k = 1 + Math.floor(rand() * 12);
      const existing = Array.from({ length: m }, (_, i) => g(`e${i}`, rand() < 0.5 ? 'RPG' : 'Shooter'));
      const added = Array.from({ length: k }, (_, i) => g(`n${i}`, rand() < 0.5 ? 'RPG' : 'Shooter'));
      const order = ids(existing);
      for (const it of added) order.splice(Math.floor(rand() * (order.length + 1)), 0, it.id);
      const noise = rand() * 3;
      const items: BatchItem[] = added.map((it) => {
        const at = order.indexOf(it.id);
        const predictedScore = rand() < 0.2 ? null : 10 - (10 * at) / order.length + (rand() - 0.5) * noise;
        return { item: it, tier, predictedScore, confidence: confidences[Math.floor(rand() * 4)]! };
      });
      const r = solve(startBatch({ items, tiers: { [tier]: existing } }, { minGenrePeers: 2 }), truthOf({ [tier]: order }));
      const result = applyBatch(r.state);
      expect(ids(result.tiers[tier])).toEqual(order);
      expect(result.placements.every((p) => p.placedBy === 'user')).toBe(true);
      let bound = 0;
      for (let j = 0; j < k; j++) bound += maxQuestions(m + j);
      expect(r.asked).toBeLessThanOrEqual(2 * bound);
    }
  });
});

describe('placeRest', () => {
  it('after zero answers reproduces the predicted order, every new game marked prior', () => {
    const s = startBatch({
      items: [
        item('p', 'liked', 7.5),
        item('q', 'liked', 9.0),
        item('r', 'liked', 6.0),
        item('s', 'liked', 7.4),
        item('u', 'fine', 5.0),
        item('v', 'fine', 6.0),
        item('w', 'fine', 4.1),
      ],
      tiers: { liked: [g('a'), g('b'), g('c'), g('d')] },
    });
    const result = applyBatch(placeRest(s));
    // Liked scores 8.4, 7.8, 7.1, 6.5.
    expect(ids(result.tiers.liked)).toEqual(['q', 'a', 'b', 'p', 's', 'c', 'd', 'r']);
    // Fine was empty: v landed first with no question, but its order against u and w is a guess too.
    expect(ids(result.tiers.fine)).toEqual(['v', 'u', 'w']);
    expect(result.placements.every((p) => p.placedBy === 'prior')).toBe(true);
    expect(placeRest(s).log).toEqual([]);
  });

  it('keeps every answer, places within what the answers allow, and marks only the unresolved', () => {
    const rand = lcg(77);
    const outcomes: ComparisonOutcome[] = ['a', 'b', 'too_close', 'cant_compare'];
    for (let trial = 0; trial < 200; trial++) {
      const m = Math.floor(rand() * 10);
      const k = 1 + Math.floor(rand() * 8);
      const existing = Array.from({ length: m }, (_, i) => g(`e${i}`));
      const items = Array.from({ length: k }, (_, i) =>
        item(`n${i}`, 'loved', rand() < 0.25 ? null : 8 + rand() * 2.5),
      );
      let s = startBatch({ items, tiers: { loved: existing } });
      const stopAfter = Math.floor(rand() * 12);
      for (let n = 0; n < stopAfter && nextQuestion(s); n++) s = answerBatch(s, outcomes[Math.floor(rand() * 4)]!);
      const resolved = new Set(s.items.filter((_, i) => s.progress[i]!.placed && !s.progress[i]!.free).map((e) => e.item.id));
      const stopped = placeRest(s);
      expect(stopped.log).toEqual(s.log);
      expect(nextQuestion(stopped)).toBeNull();
      const result = applyBatch(stopped);
      const final = ids(result.tiers.loved);
      expect(final.filter((id) => id.startsWith('e'))).toEqual(ids(existing));
      for (const r of stopped.log) {
        if (r.outcome === 'a') expect(final.indexOf(r.itemA)).toBeLessThan(final.indexOf(r.itemB));
        if (r.outcome === 'b') expect(final.indexOf(r.itemA)).toBeGreaterThan(final.indexOf(r.itemB));
      }
      for (const p of result.placements) {
        if (resolved.has(p.item.id)) expect(p.placedBy).toBe('user');
        if (!s.progress[s.items.findIndex((e) => e.item.id === p.item.id)]!.placed) expect(p.placedBy).toBe('prior');
      }
    }
  });

  it('puts a game with no guess in the middle of its range, ties by the tie-break order', () => {
    const tier = [g('a'), g('b'), g('c'), g('d')];
    const s = startBatch({
      items: [item('x', 'liked', null, null), item('y', 'liked', null, null)],
      tiers: { liked: tier },
      tieBreak: ['y', 'x'],
    });
    expect(ids(applyBatch(placeRest(s)).tiers.liked)).toEqual(['a', 'b', 'y', 'x', 'c', 'd']);
  });
});

describe('escape hatches, as in Option A', () => {
  const tier = Array.from({ length: 8 }, (_, i) => g(`t${i}`));

  it('"too close" places the game directly below the opponent, and that is the user\'s placement', () => {
    const s = startBatch({ items: [item('x', 'liked', 7.5)], tiers: { liked: tier } });
    const pivot = nextQuestion(s)!.pivot.id;
    const done = answerBatch(s, 'too_close');
    expect(nextQuestion(done)).toBeNull();
    const result = applyBatch(done);
    const final = ids(result.tiers.liked);
    expect(final.indexOf('x')).toBe(final.indexOf(pivot) + 1);
    expect(result.placements[0]!.placedBy).toBe('user');
    expect(done.log.map((r) => r.outcome)).toEqual(['too_close']);
  });

  it('"can\'t compare" swaps the opponent; two in a row place the game at the middle of its range', () => {
    const s = startBatch({ items: [item('x', 'liked', null, null)], tiers: { liked: tier } }, { genreWindow: 0 });
    const first = nextQuestion(s)!.pivot.id;
    const s2 = answerBatch(s, 'cant_compare');
    expect(nextQuestion(s2)!.pivot.id).not.toBe(first);
    const done = answerBatch(s2, 'cant_compare');
    expect(nextQuestion(done)).toBeNull();
    // Option A on the same tier: two in a row end at floor((0 + 8) / 2).
    const plain = answer(answer(startInsertion('liked', g('x'), tier, { genreWindow: 0 }), 'cant_compare'), 'cant_compare');
    expect(applyBatch(done).placements[0]!.position).toBe(plain.insertAt);
    expect(plain.insertAt).toBe(4);
  });

  it('"can\'t compare" on a guess tries the other neighbour', () => {
    const s = startBatch({ items: [item('x', 'liked', 7.5)], tiers: { liked: [g('a'), g('b'), g('c'), g('d')] } });
    expect(nextQuestion(s)!.pivot.id).toBe('b');
    expect(nextQuestion(answerBatch(s, 'cant_compare'))!.pivot.id).toBe('c');
  });
});

describe('the log', () => {
  it('holds every answered question once, in order, split by game into finish_insertion calls', () => {
    const rand = lcg(404);
    const outcomes: ComparisonOutcome[] = ['a', 'b', 'a', 'b', 'too_close', 'cant_compare'];
    for (let trial = 0; trial < 100; trial++) {
      const items = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) =>
        item(`n${i}`, TIERS[Math.floor(rand() * 4)]!, rand() < 0.3 ? null : rand() * 10, 'medium', ['RPG']),
      );
      let s = startBatch({ items, tiers: { loved: [g('s1', 'RPG'), g('s2'), g('s3', 'RPG')] } });
      const asked: [string, string, ComparisonOutcome][] = [];
      for (let q = nextQuestion(s); q; q = nextQuestion(s)) {
        const outcome = outcomes[Math.floor(rand() * outcomes.length)]!;
        asked.push([q.item.id, q.pivot.id, outcome]);
        expect(q.insertion.records).toEqual(s.log.filter((r) => r.itemA === q.item.id));
        s = answerBatch(s, outcome);
      }
      expect(s.log.map((r) => [r.itemA, r.itemB, r.outcome])).toEqual(asked);
      const result = applyBatch(s);
      const perGame = result.placements.flatMap((p) => p.log);
      expect(perGame).toHaveLength(s.log.length);
      for (const p of result.placements) {
        expect(p.log).toEqual(s.log.filter((r) => r.itemA === p.item.id));
        for (const r of p.log) expect(r.context.tier).toBe(p.tier);
      }
    }
  });
});

describe('remainingEstimate', () => {
  it('never goes up after an answer, reads at least 1 while a question remains, and 0 at the end', () => {
    const rand = lcg(9);
    const outcomes: ComparisonOutcome[] = ['a', 'b', 'a', 'b', 'too_close', 'cant_compare'];
    for (let trial = 0; trial < 200; trial++) {
      const m = Math.floor(rand() * 12);
      const items = Array.from({ length: 1 + Math.floor(rand() * 15) }, (_, i) =>
        item(`n${i}`, TIERS[Math.floor(rand() * 4)]!, rand() < 0.3 ? null : rand() * 10, (['high', 'medium', 'needs_more_data', null] as const)[Math.floor(rand() * 4)]!),
      );
      let s = startBatch({ items, tiers: { liked: Array.from({ length: m }, (_, i) => g(`e${i}`)) } });
      let shown = remainingEstimate(s);
      while (nextQuestion(s)) {
        expect(shown).toBeGreaterThanOrEqual(1);
        s = answerBatch(s, outcomes[Math.floor(rand() * outcomes.length)]!);
        const next = remainingEstimate(s);
        expect(next).toBeLessThanOrEqual(shown);
        shown = next;
      }
      expect(shown).toBe(0);
    }
  });

  it('starts near what the worked example costs', () => {
    const s = startBatch({
      items: [
        item('botw', 'loved', 9.8), item('astro-bot', 'loved', 9.5), item('animal-crossing', 'loved', 8.8),
        item('odyssey', 'liked', 8.2), item('celeste', 'liked', 7.6), item('stardew', 'liked', 7.1), item('dread', 'liked', 6.7),
        item('mario-kart', 'fine', 6.0), item('ragnarok', 'fine', 5.0), item('silksong', 'disliked', 2.0),
      ],
      tiers: { loved: [g('hades'), g('elden-ring'), g('hollow-knight')] },
    });
    expect(remainingEstimate(s)).toBeGreaterThanOrEqual(8);
    expect(remainingEstimate(s)).toBeLessThanOrEqual(14);
  });
});

describe('applyBatch and batchFinishArgs', () => {
  it('refuses an unfinished session', () => {
    const s = startBatch({ items: [item('x', 'liked', 7)], tiers: { liked: [g('a')] } });
    expect(() => applyBatch(s)).toThrow('batch not finished');
  });

  it('writes tier by tier, best position first, so replaying the writes rebuilds every tier', () => {
    const rand = lcg(31);
    for (let trial = 0; trial < 100; trial++) {
      const existing: Partial<Record<Tier, RankableItem[]>> = {};
      for (const tier of TIERS) existing[tier] = Array.from({ length: Math.floor(rand() * 5) }, (_, i) => g(`${tier}-${i}`));
      const items = Array.from({ length: 1 + Math.floor(rand() * 10) }, (_, i) =>
        item(`n${i}`, TIERS[Math.floor(rand() * 4)]!, rand() < 0.3 ? null : rand() * 10),
      );
      let s = startBatch({ items, tiers: existing });
      for (let n = Math.floor(rand() * 6); n > 0 && nextQuestion(s); n--) s = answerBatch(s, rand() < 0.5 ? 'a' : 'b');
      const result = applyBatch(placeRest(s));
      const args = batchFinishArgs(result, { medium: 'game', mediaItemId: (id) => `uuid-${id}` });

      // finish_insertion inserts at the position and shifts the rest down.
      const db: Record<Tier, string[]> = { loved: [], liked: [], fine: [], disliked: [] };
      for (const tier of TIERS) db[tier] = ids(existing[tier]!).map((id) => `uuid-${id}`);
      for (const a of args) db[a.tier].splice(a.position, 0, a.mediaItemId);
      for (const tier of TIERS) expect(db[tier]).toEqual(ids(result.tiers[tier]).map((id) => `uuid-${id}`));

      expect(args).toHaveLength(items.length);
      for (const a of args) {
        const p = result.placements.find((x) => `uuid-${x.item.id}` === a.mediaItemId)!;
        expect(a.placedBy).toBe(p.placedBy);
        expect(a.comparisons).toEqual(
          p.log.map((r) => ({ item_a: `uuid-${r.itemA}`, item_b: `uuid-${r.itemB}`, outcome: r.outcome, context: { ...r.context } })),
        );
      }
    }
  });

  it('reads positions from the lists, so a review that moves a new game writes where it moved', () => {
    const s = startBatch({ items: [item('x', 'liked', 9), item('y', 'liked', 6)], tiers: { liked: [g('a'), g('b')] } });
    const result = applyBatch(placeRest(s));
    expect(ids(result.tiers.liked)).toEqual(['x', 'a', 'b', 'y']);
    const moved = { ...result, tiers: { ...result.tiers, liked: [g('a'), g('y'), g('b'), g('x')] } };
    expect(batchFinishArgs(moved, { medium: 'game' }).map((a) => [a.mediaItemId, a.position])).toEqual([
      ['y', 1],
      ['x', 3],
    ]);
  });
});
