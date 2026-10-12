/**
 * `links.ts` is pure string building, so this suite needs no stack and no
 * network: it asserts the exact URLs, because a typo in one is invisible in
 * review and shows up as a 404 under a user's thumb.
 *
 * The interesting half is `linkOuts` reading `external_ids`, which is jsonb
 * and therefore whatever anyone ever wrote into it. Every id gets the three
 * shapes it can arrive in - a number, the digits as a string, and garbage -
 * exactly as covers.test.ts does for the Steam app id.
 */

import { describe, expect, it } from 'vitest';
import { linkOut, linkOuts, type LinkOutSource } from '../src/links';

const EVERYTHING = {
  igdb: 1942,
  metacritic: 'the-witcher-3-wild-hunt',
  hltb: 10270,
  opencritic: 463,
  steam: 292030,
  gog: 'game/the_witcher_3_wild_hunt',
  epic: 'the-witcher-3-wild-hunt',
};

/** The URL for one source, from a blob holding only that id. */
function urlFor(source: LinkOutSource, value: unknown): string | undefined {
  return linkOuts({ externalIds: { [source]: value } as never })[0]?.url;
}

describe('linkOuts', () => {
  it('builds every documented URL from one game', () => {
    expect(linkOuts({ externalIds: EVERYTHING })).toEqual([
      {
        source: 'metacritic',
        label: 'Metacritic',
        url: 'https://www.metacritic.com/game/the-witcher-3-wild-hunt/',
      },
      { source: 'hltb', label: 'HowLongToBeat', url: 'https://howlongtobeat.com/game/10270' },
      { source: 'opencritic', label: 'OpenCritic', url: 'https://opencritic.com/game/463/-' },
      { source: 'steam', label: 'Steam', url: 'https://store.steampowered.com/app/292030/' },
      { source: 'gog', label: 'GOG', url: 'https://www.gog.com/game/the_witcher_3_wild_hunt' },
      {
        source: 'epic',
        label: 'Epic Games Store',
        url: 'https://store.epicgames.com/p/the-witcher-3-wild-hunt',
      },
    ]);
  });

  it('labels every link with its source, which rule 21 requires', () => {
    // A number - and the link that explains it - is never shown without
    // naming where it came from.
    for (const link of linkOuts({ externalIds: EVERYTHING })) {
      expect(link.label).not.toBe('');
      expect(link.label).not.toBe(link.source);
    }
    expect(linkOuts({ externalIds: EVERYTHING }).map((l) => l.label)).toEqual([
      'Metacritic',
      'HowLongToBeat',
      'OpenCritic',
      'Steam',
      'GOG',
      'Epic Games Store',
    ]);
  });

  it('shows the scores first and the stores after', () => {
    expect(linkOuts({ externalIds: EVERYTHING }).map((l) => l.source)).toEqual([
      'metacritic',
      'hltb',
      'opencritic',
      'steam',
      'gog',
      'epic',
    ]);
  });

  it('shows only the links the catalog has an id for', () => {
    expect(linkOuts({ externalIds: { igdb: 7346, hltb: 38019, opencritic: 1548 } })).toEqual([
      { source: 'hltb', label: 'HowLongToBeat', url: 'https://howlongtobeat.com/game/38019' },
      { source: 'opencritic', label: 'OpenCritic', url: 'https://opencritic.com/game/1548/-' },
    ]);
  });

  it('returns nothing for a game the cross-link pass has found nothing for', () => {
    expect(linkOuts({ externalIds: { igdb: 7346 } })).toEqual([]);
    expect(linkOuts({ externalIds: {} })).toEqual([]);
  });

  it('survives an external_ids blob that is not an object at all', () => {
    for (const externalIds of [null, 'igdb:7346', 42, true, [{ steam: 620 }]]) {
      expect(linkOuts({ externalIds })).toEqual([]);
    }
  });
});

