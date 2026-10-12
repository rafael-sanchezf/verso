/**
 * `library.ts` against fixtures. Run with:
 *
 *   deno test supabase/functions/steam-import
 *
 * The database and Valve are both injected, so this suite is about the order of
 * operations and the four outcomes: not linked, too soon, private, imported.
 *
 * The precedence rule itself is not here. It is `apply_steam_playtime` in
 * supabase/migrations/20260916210000_steam_link.sql -- four conditions in a
 * `where` clause -- and supabase/tests/steam_link.test.sql proves each of them
 * against a real database. What this file proves about it is that the import
 * calls it, exactly once, for the user whose slot it claimed, and that the
 * number it reports is the number that function returned. Splitting the rule in
 * two so it could also be asserted in TypeScript would mean two copies of it,
 * and the copy in the language without the data would be the one that rots.
 *
 * The same holds for where a game was played: `apply_steam_played_platforms`
 * in supabase/migrations/20261007100000_drop_ownership.sql, proved in
 * supabase/tests/drop_ownership.test.sql. Here, only that it runs once, after
 * the playtime, for the same user, and that its count is reported.
 */

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import ownedFixture from './fixtures/owned-games.json' with { type: 'json' };
import recentFixture from './fixtures/recently-played.json' with { type: 'json' };
import { importLibrary, type ImportDeps, type ImportSlot, type LibraryRow } from './library.ts';
import type { OwnedGame } from './steam.ts';

const USER_ID = '00000000-0000-0000-0000-00000000000a';
const STEAM_ID = '76561198000000001';

interface Log {
  begun: string[];
  fetchedOwned: string[];
  fetchedRecent: string[];
  resolved: number[][];
  written: LibraryRow[];
  pruned: { userId: string; fetchedAt: string }[];
  playtimeApplied: string[];
  playedApplied: string[];
  /** Every database write in the order it happened, to check the sequence. */
  steps: string[];
  finished: { userId: string; syncStatus: string }[];
}

interface HarnessOptions {
  slot?: Partial<ImportSlot>;
  owned?: OwnedGame[];
  privateProfile?: boolean;
  recent?: OwnedGame[];
  recentThrows?: boolean;
  /** App ids the catalog knows, in the order media item ids are handed out. */
  resolvable?: number[];
  prunes?: number;
  entriesUpdated?: number;
  playedPlatformsUpdated?: number;
}

function harness(options: HarnessOptions = {}): { deps: ImportDeps; log: Log } {
  const log: Log = {
    begun: [],
    fetchedOwned: [],
    fetchedRecent: [],
    resolved: [],
    written: [],
    pruned: [],
    playtimeApplied: [],
    playedApplied: [],
    steps: [],
    finished: [],
  };

  const resolvable = new Set(options.resolvable ?? []);

  const deps: ImportDeps = {
    beginImport: (userId) => {
      log.begun.push(userId);
      return Promise.resolve({
        allowed: true,
        retryAfterSeconds: 0,
        steamId: STEAM_ID,
        ...options.slot,
      });
    },
    fetchOwned: (steamId) => {
      log.fetchedOwned.push(steamId);
      return Promise.resolve({
        private: options.privateProfile ?? false,
        games: options.owned ?? (ownedFixture.response.games as OwnedGame[]),
      });
    },
    fetchRecent: (steamId) => {
      log.fetchedRecent.push(steamId);
      if (options.recentThrows) return Promise.reject(new Error('Steam returned 503'));
      return Promise.resolve(options.recent ?? []);
    },
    resolveMediaItems: (appIds) => {
      log.resolved.push(appIds);
      return Promise.resolve(
        new Map(
          appIds
            .filter((appId) => resolvable.has(appId))
            .map((appId) => [appId, `media-${appId}`]),
        ),
      );
    },
    writeLibrary: (_userId, rows) => {
      log.written.push(...rows);
      return Promise.resolve();
    },
    pruneLibrary: (userId, fetchedAt) => {
      log.pruned.push({ userId, fetchedAt });
      return Promise.resolve(options.prunes ?? 0);
    },
    applyPlaytime: (userId) => {
      log.playtimeApplied.push(userId);
      log.steps.push('playtime');
      return Promise.resolve(options.entriesUpdated ?? 0);
    },
    applyPlayedPlatforms: (userId) => {
      log.playedApplied.push(userId);
      log.steps.push('played');
      return Promise.resolve(options.playedPlatformsUpdated ?? 0);
    },
    finish: (userId, syncStatus) => {
      log.finished.push({ userId, syncStatus });
      log.steps.push(`finish:${syncStatus}`);
      return Promise.resolve();
    },
  };

  return { deps, log };
}

Deno.test('an unlinked account is told so, and Steam is never called', async () => {
  const { deps, log } = harness({ slot: { allowed: false, steamId: null } });

  const result = await importLibrary(deps, USER_ID);

  assertEquals(result, { status: 'not_linked' });
  assertEquals(log.fetchedOwned, []);
  assertEquals(log.written, []);
});

Deno.test('a second import inside the window is refused before the first call goes out', async () => {
  const { deps, log } = harness({
    slot: { allowed: false, retryAfterSeconds: 412, steamId: STEAM_ID },
  });

  const result = await importLibrary(deps, USER_ID);

  assertEquals(result, { status: 'rate_limited', retryAfterSeconds: 412 });
  // The whole point of claiming the slot first: five taps cost one call.
  assertEquals(log.fetchedOwned, []);
});

