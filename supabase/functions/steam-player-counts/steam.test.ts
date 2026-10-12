/**
 * `steam.ts` against fixtures. Run with:
 *
 *   deno test supabase/functions/steam-player-counts
 *
 * No permissions and no network: the fixtures are imported as JSON modules and
 * every test passes its own `fetchImpl`, so nothing here can reach Valve even
 * by accident. `sleep` is stubbed too, so the retry tests cost no wall clock.
 *
 * The fixtures are the two answers that matter. `current-players.json` is the
 * ordinary one. `current-players-unknown.json` is what an app id Valve has no
 * figure for comes back as: HTTP 200, `result` other than 1, and no
 * `player_count` -- which is why "no figure" cannot be modelled as an error or
 * as zero.
 */

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import currentPlayersFixture from './fixtures/current-players.json' with { type: 'json' };
import unknownAppFixture from './fixtures/current-players-unknown.json' with { type: 'json' };
import { currentPlayers, fetchPlayerCounts, MAX_ATTEMPTS } from './steam.ts';

/** A `fetch` that answers from a queue and records the URLs it was given. */
function stubFetch(answers: (Response | (() => Response))[]) {
  const urls: string[] = [];
  let index = 0;
  const fetchImpl = ((input: string | URL | Request) => {
    urls.push(typeof input === 'string' ? input : input.toString());
    const answer = answers[Math.min(index, answers.length - 1)]!;
    index += 1;
    return Promise.resolve(typeof answer === 'function' ? answer() : answer);
  }) as unknown as typeof fetch;
  return { fetchImpl, urls, get calls() { return index; } };
}

function jsonResponse(body: unknown, status = 200): () => Response {
  return () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Records the backoffs instead of waiting them out. */
function stubSleep() {
  const waits: number[] = [];
  return {
    waits,
    sleep: (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
}

Deno.test('reads the player count out of Valve answer', async () => {
  const fetcher = stubFetch([jsonResponse(currentPlayersFixture)]);

  const players = await currentPlayers(1245620, { fetchImpl: fetcher.fetchImpl });

  assertEquals(players, 28455);
  assertEquals(fetcher.calls, 1);
  assertStringIncludes(fetcher.urls[0]!, 'ISteamUserStats/GetNumberOfCurrentPlayers/v1');
  assertStringIncludes(fetcher.urls[0]!, 'appid=1245620');
});

Deno.test('one app id per call, and no key in the URL', async () => {
  const fetcher = stubFetch([jsonResponse(currentPlayersFixture)]);

  await currentPlayers(570, { fetchImpl: fetcher.fetchImpl });

  const url = new URL(fetcher.urls[0]!);
  assertEquals(url.searchParams.getAll('appid'), ['570']);
  assertEquals(url.searchParams.get('key'), null);
});

Deno.test('an app Valve has no figure for is null, not zero', async () => {
  const fetcher = stubFetch([jsonResponse(unknownAppFixture)]);

  assertEquals(await currentPlayers(9_999_999, { fetchImpl: fetcher.fetchImpl }), null);
});

Deno.test('zero players is a real answer', async () => {
  const fetcher = stubFetch([jsonResponse({ response: { player_count: 0, result: 1 } })]);

  assertEquals(await currentPlayers(12345, { fetchImpl: fetcher.fetchImpl }), 0);
});

Deno.test('a fractional or negative figure is clamped to a whole count', async () => {
  const fractional = stubFetch([jsonResponse({ response: { player_count: 41.6, result: 1 } })]);
  const negative = stubFetch([jsonResponse({ response: { player_count: -3, result: 1 } })]);

  assertEquals(await currentPlayers(1, { fetchImpl: fractional.fetchImpl }), 42);
  assertEquals(await currentPlayers(2, { fetchImpl: negative.fetchImpl }), 0);
});

Deno.test('retries a 429 with doubling backoff, then succeeds', async () => {
  const fetcher = stubFetch([
    jsonResponse({}, 429),
    jsonResponse(currentPlayersFixture),
  ]);
  const clock = stubSleep();

  const players = await currentPlayers(1245620, {
    fetchImpl: fetcher.fetchImpl,
    sleep: clock.sleep,
    backoffMs: 500,
  });

  assertEquals(players, 28455);
  assertEquals(fetcher.calls, 2);
  assertEquals(clock.waits, [500]);
});

Deno.test('gives up after the attempt limit, and the backoffs double', async () => {
  const fetcher = stubFetch([jsonResponse({}, 429)]);
  const clock = stubSleep();

  const [result] = await fetchPlayerCounts([1245620], {
    fetchImpl: fetcher.fetchImpl,
    sleep: clock.sleep,
    backoffMs: 500,
  });

  assertEquals(fetcher.calls, MAX_ATTEMPTS);
  assertEquals(clock.waits, [500, 1000]);
  assertEquals(result!.players, null);
  assertStringIncludes(result!.error!, '429');
});

Deno.test('does not retry a refusal that will not change', async () => {
  const fetcher = stubFetch([jsonResponse({}, 400)]);
  const clock = stubSleep();

  const [result] = await fetchPlayerCounts([1245620], {
    fetchImpl: fetcher.fetchImpl,
    sleep: clock.sleep,
  });

  assertEquals(fetcher.calls, 1);
  assertEquals(clock.waits, []);
  assertStringIncludes(result!.error!, '400');
});

Deno.test('a dropped connection is retried like a 5xx', async () => {
  let call = 0;
  const fetchImpl = (() => {
    call += 1;
    if (call === 1) return Promise.reject(new TypeError('connection closed'));
    return Promise.resolve(
      new Response(JSON.stringify(currentPlayersFixture), { status: 200 }),
    );
  }) as unknown as typeof fetch;
  const clock = stubSleep();

  assertEquals(await currentPlayers(570, { fetchImpl, sleep: clock.sleep }), 28455);
  assertEquals(call, 2);
});

Deno.test('results come back in the order the app ids were given', async () => {
  const byAppId = new Map([
    [10, 111],
    [20, 222],
    [30, 333],
    [40, 444],
    [50, 555],
  ]);
  const fetchImpl = ((input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const appId = Number(url.searchParams.get('appid'));
    return Promise.resolve(
      new Response(
        JSON.stringify({ response: { player_count: byAppId.get(appId), result: 1 } }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  const results = await fetchPlayerCounts([...byAppId.keys()], { fetchImpl, concurrency: 2 });

  assertEquals(results.map((result) => result.appId), [10, 20, 30, 40, 50]);
  assertEquals(results.map((result) => result.players), [111, 222, 333, 444, 555]);
});

Deno.test('never more calls in flight than the concurrency allows', async () => {
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = (async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight -= 1;
    return new Response(JSON.stringify(currentPlayersFixture), { status: 200 });
  }) as unknown as typeof fetch;

  const results = await fetchPlayerCounts([1, 2, 3, 4, 5, 6, 7, 8], {
    fetchImpl,
    concurrency: 3,
  });

  assertEquals(results.length, 8);
  assertEquals(peak <= 3, true, `peak concurrency was ${peak}`);
});

Deno.test('one app failing does not cost the run the others', async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.searchParams.get('appid') === '20') {
      return Promise.resolve(new Response('nope', { status: 403 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(currentPlayersFixture), { status: 200 }),
    );
  }) as unknown as typeof fetch;

  const results = await fetchPlayerCounts([10, 20, 30], {
    fetchImpl,
    sleep: stubSleep().sleep,
  });

  assertEquals(results.map((result) => result.players), [28455, null, 28455]);
  assertStringIncludes(results[1]!.error!, '403');
});
