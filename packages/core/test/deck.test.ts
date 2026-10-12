import { describe, expect, it } from 'vitest';
import { orderDeck } from '../src/deck';

const row = (id: string, popularityRank: number, boost = 0) => ({ id, popularityRank, boost });
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe('orderDeck', () => {
  it('returns the popularity order untouched when every boost is 0', () => {
    const rows = [row('c', 3), row('a', 1), row('e', 5), row('b', 2), row('d', 4)];
    expect(ids(orderDeck(rows))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(orderDeck(rows, { pinned: 0 }))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('moves a candidate up by its boost, five places a unit by default', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`r${i + 1}`, i + 1));
    rows[11] = row('shooter', 12, 2); // 12 - 2 * 5 = 2: level with r2, which is more popular
    expect(ids(orderDeck(rows, { pinned: 0 })).indexOf('shooter')).toBe(2);
    expect(ids(orderDeck(rows, { pinned: 0, positionsPerBoost: 1 })).indexOf('shooter')).toBe(10);
  });

  it('moves a candidate down by a negative boost', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i + 1}`, i + 1));
    rows[3] = row('sports', 4, -1); // 4 + 5 = 9: level with r9, and more popular than it
    expect(ids(orderDeck(rows, { pinned: 0 }))).toEqual(['r1', 'r2', 'r3', 'r5', 'r6', 'r7', 'r8', 'sports', 'r9', 'r10']);
  });

  it('keeps the top three by popularity at the top of page one whatever the boost says', () => {
    const rows = [
      row('mario-kart', 1, -3),
      row('botw', 2, -2),
      row('odyssey', 3, 0),
      row('ragnarok', 4, 0),
      row('astro-bot', 5, 1.5),
      row('stardew', 6, 0),
    ];
    const order = ids(orderDeck(rows));
    expect(order.slice(0, 3)).toEqual(['mario-kart', 'botw', 'odyssey']);
    expect(order.slice(3)).toEqual(['astro-bot', 'ragnarok', 'stardew']);
  });

  it('pins as many as asked, and nothing past the pool', () => {
    const rows = [row('a', 1, -5), row('b', 2, 5)];
    expect(ids(orderDeck(rows, { pinned: 1 }))).toEqual(['a', 'b']);
    expect(ids(orderDeck(rows, { pinned: 0 }))).toEqual(['b', 'a']);
    expect(ids(orderDeck(rows, { pinned: 10 }))).toEqual(['a', 'b']);
    expect(orderDeck([])).toEqual([]);
  });

  it('breaks ties by popularity, then by the order given, and returns the same objects', () => {
    const rows = [row('x', 6, 1), row('y', 1, 0), row('z', 6, 1), row('w', 2, 0)];
    // x and z land on 6 - 5 = 1, tied with y; y is more popular.
    const ordered = orderDeck(rows, { pinned: 0 });
    expect(ids(ordered)).toEqual(['y', 'x', 'z', 'w']);
    expect(ordered[1]).toBe(rows[0]);
  });

  it('treats a boost that is not a number as 0', () => {
    const rows = [row('a', 1), row('b', 2, Number.NaN), row('c', 3)];
    expect(ids(orderDeck(rows, { pinned: 0 }))).toEqual(['a', 'b', 'c']);
  });
});