describe('linkOuts: the shapes an id can arrive in', () => {
  describe('an integer identifier', () => {
    for (const source of ['hltb', 'opencritic', 'steam'] as const) {
      it(`takes ${source} as a number`, () => {
        expect(urlFor(source, 620)).toContain('620');
      });

      it(`takes ${source} written as digits, which an import might do`, () => {
        expect(urlFor(source, '620')).toBe(urlFor(source, 620));
      });

      it(`ignores a ${source} value that is not an id rather than building a 404`, () => {
        const bad = [
          'not-a-number',
          '',
          '   ',
          '620a',
          '-620',
          '6.20',
          0,
          -620,
          6.2,
          true,
          null,
          [620],
          { id: 620 },
          Number.MAX_VALUE,
          Number.NaN,
        ];
        for (const value of bad) expect(urlFor(source, value)).toBeUndefined();
      });
    }

    it('holds each range the property publishes', () => {
      // OpenCritic P2864 is ^[1-9]\d{0,4}$, HowLongToBeat P2816 is six digits,
      // Steam P1733 seven.
      expect(urlFor('opencritic', 99999)).toBeDefined();
      expect(urlFor('opencritic', 100000)).toBeUndefined();
      expect(urlFor('hltb', 999999)).toBeDefined();
      expect(urlFor('hltb', 1000000)).toBeUndefined();
      expect(urlFor('steam', 9999999)).toBeDefined();
      expect(urlFor('steam', 10000000)).toBeUndefined();
    });
  });

  describe('a slug identifier', () => {
    it('takes a Metacritic slug and refuses the numeric form', () => {
      expect(urlFor('metacritic', 'elden-ring')).toBe(
        'https://www.metacritic.com/game/elden-ring/',
      );
      // 1300xxxxxx is P12078, the numeric game id, which is a qualifier and
      // not what the formatter URL takes.
      expect(urlFor('metacritic', '1300012345')).toBeUndefined();
      expect(urlFor('metacritic', 1300012345)).toBeUndefined();
    });

    it('refuses a Metacritic value with an upper-case letter or a space', () => {
      expect(urlFor('metacritic', 'Elden-Ring')).toBeUndefined();
      expect(urlFor('metacritic', 'elden ring')).toBeUndefined();
    });

    it('keeps the prefix the GOG formatter needs and refuses a bare slug', () => {
      expect(urlFor('gog', 'game/cyberpunk_2077')).toBe('https://www.gog.com/game/cyberpunk_2077');
      expect(urlFor('gog', 'cyberpunk_2077')).toBeUndefined();
    });

    it('trims a slug that was stored with whitespace round it', () => {
      expect(urlFor('epic', '  fortnite  ')).toBe('https://store.epicgames.com/p/fortnite');
    });

    it('ignores a slug value that is not a slug rather than building a 404', () => {
      const bad = [
        '',
        '   ',
        'Fortnite',
        'fort nite',
        620,
        0,
        true,
        null,
        ['fortnite'],
        { slug: 'fortnite' },
      ];
      for (const value of bad) expect(urlFor('epic', value)).toBeUndefined();
    });

    it('rejects a hostile value in bounded time rather than hanging the screen', () => {
      // Wikidata's published P6278 rule is ambiguous and backtracks
      // catastrophically on the values it rejects (21 s for the first of
      // these, a real slug with a capitalised suffix); links.ts carries the
      // unambiguous equivalent instead. See the catalog's wikidata.test.ts for
      // the measurements.
      const hostile = [
        'the-witcher-3-wild-hunt-complete-edition-GOTY',
        'a'.repeat(32) + '!',
        'a'.repeat(64) + '!',
      ];

      const started = performance.now();
      for (const value of hostile) {
        expect(urlFor('epic', value)).toBeUndefined();
        expect(urlFor('metacritic', value)).toBeUndefined();
        expect(urlFor('gog', value)).toBeUndefined();
      }
      expect(performance.now() - started).toBeLessThan(50);
    });

    it('refuses a value longer than any identifier can be, before any pattern runs', () => {
      // 200 characters, an order of magnitude above the longest real slug.
      const tooLong = 'a'.repeat(201);
      expect(urlFor('epic', tooLong)).toBeUndefined();
      expect(urlFor('epic', 'a'.repeat(200))).toBe(
        `https://store.epicgames.com/p/${'a'.repeat(200)}`,
      );
      // Checked on the untrimmed value, so padding costs nothing either.
      expect(urlFor('epic', ' '.repeat(500) + 'fortnite' + ' '.repeat(500))).toBeUndefined();
    });

    it('refuses a slug carrying anything that would change the URL it lands in', () => {
      // The regexes confine a value to lower-case letters, digits, hyphens,
      // underscores and (for GOG) one slash, so a stored string cannot smuggle
      // a query, a fragment, a traversal or a scheme into the address.
      const hostile = [
        '../../evil',
        'elden-ring?x=1',
        'elden-ring#frag',
        'elden-ring/../../evil',
        'https://evil.example.com',
        'elden ring',
        'elden%2Fring',
        'elden\\ring',
      ];
      for (const value of hostile) {
        expect(urlFor('metacritic', value)).toBeUndefined();
        expect(urlFor('epic', value)).toBeUndefined();
        expect(urlFor('gog', value)).toBeUndefined();
      }
    });
  });
});

