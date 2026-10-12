import { describe, expect, it } from 'vitest';
import { dedupeCrossLinks } from '../src/db';
import { mapCrossLinks } from '../src/map';
import type { Clock } from '../src/rate-limit';
import type { CrossLinkRow, SparqlResults } from '../src/types';
import {
  crossLinkQuery,
  retryAfterMs,
  WikidataBudgetExhaustedError,
  WikidataClient,
  WikidataError,
  WikidataRateLimitedError,
  CROSS_LINK_PROPERTIES,
  CROSS_LINK_PROPERTY_BY_KEY,
  MAX_IDENTIFIER_LENGTH,
  WIKIDATA_BACKOFF_MS,
  WIKIDATA_CHUNK_SIZE,
  WIKIDATA_INTERVAL_MS,
  WIKIDATA_SPARQL_URL,
  WIKIDATA_USER_AGENT,
  type CrossLinkKey,
} from '../src/wikidata';
import results from './fixtures/wikidata-cross-links.json';

class TestClock implements Clock {
  time = 0;
  sleeps: number[] = [];
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.time += ms;
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/sparql-results+json', ...headers },
  });
}

/** A fetch stand-in that records requests and replays queued responses. */
function fakeFetch(responses: Array<() => Response>) {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  let index = 0;

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    inits.push(init ?? {});
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next!();
  }) as unknown as typeof fetch;

  return {
    impl,
    urls,
    inits,
    get count() {
      return index;
    },
  };
}

const ok = () => json(results);

function client(
  impl: typeof fetch,
  clock: Clock,
  options: { budget?: number; maxAttempts?: number } = {},
): WikidataClient {
  return new WikidataClient({ clock, fetchImpl: impl, ...options });
}

/** One binding row, spelled the way the Query Service spells one. */
function binding(values: Record<string, string>): Record<string, { value: string }> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v }]));
}

function sparql(rows: Array<Record<string, string>>): SparqlResults {
  return { results: { bindings: rows.map(binding) } };
}

/** The de-duplicated answer for one IGDB id, which is what the write acts on. */
function answerFor(igdbId: number, document: SparqlResults = results as SparqlResults): CrossLinkRow {
  const row = dedupeCrossLinks(mapCrossLinks(document)).find((r) => r.igdb_id === igdbId);
  if (!row) throw new Error(`no answer for IGDB ${igdbId}`);
  return row;
}

/**
 * The property table is the thing a reviewer most needs pinned: every number,
 * regex and URL in it was read off wikidata.org on 2026-09-16, and a silent
 * edit to any of them is a wrong link on a game page or a wrong id sent to a
 * paid API.
 */
