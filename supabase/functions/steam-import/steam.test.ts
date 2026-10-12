/**
 * `steam.ts` against fixtures. Run with:
 *
 *   deno test supabase/functions/steam-import
 *
 * No permissions and no network: the fixtures are imported as JSON modules and
 * every test passes its own `fetchImpl`, so nothing here can reach Valve even
 * by accident. `sleep` is stubbed too, so the retry tests cost no wall clock.
 * The "key" is a made-up string; it exists so the tests can assert it goes
 * exactly one place and appears in no error message.
 *
 * The fixtures are the four answers that matter:
 *
 *   owned-games.json          an ordinary library, including a game with zero
 *                             playtime, one with no rtime_last_played, and one
 *                             the catalog will not resolve.
 *   owned-games-private.json  `{"response":{}}` -- Game details not Public.
 *   owned-games-empty.json    an account that genuinely owns nothing, which is
 *                             a game_count of 0 and is NOT the private case.
 *   recently-played.json      the last two weeks, with a fresher total for a
 *                             game in the library and one game that is not in
 *                             it at all.
 */

import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertStringIncludes,
} from 'jsr:@std/assert@1';
import ownedFixture from './fixtures/owned-games.json' with { type: 'json' };
import privateFixture from './fixtures/owned-games-private.json' with { type: 'json' };
import emptyFixture from './fixtures/owned-games-empty.json' with { type: 'json' };
import recentFixture from './fixtures/recently-played.json' with { type: 'json' };
import {
  fetchOwnedGames,
  fetchRecentlyPlayed,
  isPrivateProfile,
  looksLikePlaytimeHidden,
  mergeLibrary,
  MAX_ATTEMPTS,
  OWNED_GAMES_URL,
  SteamApiError,
  type OwnedGame,
} from './steam.ts';

const KEY = 'AAAA1111BBBB2222CCCC3333DDDD4444';
const STEAM_ID = '76561198000000001';

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
  return { waits, sleep: (ms: number) => { waits.push(ms); return Promise.resolve(); } };
}

Deno.test('GetOwnedGames asks for the names and the free games it has played', async () => {
  const fetcher = stubFetch([jsonResponse(ownedFixture)]);

  const result = await fetchOwnedGames(KEY, STEAM_ID, { fetchImpl: fetcher.fetchImpl });

  const url = new URL(fetcher.urls[0]!);
  assertEquals(url.pathname, '/IPlayerService/GetOwnedGames/v1/');
  assertEquals(url.searchParams.get('steamid'), STEAM_ID);
  assertEquals(url.searchParams.get('include_appinfo'), '1');
  assertEquals(url.searchParams.get('include_played_free_games'), '1');
  assertEquals(url.searchParams.get('key'), KEY);
  assertFalse(result.private);
  assertEquals(result.games.length, 4);
});

Deno.test('a private profile is an empty response, and it is not an error', async () => {
  const fetcher = stubFetch([jsonResponse(privateFixture)]);

  const result = await fetchOwnedGames(KEY, STEAM_ID, { fetchImpl: fetcher.fetchImpl });

  assert(result.private);
  assertEquals(result.games, []);
});

Deno.test('an account that owns nothing is not a private profile', () => {
  // The distinction the whole privacy-checklist flow rests on: a real empty
  // library still carries game_count, a hidden one carries nothing at all.
  assert(isPrivateProfile(privateFixture));
  assertFalse(isPrivateProfile(emptyFixture));
  assert(isPrivateProfile({}));
});

Deno.test('a bad key fails immediately and the key is in no message', async () => {
  const fetcher = stubFetch([jsonResponse({ error: 'unauthorised' }, 401)]);
  const sleeper = stubSleep();

  const error = await assertRejects(
    () => fetchOwnedGames(KEY, STEAM_ID, { fetchImpl: fetcher.fetchImpl, sleep: sleeper.sleep }),
    SteamApiError,
  );

  assertEquals(error.status, 401);
  assertEquals(fetcher.calls, 1, '401 is not retried: it will say the same thing next time');
  assertEquals(sleeper.waits, []);
  // The URL carries `key=`, so an error that quoted it would put the secret in
  // the function logs.
  assertFalse(error.message.includes(KEY));
});

Deno.test('a dead connection never puts the key in the error, or the log', async () => {
  // The leak this closes: a `fetch` rejection routinely quotes the URL it
  // failed on, and that URL has `key=` in it. Interpolating the cause here --
  // `${String(cause)}` -- put the Steam Web API key into whatever logged the
  // message, which index.ts does on every SteamApiError.
  const url = `${OWNED_GAMES_URL}?key=${KEY}&steamid=${STEAM_ID}`;
  const fetchImpl = (() =>
    Promise.reject(new TypeError(`error sending request for url (${url}): connection reset`))
  ) as unknown as typeof fetch;
  const sleeper = stubSleep();

  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
  try {
    const error = await assertRejects(
      () => fetchOwnedGames(KEY, STEAM_ID, { fetchImpl, sleep: sleeper.sleep }),
      SteamApiError,
    );

    assertFalse(error.message.includes(KEY), error.message);
    assertFalse(error.message.includes('key='), error.message);
    // Still useful: how many attempts, and what kind of failure.
    assertStringIncludes(error.message, String(MAX_ATTEMPTS));
    assertStringIncludes(error.message, 'TypeError');
    assertEquals(error.status, null);
  } finally {
    console.error = realError;
  }

  assertFalse(logged.join('\n').includes(KEY));
});