describe("linkOuts: Metacritic's licensed URL", () => {
  const licensed = 'https://www.metacritic.com/game/pc/the-witcher-3-wild-hunt';

  it("prefers Valve's URL over the Wikidata slug, because it names the platform", () => {
    // The Steam pass stores the URL Valve hands us beside the score it
    // licenses, so the number and the link point at the same page.
    expect(
      linkOut(
        { externalIds: { metacritic: 'the-witcher-3-wild-hunt' }, metadata: { metacritic_url: licensed } },
        'metacritic',
      ),
    ).toEqual({ source: 'metacritic', label: 'Metacritic', url: licensed });
  });

  it("uses Valve's URL even for a game with no Wikidata slug", () => {
    expect(linkOut({ externalIds: {}, metadata: { metacritic_url: licensed } }, 'metacritic')).toEqual(
      { source: 'metacritic', label: 'Metacritic', url: licensed },
    );
  });

  it('falls back to the slug when the metadata has no URL', () => {
    expect(
      linkOut({ externalIds: { metacritic: 'elden-ring' }, metadata: { game_type: 0 } }, 'metacritic')
        ?.url,
    ).toBe('https://www.metacritic.com/game/elden-ring/');
  });

  it('works for a read model that carries no metadata at all', () => {
    // GamePage selects external_ids and not metadata today.
    expect(linkOut({ externalIds: { metacritic: 'elden-ring' } }, 'metacritic')?.url).toBe(
      'https://www.metacritic.com/game/elden-ring/',
    );
  });

  it('refuses a stored URL that is not an http(s) metacritic.com address', () => {
    const bad = [
      'javascript:alert(1)',
      'https://evil.example.com/game/pc/x',
      'https://metacritic.com.evil.example.com/x',
      'www.metacritic.com/game/pc/x',
      'not a url',
      '',
      42,
      null,
      { url: licensed },
    ];

    for (const metacritic_url of bad) {
      expect(
        linkOut({ externalIds: { metacritic: 'elden-ring' }, metadata: { metacritic_url } as never }, 'metacritic')
          ?.url,
      ).toBe('https://www.metacritic.com/game/elden-ring/');
    }
  });

  it('takes the bare host as well as www', () => {
    const bare = 'https://metacritic.com/game/pc/x';
    expect(linkOut({ externalIds: {}, metadata: { metacritic_url: bare } }, 'metacritic')?.url).toBe(
      bare,
    );
  });

  it('survives a metadata blob that is not an object', () => {
    for (const metadata of [null, 'metacritic', 42, true, [{ metacritic_url: licensed }]]) {
      expect(linkOut({ externalIds: { metacritic: 'elden-ring' }, metadata }, 'metacritic')?.url).toBe(
        'https://www.metacritic.com/game/elden-ring/',
      );
    }
  });
});

/**
 * `tier_list` and `popular_games` are RPCs, so their rows arrive spelled the
 * way Postgres named the columns. Both spellings reach the same fields;
 * nothing else about the function changes. Same contract as `coverCandidates`.
 */
describe('linkOuts: given a row straight off an RPC rather than a read model', () => {
  it('reads external_ids', () => {
    expect(linkOuts({ external_ids: { hltb: 38019 } })).toEqual([
      { source: 'hltb', label: 'HowLongToBeat', url: 'https://howlongtobeat.com/game/38019' },
    ]);
  });

  it('reads metadata the same way', () => {
    const licensed = 'https://www.metacritic.com/game/pc/elden-ring';
    expect(
      linkOut({ external_ids: { metacritic: 'elden-ring' }, metadata: { metacritic_url: licensed } }, 'metacritic')
        ?.url,
    ).toBe(licensed);
  });

  it('handles a blob that is not an object, the same way', () => {
    expect(linkOuts({ external_ids: null })).toEqual([]);
    expect(linkOuts({ external_ids: {}, metadata: null })).toEqual([]);
  });

  it('agrees with the read-model spelling link for link', () => {
    expect(linkOuts({ external_ids: EVERYTHING })).toEqual(linkOuts({ externalIds: EVERYTHING }));
  });
});

describe('linkOut', () => {
  it('picks one source out of the list', () => {
    expect(linkOut({ externalIds: EVERYTHING }, 'steam')?.url).toBe(
      'https://store.steampowered.com/app/292030/',
    );
  });

  it('is null when the game has no id for that source', () => {
    expect(linkOut({ externalIds: { igdb: 7346 } }, 'steam')).toBeNull();
  });
});