describe('CROSS_LINK_PROPERTIES', () => {
  const expected: Array<[CrossLinkKey, string, 'integer' | 'slug', string]> = [
    ['opencritic', 'P2864', 'integer', 'https://opencritic.com/game/$1/-'],
    ['metacritic', 'P12054', 'slug', 'https://www.metacritic.com/game/$1/'],
    ['hltb', 'P2816', 'integer', 'https://howlongtobeat.com/game/$1'],
    ['steam', 'P1733', 'integer', 'https://store.steampowered.com/app/$1/'],
    ['gog', 'P2725', 'slug', 'https://www.gog.com/$1'],
    ['epic', 'P6278', 'slug', 'https://store.epicgames.com/p/$1'],
  ];

  it('holds the property, kind and formatter URL read off wikidata.org', () => {
    expect(
      CROSS_LINK_PROPERTIES.map((p) => [p.key, p.property, p.kind, p.formatter]),
    ).toEqual(expected);
  });

  it('cites the property page every row was read from', () => {
    for (const property of CROSS_LINK_PROPERTIES) {
      expect(property.source).toBe(`https://www.wikidata.org/wiki/Property:${property.property}`);
    }
  });

  it('does not use P1712, the older cross-medium Metacritic property', () => {
    // 38 of the 147,617 IGDB-linked Wikidata items carry P1712, against 16,778
    // for P12054, and P1712's own regex now demands the
    // `game/<slug>/critic-reviews/?platform=<platform>` form. Measured
    // 2026-09-16.
    expect(CROSS_LINK_PROPERTIES.map((p) => p.property)).not.toContain('P1712');
  });

  it('leaves the PlayStation Store and the Nintendo eShop out', () => {
    // P5944/P5971 are two region-locked properties rather than one, and P8084
    // carries a required-qualifier constraint on platform instead of a
    // single-value one, so one game is meant to have one value per console.
    const properties = CROSS_LINK_PROPERTIES.map((p) => p.property);
    expect(properties).not.toContain('P5944');
    expect(properties).not.toContain('P5971');
    expect(properties).not.toContain('P8084');
    expect(CROSS_LINK_PROPERTIES.map((p) => p.key)).not.toContain('psn');
    expect(CROSS_LINK_PROPERTIES.map((p) => p.key)).not.toContain('eshop');
  });

  it('is reachable by key', () => {
    for (const property of CROSS_LINK_PROPERTIES) {
      expect(CROSS_LINK_PROPERTY_BY_KEY.get(property.key)).toBe(property);
    }
  });

  describe('the published value regexes', () => {
    const accepts = (key: CrossLinkKey, value: string) =>
      CROSS_LINK_PROPERTY_BY_KEY.get(key)!.pattern.test(value);

    it('takes the real values in the capture', () => {
      expect(accepts('opencritic', '12090')).toBe(true);
      expect(accepts('metacritic', 'the-legend-of-zelda-breath-of-the-wild')).toBe(true);
      expect(accepts('hltb', '68151')).toBe(true);
      expect(accepts('steam', '1245620')).toBe(true);
      expect(accepts('gog', 'game/the_witcher_3_wild_hunt')).toBe(true);
      expect(accepts('epic', 'grand-theft-auto-v')).toBe(true);
    });

    it('rejects the numeric Metacritic form, which is a different property', () => {
      // P12078 ("Metacritic numeric game ID") is a qualifier on P12054 and is
      // not what the formatter URL takes; P12054's own regex excludes it.
      expect(accepts('metacritic', '1300012345')).toBe(false);
      expect(accepts('metacritic', 'Elden-Ring')).toBe(false);
      expect(accepts('metacritic', 'elden ring')).toBe(false);
    });

    it('anchors the Steam app id, which Wikidata publishes unanchored', () => {
      expect(accepts('steam', '620')).toBe(true);
      expect(accepts('steam', '620a')).toBe(false);
      expect(accepts('steam', ' 620')).toBe(false);
      expect(accepts('steam', '0')).toBe(false);
      expect(accepts('steam', '12345678')).toBe(false);
    });

    it('keeps the GOG prefix the formatter URL needs', () => {
      expect(accepts('gog', 'the_witcher_3_wild_hunt')).toBe(false);
      expect(accepts('gog', 'movie/double_fine_adventure')).toBe(true);
    });

    it('holds the OpenCritic and HowLongToBeat ranges', () => {
      expect(accepts('opencritic', '99999')).toBe(true);
      expect(accepts('opencritic', '100000')).toBe(false);
      expect(accepts('opencritic', '0')).toBe(false);
      expect(accepts('hltb', '999999')).toBe(true);
      expect(accepts('hltb', '1000000')).toBe(false);
    });

    it('refuses an upper-case or underscored Epic slug', () => {
      expect(accepts('epic', 'Fortnite')).toBe(false);
      expect(accepts('epic', 'fortnite')).toBe(true);
    });

    it('takes the Epic separators the published rule allows', () => {
      // The published P1793 is `^[a-z\d]+([\-]{0,3}[\_]?[^\sA-Z\W\_]+)*$`. The
      // pattern here accepts the same language with the separator made
      // mandatory, which is what removes its ambiguity; these are the shapes
      // that have to keep working.
      for (const value of [
        'fortnite',
        'alan-wake-2',
        'the-witcher-3-wild-hunt',
        'redout--enhanced',
        'redout---enhanced',
        'redout-_enhanced',
        'redout_enhanced',
        'a1',
      ]) {
        expect(accepts('epic', value)).toBe(true);
      }
      for (const value of ['-fortnite', '_fortnite', 'fortnite-', 'fortnite----x', '']) {
        expect(accepts('epic', value)).toBe(false);
      }
    });
  });

  /**
   * Every pattern here is a copy of a rule a wiki publishes, judging values
   * that come from that same wiki, inside a job that runs unattended at one in
   * the morning. A pattern that is merely correct is not enough: it has to
   * answer in bounded time on the values it *rejects*, which is the case a
   * regex is slow in.
   *
   * Wikidata's own P6278 rule fails that test. `(-{0,3}_?[a-z\d]+)*` has two
   * quantifiers that can match empty before the character class, so it
   * degenerates to `([a-z\d]+)*` and has to try every way of cutting a run of
   * letters into pieces before it can say no: measured 6.9 ms at twenty
   * characters, roughly doubling per character after that, 21 s for
   * `the-witcher-3-wild-hunt-complete-edition-GOTY`. That is not an exotic
   * input - it is a real slug with a capitalised suffix. One of those in a
   * chunk hangs the mapper past the workflow's 30-minute timeout, the chunk is
   * never stamped, and the selection order hands the same rows back as chunk
   * one every following night.
   */
  describe('cost on the values they reject', () => {
    const hostile = [
      'the-witcher-3-wild-hunt-complete-edition-GOTY',
      'a'.repeat(32) + '!',
      'a'.repeat(64) + '!',
      '-'.repeat(40) + 'A',
      'game/' + 'a_'.repeat(40) + 'A',
      'a'.repeat(MAX_IDENTIFIER_LENGTH) + '!',
    ];

    it('rejects every hostile value, through the mapper, well inside a frame', () => {
      const document: SparqlResults = {
        results: {
          bindings: hostile.map((value, index) =>
            binding({
              igdb: String(index + 1),
              metacritic: value,
              gog: value,
              epic: value,
              hltb: value,
              steam: value,
              opencritic: value,
            }),
          ),
        },
      };

      const started = performance.now();
      const rows = mapCrossLinks(document);
      const elapsed = performance.now() - started;

      // Nothing hostile survives, and saying so costs nothing. The published
      // P6278 rule needs about 21 seconds for the first of these alone.
      expect(rows).toEqual([]);
      expect(elapsed).toBeLessThan(50);
    });

    it('checks length before pattern, so a very long value is cheap whatever the regex does', () => {
      const tooLong = 'a'.repeat(MAX_IDENTIFIER_LENGTH + 1);

      expect(MAX_IDENTIFIER_LENGTH).toBe(200);
      // Well-formed under every slug rule; refused on length alone.
      expect(CROSS_LINK_PROPERTY_BY_KEY.get('epic')!.pattern.test(tooLong)).toBe(true);
      expect(mapCrossLinks(sparql([{ igdb: '1', epic: tooLong }]))).toEqual([]);
    });

    it('still takes the longest value in the live capture', () => {
      // 38 characters, an order of magnitude inside the cap.
      expect(answerFor(7346).metacritic).toBe('the-legend-of-zelda-breath-of-the-wild');
    });
  });
});