Deno.test('a 429 is retried with doubling backoff and then succeeds', async () => {
  const fetcher = stubFetch([
    jsonResponse({ error: 'slow down' }, 429),
    jsonResponse(ownedFixture),
  ]);
  const sleeper = stubSleep();

  const result = await fetchOwnedGames(KEY, STEAM_ID, {
    fetchImpl: fetcher.fetchImpl,
    sleep: sleeper.sleep,
  });

  assertEquals(fetcher.calls, 2);
  assertEquals(sleeper.waits, [500]);
  assertEquals(result.games.length, 4);
});

Deno.test('a 5xx that never clears gives up after the attempt limit', async () => {
  const fetcher = stubFetch([jsonResponse({}, 503)]);
  const sleeper = stubSleep();

  const error = await assertRejects(
    () => fetchOwnedGames(KEY, STEAM_ID, { fetchImpl: fetcher.fetchImpl, sleep: sleeper.sleep }),
    SteamApiError,
  );

  assertEquals(error.status, 503);
  assertEquals(fetcher.calls, MAX_ATTEMPTS);
  assertEquals(sleeper.waits, [500, 1000]);
});

Deno.test('GetRecentlyPlayedGames asks for all of them', async () => {
  const fetcher = stubFetch([jsonResponse(recentFixture)]);

  const games = await fetchRecentlyPlayed(KEY, STEAM_ID, { fetchImpl: fetcher.fetchImpl });

  const url = new URL(fetcher.urls[0]!);
  assertEquals(url.pathname, '/IPlayerService/GetRecentlyPlayedGames/v1/');
  assertEquals(url.searchParams.get('count'), '0');
  assertEquals(games.length, 2);
});

Deno.test('the library is normalised: minutes, a real timestamp, and null for "never"', () => {
  const entries = mergeLibrary(ownedFixture.response.games as OwnedGame[], []);
  const byId = new Map(entries.map((entry) => [entry.steamAppId, entry]));

  const hades = byId.get(1145360)!;
  assertEquals(hades.name, 'Hades');
  assertEquals(hades.playtimeForeverMinutes, 1200);
  assertEquals(hades.playtime2weeksMinutes, 60);
  assertEquals(hades.lastPlayedAt, new Date(1757980800 * 1000).toISOString());

  // Not played in the last two weeks: Valve omits the field rather than sending
  // a zero, and null is the honest reading of that.
  assertEquals(byId.get(504230)!.playtime2weeksMinutes, null);

  // rtime_last_played of 0 is Steam's "never", not 1970.
  assertEquals(byId.get(553420)!.lastPlayedAt, null);
  assertEquals(byId.get(553420)!.playtimeForeverMinutes, 0);

  // No rtime_last_played at all.
  assertEquals(byId.get(323910)!.lastPlayedAt, null);
});

Deno.test('the recent list refreshes a total but cannot add a game to the library', () => {
  const entries = mergeLibrary(
    ownedFixture.response.games as OwnedGame[],
    recentFixture.response.games as OwnedGame[],
  );
  const byId = new Map(entries.map((entry) => [entry.steamAppId, entry]));

  // The two endpoints are read seconds apart; the larger figure is the one that
  // is not stale.
  assertEquals(byId.get(1145360)!.playtimeForeverMinutes, 1235);
  assertEquals(byId.get(1145360)!.playtime2weeksMinutes, 95);

  // Valheim is in "recently played" and not in the library: family sharing, or
  // a refund between the two calls. steam_library is what the user owns.
  assertEquals(byId.has(892970), false);
  assertEquals(entries.length, 4);
});

Deno.test('a duplicated app id collapses to the reading that knows more', () => {
  const entries = mergeLibrary(
    [
      { appid: 400, playtime_forever: 10 },
      { appid: 400, name: 'Portal', playtime_forever: 90, rtime_last_played: 1700000000 },
    ],
    [],
  );

  assertEquals(entries.length, 1);
  assertEquals(entries[0]!.name, 'Portal');
  assertEquals(entries[0]!.playtimeForeverMinutes, 90);
});

Deno.test('nonsense from Valve is skipped rather than turned into a bad row', () => {
  const entries = mergeLibrary(
    [
      { appid: 0, playtime_forever: 10 },
      { appid: -5, playtime_forever: 10 },
      { appid: 400, playtime_forever: -3, name: '' },
    ],
    [],
  );

  assertEquals(entries.length, 1);
  assertEquals(entries[0]!.steamAppId, 400);
  // A negative total is not a number of minutes; zero is, and zero writes
  // nothing downstream.
  assertEquals(entries[0]!.playtimeForeverMinutes, 0);
  assertEquals(entries[0]!.name, null);
});

Deno.test('"every game reads as zero" is flagged, never acted on', () => {
  const hidden = mergeLibrary(
    [
      { appid: 1, name: 'A', playtime_forever: 0 },
      { appid: 2, name: 'B', playtime_forever: 0 },
    ],
    [],
  );
  assert(looksLikePlaytimeHidden(hidden));

  const played = mergeLibrary(
    [
      { appid: 1, name: 'A', playtime_forever: 0 },
      { appid: 2, name: 'B', playtime_forever: 5 },
    ],
    [],
  );
  assertFalse(looksLikePlaytimeHidden(played));

  // An empty library says nothing either way.
  assertFalse(looksLikePlaytimeHidden([]));
});
