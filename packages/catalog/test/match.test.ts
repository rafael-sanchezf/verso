import { describe, expect, it } from 'vitest';
import {
  indexCatalogByKey,
  indexCatalogByTitle,
  matchUnique,
  normalizeTitle,
} from '../src/match';
import type { SourceKey } from '../src/types';

describe('normalizeTitle', () => {
  it('keeps only letters and digits', () => {
    expect(normalizeTitle('A Plague Tale: Requiem')).toBe('aplaguetalerequiem');
    expect(normalizeTitle("Aerial_Knight's DropShot")).toBe('aerialknightsdropshot');
    expect(normalizeTitle('Age of Empires II: Definitive Edition')).toBe(
      'ageofempiresiidefinitiveedition',
    );
  });

  it('strips the trademark furniture, which is where the two catalogues differ most', () => {
    // ™ and ℠ decompose under NFKD into the letters TM and SM, so stripping
    // them has to happen before the fold or the key grows two letters and
    // matches nothing. This title is in the live Game Pass fixture.
    expect(normalizeTitle('A Game About Digging A Hole™')).toBe('agameaboutdiggingahole');
    expect(normalizeTitle('Some Service℠')).toBe('someservice');
    expect(normalizeTitle('Assassin’s Creed® Odyssey')).toBe('assassinscreedodyssey');
    expect(normalizeTitle('Anno® 1404 History Edition')).toBe('anno1404historyedition');
    expect(normalizeTitle('Some Game ©2020')).toBe('somegame2020');
    expect(normalizeTitle('A Game About Digging A Hole™')).toBe(
      normalizeTitle('A Game About Digging A Hole'),
    );
  });

  it('agrees across a straight and a curly apostrophe', () => {
    expect(normalizeTitle("Assassin's Creed Odyssey")).toBe(normalizeTitle('Assassin’s Creed Odyssey'));
    expect(normalizeTitle("Marvel's Spider-Man")).toBe(normalizeTitle('Marvel’s Spider‑Man'));
  });

  it('folds accents and full-width digits through NFKD, so one game is one key', () => {
    expect(normalizeTitle('Ōkami HD')).toBe(normalizeTitle('Okami HD'));
    expect(normalizeTitle('Ｐｏｒｔａｌ ２')).toBe('portal2');
  });

  it('is case-insensitive and ignores spacing entirely', () => {
    expect(normalizeTitle('HELLDIVERS 2')).toBe(normalizeTitle('Helldivers  2'));
    expect(normalizeTitle(' Hades ')).toBe('hades');
  });

  it('gives an empty key to a title with nothing to match on', () => {
    expect(normalizeTitle('!!!')).toBe('');
    expect(normalizeTitle('')).toBe('');
  });
});

describe('indexCatalogByTitle', () => {
  it('groups rows whose titles normalize to the same key', () => {
    const index = indexCatalogByTitle([
      { media_item_id: 'a', title: 'Hades' },
      { media_item_id: 'b', title: 'HADES' },
      { media_item_id: 'c', title: 'Celeste' },
    ]);

    expect(index.get('hades')).toEqual(['a', 'b']);
    expect(index.get('celeste')).toEqual(['c']);
  });

  it('drops a row whose title normalizes to nothing rather than giving it the empty key', () => {
    const index = indexCatalogByTitle([
      { media_item_id: 'a', title: '???' },
      { media_item_id: 'b', title: '---' },
    ]);

    expect(index.size).toBe(0);
  });
});

const entry = (key: string, sourceRef: string, title = key): SourceKey => ({
  key,
  sourceRef,
  title,
});

describe('matchUnique', () => {
  const catalog = indexCatalogByTitle([
    { media_item_id: 'item-hades', title: 'Hades' },
    { media_item_id: 'item-celeste', title: 'Celeste' },
    { media_item_id: 'item-portal-a', title: 'Portal 2' },
    { media_item_id: 'item-portal-b', title: 'Portal  2!' },
  ]);

  it('matches a key that is unique on both sides, and carries the source ref', () => {
    const result = matchUnique([entry('hades', 'PRODUCT-1', 'Hades')], catalog);

    expect(result.matched).toEqual([{ media_item_id: 'item-hades', source_ref: 'PRODUCT-1' }]);
    expect(result.counts).toEqual({ ambiguousSource: 0, ambiguousCatalog: 0, unmatched: 0 });
  });

  it('refuses a key two catalog rows share, and names it', () => {
    const result = matchUnique([entry('portal2', 'PRODUCT-2', 'Portal 2')], catalog);

    expect(result.matched).toEqual([]);
    expect(result.counts.ambiguousCatalog).toBe(1);
    expect(result.examples.ambiguousCatalog).toEqual(['Portal 2']);
  });

  it('refuses a key two source entries share, counting both of them', () => {
    const result = matchUnique(
      [entry('hades', 'PRODUCT-3', 'Hades'), entry('hades', 'PRODUCT-4', 'HADES')],
      catalog,
    );

    expect(result.matched).toEqual([]);
    expect(result.counts.ambiguousSource).toBe(2);
    expect(result.examples.ambiguousSource).toEqual(['Hades']);
  });

  it('counts a key the catalog does not have at all as unmatched', () => {
    const result = matchUnique([entry('somegamewedonotmirror', 'PRODUCT-5', 'Some Game')], catalog);

    expect(result.matched).toEqual([]);
    expect(result.counts.unmatched).toBe(1);
    expect(result.examples.unmatched).toEqual(['Some Game']);
  });

  it('skips an empty key rather than matching everything titleless together', () => {
    const result = matchUnique([entry('', 'PRODUCT-6', '!!!')], catalog);

    expect(result.matched).toEqual([]);
    expect(result.counts).toEqual({ ambiguousSource: 0, ambiguousCatalog: 0, unmatched: 0 });
  });

  it('keeps the good matches in a batch that also has bad ones', () => {
    const result = matchUnique(
      [
        entry('hades', 'PRODUCT-7', 'Hades'),
        entry('celeste', 'PRODUCT-8', 'Celeste'),
        entry('portal2', 'PRODUCT-9', 'Portal 2'),
        entry('nothinghere', 'PRODUCT-10', 'Nothing Here'),
      ],
      catalog,
    );

    expect(result.matched.map((row) => row.media_item_id).sort()).toEqual([
      'item-celeste',
      'item-hades',
    ]);
    expect(result.counts).toEqual({ ambiguousSource: 0, ambiguousCatalog: 1, unmatched: 1 });
  });

  it('keeps at most a handful of examples, so a log line stays a log line', () => {
    const misses = Array.from({ length: 20 }, (_, n) => entry(`missing${n}`, `P${n}`, `Missing ${n}`));
    const result = matchUnique(misses, catalog);

    expect(result.counts.unmatched).toBe(20);
    expect(result.examples.unmatched).toHaveLength(5);
  });
});

describe('indexCatalogByKey', () => {
  it('groups exact keys, such as Steam app ids, without normalizing them', () => {
    const index = indexCatalogByKey([
      { media_item_id: 'a', key: '620' },
      { media_item_id: 'b', key: '620' },
      { media_item_id: 'c', key: '812140' },
    ]);

    expect(index.get('620')).toEqual(['a', 'b']);
    expect(index.get('812140')).toEqual(['c']);
  });
});