describe('crossLinkQuery', () => {
  const query = crossLinkQuery([1020, 119133]);

  it('reaches the IGDB number through the P9043 qualifier on a P5794 statement', () => {
    // P5794's own value is the IGDB *slug*; the number our catalog keys on is
    // the P9043 qualifier hanging off that statement. A `wdt:P5794` shortcut
    // would compare our integers against slugs and match nothing.
    expect(query).toContain('?item p:P5794 ?statement .');
    expect(query).toContain('?statement pq:P9043 ?igdb .');
    expect(query).not.toContain('wdt:P5794');
  });

  it('reads every identifier off wdt:, which skips deprecated statements', () => {
    for (const property of CROSS_LINK_PROPERTIES) {
      expect(query).toContain(`OPTIONAL { ?item wdt:${property.property} ?${property.key} . }`);
    }
  });

  it('makes every identifier OPTIONAL, so one missing id hides none of the others', () => {
    // Only the two IGDB triples are required. A game Wikidata knows nothing
    // but a Steam id for still comes back.
    const required = query
      .split('\n')
      .filter((line) => line.trim().startsWith('?') && !line.includes('OPTIONAL'));
    expect(required).toHaveLength(2);
  });

  it('binds the ids as string literals, because every property is an external id', () => {
    expect(query).toContain('VALUES ?igdb { "1020" "119133" }');
  });

  it('asks for nothing but the columns it maps', () => {
    expect(query.startsWith('SELECT ?igdb ?opencritic ?metacritic ?hltb ?steam ?gog ?epic WHERE {'))
      .toBe(true);
  });

  it('is built from the property table, so a new identifier is one row and no edit here', () => {
    for (const property of CROSS_LINK_PROPERTIES) {
      expect(query).toContain(`?${property.key}`);
    }
  });
});