Deno.test('a private profile is a result, not an error, and writes no library', async () => {
  const { deps, log } = harness({ privateProfile: true });

  const result = await importLibrary(deps, USER_ID);

  assertEquals(result, { status: 'private_profile' });
  assertEquals(log.written, []);
  assertEquals(log.playtimeApplied, []);
  assertEquals(log.playedApplied, []);
  // Recorded, so the app can say "we could not see your games" on the next read.
  assertEquals(log.finished, [{ userId: USER_ID, syncStatus: 'private' }]);
});

Deno.test('an import stores the whole library, resolved and unresolved alike', async () => {
  const { deps, log } = harness({ resolvable: [1145360, 504230, 553420] });

  const result = await importLibrary(deps, USER_ID);

  assert(result.status === 'imported');
  assertEquals(result.ownedGames, 4);
  assertEquals(result.resolved, 3);
  assertEquals(log.written.length, 4);

  const editor = log.written.find((row) => row.steam_app_id === 323910)!;
  // Kept with a null media item: dropping it would make every future import
  // re-fetch and re-fail on it, and a later catalog sync can resolve it.
  assertEquals(editor.media_item_id, null);
  assertEquals(editor.name, 'Some Level Editor');

  const hades = log.written.find((row) => row.steam_app_id === 1145360)!;
  assertEquals(hades.media_item_id, 'media-1145360');
  assertEquals(hades.playtime_forever_minutes, 1200);
  assertEquals(hades.user_id, USER_ID);
});

Deno.test('every row of one import carries one instant, and the prune uses it', async () => {
  const { deps, log } = harness({ resolvable: [1145360], prunes: 2 });

  const result = await importLibrary(deps, USER_ID);

  assert(result.status === 'imported');
  const instants = new Set(log.written.map((row) => row.fetched_at));
  assertEquals(instants.size, 1, '"your library as of" has to be one answer');
  assertEquals([...instants][0], result.fetchedAt);

  // Rows older than this import are games the account no longer owns.
  assertEquals(log.pruned, [{ userId: USER_ID, fetchedAt: result.fetchedAt }]);
  assertEquals(result.removed, 2);
});

Deno.test('the recent list refines the import and cannot fail it', async () => {
  const withRecent = harness({
    resolvable: [1145360],
    recent: recentFixture.response.games as OwnedGame[],
  });
  const fresh = await importLibrary(withRecent.deps, USER_ID);
  assert(fresh.status === 'imported');
  assertEquals(
    withRecent.log.written.find((row) => row.steam_app_id === 1145360)!.playtime_forever_minutes,
    1235,
  );
  assertEquals(fresh.ownedGames, 4, 'a game only in the recent list is not owned');

  const broken = harness({ resolvable: [1145360], recentThrows: true });
  const result = await importLibrary(broken.deps, USER_ID);

  assert(result.status === 'imported');
  assertEquals(result.ownedGames, 4);
  assertEquals(broken.log.finished, [{ userId: USER_ID, syncStatus: 'ok' }]);
});

Deno.test('playtime is applied once, by the database, for the user whose slot was claimed', async () => {
  const { deps, log } = harness({ resolvable: [1145360, 504230], entriesUpdated: 2 });

  const result = await importLibrary(deps, USER_ID);

  assert(result.status === 'imported');
  assertEquals(log.begun, [USER_ID]);
  assertEquals(log.playtimeApplied, [USER_ID]);
  assertEquals(result.entriesUpdated, 2);
});

Deno.test('PC is added to where tracked games were played, once, after the playtime', async () => {
  const { deps, log } = harness({
    resolvable: [1145360, 504230],
    entriesUpdated: 2,
    playedPlatformsUpdated: 1,
  });

  const result = await importLibrary(deps, USER_ID);

  assert(result.status === 'imported');
  assertEquals(log.playedApplied, [USER_ID]);
  assertEquals(log.steps, ['playtime', 'played', 'finish:ok']);
  assertEquals(result.playedPlatformsUpdated, 1);
  assertEquals(result.entriesUpdated, 2, 'the two counts are reported apart');
});

Deno.test('an import that stops early never marks anything played', async () => {
  for (const options of [
    { slot: { allowed: false, steamId: null } },
    { slot: { allowed: false, retryAfterSeconds: 30, steamId: STEAM_ID } },
    { privateProfile: true },
  ]) {
    const { deps, log } = harness(options);
    await importLibrary(deps, USER_ID);
    assertEquals(log.playedApplied, []);
  }
});

Deno.test('the catalog is asked about every app id, in one pass', async () => {
  const { deps, log } = harness({ resolvable: [1145360] });

  await importLibrary(deps, USER_ID);

  assertEquals(log.resolved.length, 1);
  assertEquals([...log.resolved[0]!].sort((a, b) => a - b), [323910, 504230, 553420, 1145360]);
});

Deno.test('a library that is entirely zeroes is flagged for the privacy checklist', async () => {
  const { deps } = harness({
    owned: [
      { appid: 1, name: 'A', playtime_forever: 0 },
      { appid: 2, name: 'B', playtime_forever: 0 },
    ],
  });

  const result = await importLibrary(deps, USER_ID);

  assert(result.status === 'imported');
  // "Always keep my total playtime private" (research 4.3) looks exactly like
  // never having played anything, so this is a flag for the UI and nothing the
  // import acts on: apply_steam_playtime writes nothing for a zero either way.
  assert(result.playtimeHidden);
  assertEquals(result.entriesUpdated, 0);
});

Deno.test('an ordinary library is not flagged', async () => {
  const { deps } = harness({ resolvable: [1145360] });

  const result = await importLibrary(deps, USER_ID);

  assert(result.status === 'imported');
  assertFalse(result.playtimeHidden);
});