describe('mapCrossLinks', () => {
  it('maps a live capture of the endpoint, column by column', () => {
    // The fixture is a real response captured on 2026-09-16 for eight IGDB
    // ids, one of which (999999999) Wikidata has never heard of.
    const rows = mapCrossLinks(results as SparqlResults);

    expect(rows[0]).toEqual({
      igdb_id: 1020,
      opencritic: 163,
      metacritic: 'grand-theft-auto-v',
      hltb: 4064,
      steam: 271590,
      epic: 'grand-theft-auto-v',
    });
  });

  it('keeps integer identifiers as numbers and slugs as strings', () => {
    const elden = answerFor(119133);

    expect(elden).toEqual({
      igdb_id: 119133,
      opencritic: 12090,
      metacritic: 'elden-ring',
      hltb: 68151,
      steam: 1245620,
    });
    expect(typeof elden.hltb).toBe('number');
    expect(typeof elden.metacritic).toBe('string');
  });

  it('leaves out a column the game has no value for rather than writing null', () => {
    // Breath of the Wild is not on Steam, GOG or Epic.
    expect(answerFor(7346)).toEqual({
      igdb_id: 7346,
      opencritic: 1548,
      metacritic: 'the-legend-of-zelda-breath-of-the-wild',
      hltb: 38019,
    });
  });

  it('returns a game Wikidata knows no OpenCritic id for, with everything else', () => {
    // Skyrim: the pass is no longer about OpenCritic, so this row is useful.
    expect(answerFor(472)).toEqual({
      igdb_id: 472,
      metacritic: 'the-elder-scrolls-v-skyrim',
      hltb: 9859,
      steam: 72850,
    });
  });

  it('drops an id Wikidata has no answer for rather than inventing one', () => {
    const igdbIds = mapCrossLinks(results as SparqlResults).map((row) => row.igdb_id);
    expect(igdbIds).not.toContain(999999999);
  });

  it('skips a row whose igdb variable did not bind', () => {
    // The Query Service omits an unbound variable instead of sending null.
    expect(mapCrossLinks(sparql([{ metacritic: 'elden-ring' }]))).toEqual([]);
  });

  it('yields nothing for a row where every identifier failed its regex', () => {
    expect(mapCrossLinks(sparql([{ igdb: '1', steam: 'not-an-app-id' }]))).toEqual([]);
  });

  it('rejects per column, keeping the good identifiers on a row with a bad one', () => {
    expect(
      mapCrossLinks(sparql([{ igdb: '1', steam: '620a', metacritic: 'half-life-2' }])),
    ).toEqual([{ igdb_id: 1, metacritic: 'half-life-2' }]);
  });

  it('refuses an IGDB id that is not a positive whole number', () => {
    expect(
      mapCrossLinks(
        sparql([
          { igdb: 'elden-ring', hltb: '68151' },
          { igdb: '0', hltb: '68151' },
          { igdb: '-1', hltb: '68151' },
          { igdb: '1.5', hltb: '68151' },
        ]),
      ),
    ).toEqual([]);
  });

  it('applies each property\'s own published regex, not one shared rule', () => {
    expect(
      mapCrossLinks(
        sparql([
          {
            igdb: '1',
            // In range for HowLongToBeat (6 digits), out of range for
            // OpenCritic (5).
            hltb: '123456',
            opencritic: '123456',
          },
        ]),
      ),
    ).toEqual([{ igdb_id: 1, hltb: 123456 }]);
  });

  it('copes with a document that has no bindings at all', () => {
    expect(mapCrossLinks({})).toEqual([]);
    expect(mapCrossLinks({ results: {} })).toEqual([]);
  });
});

describe('dedupeCrossLinks', () => {
  it('merges a game whose two Wikidata items each bound different columns', () => {
    // Fortnite (IGDB 1905) is two items in the capture: one carrying the
    // Metacritic slug and the Epic id, one carrying only a HowLongToBeat id.
    expect(answerFor(1905)).toEqual({
      igdb_id: 1905,
      opencritic: 6228,
      metacritic: 'fortnite',
      hltb: 3657,
      epic: 'fortnite',
    });
  });

  it('keeps the smallest integer id when the capture disagrees', () => {
    // Redout (IGDB 13197) came back as eight rows holding OpenCritic 1801 and
    // 4809.
    expect(answerFor(13197).opencritic).toBe(1801);
  });

  it('keeps the shorter slug, which is the base game rather than an edition', () => {
    const redout = answerFor(13197);
    // `redout` against `redout-2016`, `redout-enhanced-edition` against
    // `redout-solar-challenge-edition`.
    expect(redout.metacritic).toBe('redout');
    expect(redout.epic).toBe('redout-enhanced-edition');

    // The Witcher 3 (IGDB 1942): the base game's GOG id against its expansion
    // pass's.
    expect(answerFor(1942).gog).toBe('game/the_witcher_3_wild_hunt');
  });

  it('does not depend on the order the endpoint listed the rows in', () => {
    const rows = mapCrossLinks(results as SparqlResults);
    const forwards = dedupeCrossLinks(rows);
    const backwards = dedupeCrossLinks([...rows].reverse());

    for (const row of forwards) {
      expect(backwards.find((r) => r.igdb_id === row.igdb_id)).toEqual(row);
    }
  });

  it('breaks a tie between equal-length slugs by code-unit order', () => {
    expect(
      dedupeCrossLinks([
        { igdb_id: 1, metacritic: 'bbbb' },
        { igdb_id: 1, metacritic: 'aaaa' },
      ]),
    ).toEqual([{ igdb_id: 1, metacritic: 'aaaa' }]);
  });

  it('leaves a game with one row exactly as it found it', () => {
    expect(dedupeCrossLinks([{ igdb_id: 7, steam: 620 }])).toEqual([{ igdb_id: 7, steam: 620 }]);
    expect(dedupeCrossLinks([])).toEqual([]);
  });
});

describe('retryAfterMs', () => {
  it('reads delta-seconds', () => {
    expect(retryAfterMs('30', 0)).toBe(30_000);
    expect(retryAfterMs(' 5 ', 0)).toBe(5000);
  });

  it('reads an HTTP date as a wait from now', () => {
    const now = Date.parse('2026-09-16T13:00:00Z');
    expect(retryAfterMs('Wed, 16 Sep 2026 13:00:30 GMT', now)).toBe(30_000);
  });

  it('never asks for a wait in the past', () => {
    const now = Date.parse('2026-09-16T13:00:00Z');
    expect(retryAfterMs('Wed, 16 Sep 2026 12:59:00 GMT', now)).toBe(0);
  });

  it('gives up on an absent or unreadable header, so the caller uses its own backoff', () => {
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs('soon', 0)).toBeNull();
  });
});

describe('WikidataClient', () => {
  it('POSTs a form-encoded query, so the VALUES block has no URL limit to fit', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([ok]);

    await client(fetcher.impl, clock).crossLinks([1020]);

    expect(fetcher.urls).toEqual([WIKIDATA_SPARQL_URL]);
    expect(fetcher.inits[0]!.method).toBe('POST');
    const body = new URLSearchParams(fetcher.inits[0]!.body as string);
    expect(body.get('query')).toContain('VALUES ?igdb { "1020" }');
  });

  it('sends the User-Agent Wikimedia policy requires, naming the project and a contact', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([ok]);

    await client(fetcher.impl, clock).crossLinks([1020]);

    const headers = new Headers(fetcher.inits[0]!.headers);
    expect(headers.get('user-agent')).toBe(WIKIDATA_USER_AGENT);
    expect(WIKIDATA_USER_AGENT).toContain('github.com/rafael-sanchezf/verso');
    expect(headers.get('accept')).toBe('application/sparql-results+json');
  });

  it('keeps consecutive queries an interval apart', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([ok]);
    const wikidata = client(fetcher.impl, clock);

    await wikidata.crossLinks([1]);
    await wikidata.crossLinks([2]);

    expect(clock.sleeps).toEqual([WIKIDATA_INTERVAL_MS]);
  });

  it('retries a 429 and obeys Retry-After when it asks for longer than our backoff', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([
      () => json({}, 429, { 'retry-after': '45' }),
      () => json(results),
    ]);

    const wikidata = client(fetcher.impl, clock);
    await wikidata.crossLinks([1020]);

    expect(clock.sleeps).toEqual([45_000]);
    expect(wikidata.retryCount).toBe(1);
  });

  it('falls back to its own backoff when a 429 carries no Retry-After', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 429), () => json(results)]);

    await client(fetcher.impl, clock).crossLinks([1020]);

    expect(clock.sleeps).toEqual([WIKIDATA_BACKOFF_MS]);
  });

  it('makes a refusal cost the run its pace, not just the refused query', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([
      () => json({}, 429, { 'retry-after': '20' }),
      () => json(results),
      () => json(results),
    ]);
    const wikidata = client(fetcher.impl, clock);

    await wikidata.crossLinks([1]);
    // `pause` moved the limiter's next allowed start to the end of the
    // Retry-After, so the retry waited the full twenty seconds rather than
    // the five-second interval.
    expect(clock.time).toBe(20_000);

    await wikidata.crossLinks([2]);
    // And the query after it still waited the plain interval on top.
    expect(clock.time).toBe(20_000 + WIKIDATA_INTERVAL_MS);
  });

  it('gives up on a 429 after its attempts and ends the run', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 429)]);

    await expect(client(fetcher.impl, clock, { maxAttempts: 2 }).crossLinks([1])).rejects.toThrow(
      WikidataRateLimitedError,
    );
    expect(fetcher.count).toBe(2);
  });

  it('retries a 502, which the service really does answer transiently', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 502), () => json(results)]);
    const wikidata = client(fetcher.impl, clock);

    await wikidata.crossLinks([1020]);

    expect(wikidata.retryCount).toBe(1);
    expect(fetcher.count).toBe(2);
  });

  it('does not retry a 400, which is our query being wrong', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => json({}, 400)]);

    await expect(client(fetcher.impl, clock).crossLinks([1])).rejects.toThrow(WikidataError);
    expect(fetcher.count).toBe(1);
  });

  it('counts every attempt against the budget and stops when it is spent', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([ok]);
    const wikidata = client(fetcher.impl, clock, { budget: 2 });

    await wikidata.crossLinks([1]);
    await wikidata.crossLinks([2]);

    expect(wikidata.exhausted).toBe(true);
    await expect(wikidata.crossLinks([3])).rejects.toThrow(WikidataBudgetExhaustedError);
    expect(fetcher.count).toBe(2);
  });

  it('treats a 200 that is not JSON as one query lost, not a crash with a stack', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([() => new Response('<html>oops</html>', { status: 200 })]);

    await expect(client(fetcher.impl, clock).crossLinks([1])).rejects.toThrow(/unparseable JSON/);
  });

  it('chunks at 500, the same batch size the database writes use', () => {
    expect(WIKIDATA_CHUNK_SIZE).toBe(500);
  });

  it('gives every query a client-side deadline of its own', async () => {
    const clock = new TestClock();
    const fetcher = fakeFetch([ok]);

    await client(fetcher.impl, clock).crossLinks([1020]);

    // The Query Service's 60-second limit is server-side and protects the
    // service from our query; this one protects the run from a socket that
    // never answers at all.
    expect(fetcher.inits[0]!.signal).toBeInstanceOf(AbortSignal);
  });
});
