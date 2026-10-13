/**
 * `suggest.ts` and `prompt.ts` against fixtures. Run with:
 *
 *   deno test supabase/functions/suggest
 *
 * No permissions and no network. The database is a recorder that answers from
 * fixtures (what `suggestion_candidates`, `tier_list` and the two inserts do
 * for real is PR A's pgTAP suite's business), and every test that reaches the
 * model passes its own `fetchImpl`, so nothing here can call the Anthropic API
 * even by accident. The key is a fake string.
 *
 * The fixtures:
 *
 *   candidates.json    what `suggestion_candidates` returns: 30 games, best
 *                      predicted first, each with its `why`.
 *   tier-list.json     `tier_list` for Loved (4) and Liked (8), so the top ten
 *                      leaves two Liked items out.
 *   reply-valid.json   a Messages API response whose structured answer picks
 *                      c01, c03 and c11.
 *   reply-invalid.json the same shape naming c31, one past the list: what a
 *                      reply looks like if the schema was not applied.
 *   reply-thinking-first.json
 *                      the valid answer as Claude Haiku 5.5 can send it: a
 *                      `thinking` block (empty text, the default) first, then
 *                      the text block, with the thinking tokens in the output.
 *   reply-refusal.json a Haiku 5.5 refusal: `stop_reason: "refusal"`, a
 *                      `stop_details` category and explanation, no text.
 */

import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1';
import candidatesFixture from './fixtures/candidates.json' with { type: 'json' };
import tierListFixture from './fixtures/tier-list.json' with { type: 'json' };
import validReply from './fixtures/reply-valid.json' with { type: 'json' };
import invalidReply from './fixtures/reply-invalid.json' with { type: 'json' };
import thinkingFirstReply from './fixtures/reply-thinking-first.json' with { type: 'json' };
import refusalReply from './fixtures/reply-refusal.json' with { type: 'json' };
import { buildUserMessage, EFFORT, labelFor, STRETCH_ES, SYSTEM_PROMPT, systemPrompt } from './prompt.ts';
import {
  ANTHROPIC_VERSION,
  type CandidateRow,
  DEFAULT_MODEL,
  type DroppedEntry,
  loadTaste,
  MAX_OUTPUT_TOKENS,
  MESSAGES_URL,
  type NoteEntry,
  parseSuggestRequest,
  type PredictionLogRow,
  REASON_MAX_CHARS,
  scoreForPosition,
  SQL_MODEL_VERSION,
  suggest,
  type SuggestDb,
  type SuggestDeps,
  type SuggestionCandidatesArgs,
  type SuggestionRequestRow,
  type SuggestOutcome,
  type SuggestRequest,
  type SuggestResponse,
  type TierListRow,
} from './suggest.ts';

const USER_ID = '00000000-0000-0000-0000-00000000000a';
const REQUEST_ID = '30000000-0000-4000-8000-000000000001';
const FAKE_KEY = 'test-key-not-a-real-anthropic-key';

const CANDIDATES = candidatesFixture as CandidateRow[];
const TIERS = tierListFixture as { loved: TierListRow[]; liked: TierListRow[] };
const TOP_TEN = [
  'Hades',
  'Outer Wilds',
  'Celeste',
  'Hollow Knight',
  'Slay the Spire',
  'Into the Breach',
  'Dead Cells',
  'Inscryption',
  'Stardew Valley',
  'Disco Elysium',
];
const DROPPED: DroppedEntry[] = [
  { title: 'Returnal', year: 2021, note: 'Too punishing; lost a two-hour run to one mistake.' },
];
const NOTES: NoteEntry[] = [
  { title: 'Celeste', status: 'played', note: 'The assist mode is what let me finish it.' },
];
/** SQL's top three's template reasons, each naming one of the user's own items. */
const SQL_TOP_THREE_REASONS = [
  'Because you put Hades in Loved and this shares the Roguelike genre.',
  'Because you put Outer Wilds in Loved and this shares the Puzzle genre.',
  'Because you put Slay the Spire in Liked and this shares the Card & Board Game genre.',
];

function request(overrides: Partial<SuggestRequest> = {}): SuggestRequest {
  return {
    medium: 'game',
    genres: null,
    excludeGenres: null,
    maxMinutes: null,
    platforms: null,
    providerIds: null,
    region: 'US',
    includeBacklog: false,
    note: null,
    language: 'en',
    ...overrides,
  };
}

interface Recorder {
  meterWindows: string[];
  candidateArgs: SuggestionCandidatesArgs[];
  tierLists: string[];
  suggestionRows: SuggestionRequestRow[];
  predictionRows: PredictionLogRow[];
}

function fakeDb(options: { used?: number; candidates?: CandidateRow[] } = {}): {
  db: SuggestDb;
  log: Recorder;
} {
  const log: Recorder = {
    meterWindows: [],
    candidateArgs: [],
    tierLists: [],
    suggestionRows: [],
    predictionRows: [],
  };
  const db: SuggestDb = {
    countRequests: (since) => {
      log.meterWindows.push(since);
      return Promise.resolve(options.used ?? 0);
    },
    candidates: (args) => {
      log.candidateArgs.push(args);
      return Promise.resolve(options.candidates ?? CANDIDATES);
    },
    tierList: (medium, tier) => {
      log.tierLists.push(`${medium}:${tier}`);
      return Promise.resolve(tier === 'loved' ? TIERS.loved : tier === 'liked' ? TIERS.liked : []);
    },
    droppedEntries: () => Promise.resolve(DROPPED),
    recentNotes: () => Promise.resolve(NOTES),
    insertSuggestionRequest: (row) => {
      log.suggestionRows.push(row);
      return Promise.resolve(REQUEST_ID);
    },
    insertPredictions: (rows) => {
      log.predictionRows.push(...rows);
      return Promise.resolve();
    },
  };
  return { db, log };
}

interface RecordedCall {
  url: string;
  headers: Headers;
  body: {
    model: string;
    max_tokens: number;
    thinking: unknown;
    system: string;
    messages: { role: string; content: string }[];
    output_config: { effort: string; format: { type: string; schema: Schema } };
  };
}

interface Schema {
  required: string[];
  additionalProperties: boolean;
  properties: Record<string, {
    required: string[];
    additionalProperties: boolean;
    properties: {
      label: { enum: string[] };
      because?: { items: { enum: string[] } };
    };
  }>;
}

/** A `fetch` that records what it was sent and answers with `answer`. */
function stubFetch(answer: () => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return await answer();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

/** The valid reply with its structured answer edited. */
function replyWith(edit: (answer: Record<string, Record<string, unknown>>) => void) {
  const message = structuredClone(validReply);
  const answer = JSON.parse(message.content[0]!.text);
  edit(answer);
  message.content[0]!.text = JSON.stringify(answer);
  return message;
}

function deps(db: SuggestDb, fetchImpl: typeof fetch, errors: string[] = []): SuggestDeps {
  return {
    db,
    userId: USER_ID,
    apiKey: FAKE_KEY,
    fetchImpl,
    logError: (message) => errors.push(message),
  };
}

function ok(outcome: SuggestOutcome): SuggestResponse {
  assertEquals(outcome.status, 200);
  return outcome.body as SuggestResponse;
}

// -- The prompt ----------------------------------------------------------------

Deno.test('the prompt carries at most 30 candidates, each label exactly once', async () => {
  const extra = CANDIDATES.slice(0, 5).map((row, index) => ({
    ...row,
    media_item_id: `10000000-0000-4000-8000-0000000000${31 + index}`,
    title: `${row.title} (extra ${index + 1})`,
  }));
  const { db, log } = fakeDb({ candidates: [...CANDIDATES, ...extra] });
  const api = stubFetch(jsonResponse(validReply));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  const sent = api.calls[0]!.body;
  const message = sent.messages[0]!.content;
  const labels = Array.from({ length: 30 }, (_, index) => labelFor(index));
  for (const label of labels) {
    assertEquals(message.match(new RegExp(`^${label} `, 'gm'))?.length, 1, `${label} once`);
  }
  assertFalse(/^c31 /m.test(message));
  assertFalse(message.includes('(extra 1)'));
  assertStringIncludes(message, 'Pick exactly three different labels from c01 to c30');

  // The schema's enums are exactly the labels sent, in all three picks.
  const schema = sent.output_config.format.schema;
  for (const pick of ['pick1', 'pick2', 'pick3']) {
    assertEquals(schema.properties[pick]!.properties.label.enum, labels);
  }

  assertEquals(log.candidateArgs[0]!.p_limit, 30);
  assertEquals(body.candidates.length, 30);
  assertEquals(log.suggestionRows[0]!.candidate_count, 30);
});

Deno.test("the prompt names the user's own items, what they dropped, and quotes the note", async () => {
  const note = 'something chill I can finish in a weekend, "no horror" please';
  const { db } = fakeDb();
  const taste = await loadTaste(db, 'game');
  const labeled = CANDIDATES.map((row, index) => ({ label: labelFor(index), row }));

  const message = buildUserMessage(request({ note }), taste, labeled);

  for (const title of TOP_TEN) assertStringIncludes(message, `- ${title} (`);
  // Liked positions 6 and 7 fall outside the top ten.
  assertFalse(message.includes('Spelunky 2'));
  assertFalse(message.includes('Return of the Obra Dinn'));
  assertStringIncludes(message, 'Loved, best first:\n- Hades (2020): Roguelike, Action');
  assertStringIncludes(message, `Their note, in their own words: "${note}"`);
  assertStringIncludes(message, 'Returnal (2021). Their note: "Too punishing; lost a two-hour run to one mistake."');
  assertStringIncludes(message, 'Celeste (played): "The assist mode is what let me finish it."');
  // A candidate line carries the score, the confidence and `why` in words.
  assertStringIncludes(
    message,
    'c01 Hades II (2025). Genres: Roguelike, Action. About 30 hours to beat. Predicted 8.9 of 10, confidence medium. Why Verso retrieved it: fits their taste for genre Roguelike, developer Supergiant Games, the 2020s.',
  );
  assertStringIncludes(message, 'against their taste: genre Shooter');
});

Deno.test('because can cite only the top ten Loved and Liked titles', async () => {
  const { db } = fakeDb();
  const api = stubFetch(jsonResponse(validReply));

  await suggest(deps(db, api.fetchImpl), request());

  const pick = api.calls[0]!.body.output_config.format.schema.properties.pick1!;
  assertEquals(pick.properties.because!.items.enum, TOP_TEN);
  assertEquals(pick.required, ['label', 'reason', 'because']);
  assertEquals(pick.additionalProperties, false);
});

Deno.test('with nothing ranked, because is left out of the schema', async () => {
  const { db } = fakeDb();
  db.tierList = () => Promise.resolve([]);
  const api = stubFetch(jsonResponse(replyWith((answer) => {
    for (const key of ['pick1', 'pick2', 'pick3']) delete answer[key]!.because;
  })));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  const pick = api.calls[0]!.body.output_config.format.schema.properties.pick1!;
  assertEquals(pick.properties.because, undefined);
  assertEquals(pick.required, ['label', 'reason']);
  assertStringIncludes(api.calls[0]!.body.messages[0]!.content, 'Nothing in Loved or Liked yet');
  assertFalse(body.fallback);
  assertEquals(body.picks.map((pick) => pick.because), [[], [], []]);
});

Deno.test('the request is the documented Messages API shape, adaptive thinking at effort low', async () => {
  const { db } = fakeDb();
  const api = stubFetch(jsonResponse(validReply));

  await suggest(deps(db, api.fetchImpl), request());

  assertEquals(api.calls.length, 1);
  const call = api.calls[0]!;
  assertEquals(call.url, MESSAGES_URL);
  assertEquals(call.headers.get('x-api-key'), FAKE_KEY);
  assertEquals(call.headers.get('anthropic-version'), ANTHROPIC_VERSION);
  assertEquals(call.headers.get('content-type'), 'application/json');
  assertEquals(call.body.model, DEFAULT_MODEL);
  assertEquals(call.body.model, 'claude-haiku-5-5');
  assertEquals(call.body.max_tokens, MAX_OUTPUT_TOKENS);
  // Thinking counts against max_tokens, so the ceiling leaves it room before the answer.
  assert(MAX_OUTPUT_TOKENS >= 2_000, `${MAX_OUTPUT_TOKENS} leaves thinking no room`);
  // Haiku 5.5's guide documents thinking unset or adaptive; disabled is never sent.
  assertEquals(call.body.thinking, { type: 'adaptive' });
  assertEquals(call.body.output_config.effort, 'low');
  assertEquals(call.body.output_config.effort, EFFORT);
  // Exactly these fields: no temperature, top_p or top_k, which are a 400 on Haiku 5.5.
  assertEquals(Object.keys(call.body).sort(), [
    'max_tokens',
    'messages',
    'model',
    'output_config',
    'system',
    'thinking',
  ]);
  assertEquals(Object.keys(call.body.output_config).sort(), ['effort', 'format']);
  assertEquals(call.body.system, SYSTEM_PROMPT);
  // One user turn and no assistant prefill, also a 400.
  assertEquals(call.body.messages.length, 1);
  assertEquals(call.body.messages[0]!.role, 'user');
  assertEquals(call.body.output_config.format.type, 'json_schema');
  assertEquals(call.body.output_config.format.schema.required, ['pick1', 'pick2', 'pick3']);
  assertEquals(call.body.output_config.format.schema.additionalProperties, false);
  // The rules the design doc names are in the system prompt.
  assertStringIncludes(SYSTEM_PROMPT, 'Pick exactly three different candidates');
  assertStringIncludes(SYSTEM_PROMPT, 'under 25 words');
  assertStringIncludes(SYSTEM_PROMPT, '"a stretch"');
  assertStringIncludes(SYSTEM_PROMPT, 'second person');
});

Deno.test('SUGGEST_MODEL reaches the request and the logs', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(validReply));

  const body = ok(await suggest({ ...deps(db, api.fetchImpl), model: 'claude-sonnet-5' }, request()));

  assertEquals(api.calls[0]!.body.model, 'claude-sonnet-5');
  assertEquals(body.model, 'claude-sonnet-5');
  assertEquals(log.suggestionRows[0]!.model, 'claude-sonnet-5');
  assert(log.predictionRows.every((row) => row.model_version === 'claude-sonnet-5'));
});

// -- A good answer -------------------------------------------------------------

Deno.test('a valid structured reply is mapped back to media item ids', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(validReply));
  const errors: string[] = [];

  const body = ok(await suggest(deps(db, api.fetchImpl, errors), request()));

  assertFalse(body.fallback);
  assertEquals(body.model, 'claude-haiku-5-5');
  assertEquals(body.requestId, REQUEST_ID);
  // c01, c03 and c11 are rows 0, 2 and 10.
  assertEquals(body.picks.map((pick) => pick.mediaItemId), [
    CANDIDATES[0]!.media_item_id,
    CANDIDATES[2]!.media_item_id,
    CANDIDATES[10]!.media_item_id,
  ]);
  // Titles come from the rows, never from the model.
  assertEquals(body.picks.map((pick) => pick.title), ['Hades II', 'Balatro', 'Cocoon']);
  assertEquals(body.picks[0], {
    mediaItemId: '10000000-0000-4000-8000-000000000001',
    title: 'Hades II',
    year: 2025,
    coverImageId: 'co9h2a',
    reason:
      "You put Hades in Loved; this is Supergiant's sequel, with the same fast combat and the same one-more-run pull.",
    because: ['Hades'],
    predictedScore: 8.9,
    confidence: 'medium',
  });
  assertEquals(body.picks[2]!.because, ['Outer Wilds']);
  assertStringIncludes(body.picks[2]!.reason, 'A stretch');
  assertEquals(body.candidates, CANDIDATES);
  assertEquals(errors, []);

  assertEquals(log.predictionRows.length, 3);
  for (const [index, row] of log.predictionRows.entries()) {
    assertEquals(row.user_id, USER_ID);
    assertEquals(row.medium, 'game');
    assertEquals(row.media_item_id, body.picks[index]!.mediaItemId);
    assertEquals(row.surface, 'suggest');
    assertEquals(row.model_version, 'claude-haiku-5-5');
    assertEquals(row.request_id, REQUEST_ID);
    assertEquals(row.confidence, 'medium');
  }
  assertEquals(log.predictionRows[0]!.predicted_score, 8.9);
  assertEquals(log.predictionRows[0]!.components, {
    label: 'c01',
    prior_score: 8.6,
    content_score: 9.2,
    why: CANDIDATES[0]!.why!,
  });
});

Deno.test('a reply that opens with a thinking block is read from its text block', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(thinkingFirstReply));
  const errors: string[] = [];

  const body = ok(await suggest(deps(db, api.fetchImpl, errors), request()));

  assertEquals(thinkingFirstReply.content.map((block) => block.type), ['thinking', 'text']);
  assertFalse(body.fallback);
  assertEquals(body.model, 'claude-haiku-5-5');
  assertEquals(body.picks.map((pick) => pick.title), ['Hades II', 'Balatro', 'Cocoon']);
  assertEquals(body.picks[0]!.because, ['Hades']);
  assertEquals(errors, []);
  // Thinking is billed as output, so it is in the row's output tokens.
  assertEquals(log.suggestionRows[0]!.input_tokens, 3136);
  assertEquals(log.suggestionRows[0]!.output_tokens, 588);
  assertEquals(log.suggestionRows[0]!.picks.fallback, false);
});

Deno.test('the token accounting is written to the suggestion row', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(validReply));
  const asked = request({ genres: ['Roguelike'], note: 'short runs' });

  await suggest(deps(db, api.fetchImpl), asked);

  assertEquals(log.suggestionRows.length, 1);
  const row = log.suggestionRows[0]!;
  assertEquals(row.user_id, USER_ID);
  assertEquals(row.medium, 'game');
  assertEquals(row.kind, 'personal');
  assertEquals(row.model, 'claude-haiku-5-5');
  assertEquals(row.input_tokens, 2412);
  assertEquals(row.output_tokens, 173);
  assertEquals(row.candidate_count, 30);
  assertEquals(row.request, asked);
  assertEquals(row.picks.fallback, false);
  assertEquals(row.picks.fallbackReason, null);
  assertEquals(row.picks.items.map((item) => item.label), ['c01', 'c03', 'c11']);
  assertEquals(row.picks.items[1]!.mediaItemId, CANDIDATES[2]!.media_item_id);
});

Deno.test('cached input tokens count toward the input on the row', async () => {
  const { db, log } = fakeDb();
  const reply = structuredClone(validReply);
  reply.usage.input_tokens = 400;
  reply.usage.cache_read_input_tokens = 2000;
  reply.usage.cache_creation_input_tokens = 12;
  const api = stubFetch(jsonResponse(reply));

  await suggest(deps(db, api.fetchImpl), request());

  assertEquals(log.suggestionRows[0]!.input_tokens, 2412);
});

Deno.test('a long reason is cut to about 200 characters', async () => {
  const { db } = fakeDb();
  const long = `${'You put Hades in Loved and this keeps the same loop '.repeat(8)}end.`;
  const api = stubFetch(jsonResponse(replyWith((answer) => {
    answer.pick1!.reason = long;
  })));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  const reason = body.picks[0]!.reason;
  assert(reason.length <= REASON_MAX_CHARS, `${reason.length} characters`);
  assert(reason.length > REASON_MAX_CHARS - 40);
  assert(reason.endsWith('…'));
  assertFalse(body.fallback);
});

Deno.test('because is trimmed to two titles, once each', async () => {
  const { db } = fakeDb();
  const api = stubFetch(jsonResponse(replyWith((answer) => {
    answer.pick1!.because = ['Hades', 'Hades', 'Dead Cells', 'Celeste'];
  })));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  assertEquals(body.picks[0]!.because, ['Hades', 'Dead Cells']);
});

// -- The fallback --------------------------------------------------------------

Deno.test("a reply naming a label outside the list falls back to SQL's top three", async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(invalidReply));
  const errors: string[] = [];

  const body = ok(await suggest(deps(db, api.fetchImpl, errors), request()));

  assert(body.fallback);
  assertEquals(body.model, SQL_MODEL_VERSION);
  assertEquals(body.picks.map((pick) => pick.mediaItemId), CANDIDATES.slice(0, 3).map((row) => row.media_item_id));
  // Template reasons from `why`, each naming one of the user's own items.
  assertEquals(body.picks.map((pick) => pick.reason), SQL_TOP_THREE_REASONS);
  assertEquals(body.picks.map((pick) => pick.because), [['Hades'], ['Outer Wilds'], ['Slay the Spire']]);
  assert(log.predictionRows.every((row) => row.model_version === SQL_MODEL_VERSION));
  assertEquals(log.predictionRows.length, 3);

  // The row still records what was asked and what it cost.
  const row = log.suggestionRows[0]!;
  assertEquals(row.model, 'claude-haiku-5-5');
  assertEquals(row.input_tokens, 2398);
  assertEquals(row.output_tokens, 151);
  assertEquals(row.picks.fallback, true);
  assertEquals(row.picks.fallbackReason, 'unknown_label');
  assertEquals(errors.length, 1);
  assertStringIncludes(errors[0]!, 'unknown_label');
});

Deno.test('a repeated label falls back', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(replyWith((answer) => {
    answer.pick3!.label = 'c01';
  })));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  assert(body.fallback);
  assertEquals(body.picks.map((pick) => pick.mediaItemId), CANDIDATES.slice(0, 3).map((row) => row.media_item_id));
  assertEquals(log.suggestionRows[0]!.picks.fallbackReason, 'duplicate_label');
});

Deno.test('a title the user never ranked in their top ten is refused', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(replyWith((answer) => {
    answer.pick2!.because = ['Spelunky 2'];
  })));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  assert(body.fallback);
  assertEquals(log.suggestionRows[0]!.picks.fallbackReason, 'unknown_title');
});

Deno.test('a non-200 from the API falls back, with no tokens on the row', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(
    { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    529,
  ));
  const errors: string[] = [];

  const body = ok(await suggest(deps(db, api.fetchImpl, errors), request()));

  assert(body.fallback);
  assertEquals(body.picks.length, 3);
  assertEquals(log.suggestionRows[0]!.input_tokens, 0);
  assertEquals(log.suggestionRows[0]!.output_tokens, 0);
  assertEquals(log.suggestionRows[0]!.picks.fallbackReason, 'http_error');
  assertStringIncludes(errors[0]!, 'HTTP 529');
  assertStringIncludes(errors[0]!, 'overloaded_error');
});

Deno.test('a dropped connection falls back', async () => {
  const { db, log } = fakeDb();
  const fetchImpl = (() => Promise.reject(new TypeError('connection reset'))) as unknown as typeof fetch;

  const body = ok(await suggest(deps(db, fetchImpl), request()));

  assert(body.fallback);
  assertEquals(log.suggestionRows[0]!.picks.fallbackReason, 'network_error');
});

Deno.test('an answer cut off at max_tokens falls back, and its tokens are still counted', async () => {
  const { db, log } = fakeDb();
  const reply = structuredClone(validReply);
  reply.stop_reason = 'max_tokens';
  reply.content[0]!.text = reply.content[0]!.text.slice(0, 120);
  const api = stubFetch(jsonResponse(reply));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  assert(body.fallback);
  assertEquals(log.suggestionRows[0]!.picks.fallbackReason, 'not_finished');
  assertEquals(log.suggestionRows[0]!.output_tokens, 173);
});

Deno.test('thinking that uses the whole ceiling before any text falls back, and says so', async () => {
  const { db, log } = fakeDb();
  const reply = structuredClone(thinkingFirstReply);
  reply.stop_reason = 'max_tokens';
  reply.content = reply.content.filter((block) => block.type === 'thinking');
  reply.usage.output_tokens = MAX_OUTPUT_TOKENS;
  const api = stubFetch(jsonResponse(reply));
  const errors: string[] = [];

  const body = ok(await suggest(deps(db, api.fetchImpl, errors), request()));

  assert(body.fallback);
  assertEquals(body.picks.map((pick) => pick.reason), SQL_TOP_THREE_REASONS);
  assertEquals(log.suggestionRows[0]!.picks.fallbackReason, 'not_finished');
  assertEquals(log.suggestionRows[0]!.output_tokens, MAX_OUTPUT_TOKENS);
  assertStringIncludes(errors[0]!, 'stop_reason max_tokens, no text block');
});

Deno.test("a refusal falls back to SQL's top three with the template reasons", async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(refusalReply));
  const errors: string[] = [];

  const body = ok(await suggest(deps(db, api.fetchImpl, errors), request()));

  // The same answer as every other model failure.
  assert(body.fallback);
  assertEquals(body.model, SQL_MODEL_VERSION);
  assertEquals(body.picks.map((pick) => pick.mediaItemId), CANDIDATES.slice(0, 3).map((row) => row.media_item_id));
  assertEquals(body.picks.map((pick) => pick.reason), SQL_TOP_THREE_REASONS);
  assertEquals(body.picks.map((pick) => pick.because), [['Hades'], ['Outer Wilds'], ['Slay the Spire']]);
  assertEquals(log.predictionRows.length, 3);
  assert(log.predictionRows.every((row) => row.model_version === SQL_MODEL_VERSION));

  // The row records the model that refused and what the refusal cost.
  const row = log.suggestionRows[0]!;
  assertEquals(row.model, 'claude-haiku-5-5');
  assertEquals(row.input_tokens, 3136);
  assertEquals(row.output_tokens, 41);
  assertEquals(row.picks.fallback, true);
  assertEquals(row.picks.fallbackReason, 'refusal');

  // The log names the category and never the free-text explanation.
  assertEquals(errors.length, 1);
  assertStringIncludes(errors[0]!, 'fell back to SQL (refusal)');
  assertStringIncludes(errors[0]!, 'category "general_harms"');
  assertFalse(errors[0]!.includes(refusalReply.stop_details.explanation));
});

// -- The meter -----------------------------------------------------------------

Deno.test('the meter at its limit answers 429 and does nothing else', async () => {
  const { db, log } = fakeDb({ used: 20 });
  const api = stubFetch(jsonResponse(validReply));

  const outcome = await suggest(deps(db, api.fetchImpl), request());

  assertEquals(outcome.status, 429);
  assertEquals(outcome.body, {
    error: 'daily_limit_reached',
    message: 'Suggestion limit reached: 20 in 24 hours. Try again later.',
    limit: 20,
    used: 20,
  });
  assertEquals(log.meterWindows, ['24 hours']);
  assertEquals(log.candidateArgs, []);
  assertEquals(log.tierLists, []);
  assertEquals(api.calls.length, 0);
  assertEquals(log.suggestionRows, []);
  assertEquals(log.predictionRows, []);
});

Deno.test('one under the limit goes through, and a limit of 0 turns the feature off', async () => {
  const under = fakeDb({ used: 4 });
  const api = stubFetch(jsonResponse(validReply));
  const allowed = await suggest({ ...deps(under.db, api.fetchImpl), dailyLimit: 5 }, request());
  assertEquals(allowed.status, 200);

  const off = fakeDb({ used: 0 });
  const refused = await suggest({ ...deps(off.db, api.fetchImpl), dailyLimit: 0 }, request());
  assertEquals(refused.status, 429);
  assertEquals(api.calls.length, 1);
});

// -- Short lists ---------------------------------------------------------------

Deno.test('two candidates take the template path and the model is not called', async () => {
  // Silksong's strongest feature is its developer, which tier_list cannot
  // match on, so the reason falls through to its genre; Sifu has no `why`.
  const two = [CANDIDATES[8]!, CANDIDATES[29]!];
  const { db, log } = fakeDb({ candidates: two });
  const api = stubFetch(jsonResponse(validReply));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  assertEquals(api.calls.length, 0);
  assertFalse(body.fallback);
  assertEquals(body.model, SQL_MODEL_VERSION);
  assertEquals(body.requestId, REQUEST_ID);
  assertEquals(body.picks.map((pick) => pick.title), ['Hollow Knight: Silksong', 'Sifu']);
  assertEquals(body.picks.map((pick) => pick.reason), [
    'Because you put Celeste in Loved and this shares the Platform genre.',
    'Among the best-rated games that fit your filters.',
  ]);
  assertEquals(body.picks.map((pick) => pick.because), [['Celeste'], []]);
  assertEquals(body.candidates, two);

  assertEquals(log.suggestionRows[0]!.model, SQL_MODEL_VERSION);
  assertEquals(log.suggestionRows[0]!.input_tokens, 0);
  assertEquals(log.suggestionRows[0]!.candidate_count, 2);
  assertEquals(log.predictionRows.length, 2);
  assert(log.predictionRows.every((row) => row.model_version === SQL_MODEL_VERSION));
});

Deno.test('no candidates is an empty answer, with no call and no row', async () => {
  const { db, log } = fakeDb({ candidates: [] });
  const api = stubFetch(jsonResponse(validReply));

  const body = ok(await suggest(deps(db, api.fetchImpl), request()));

  assertEquals(body, { requestId: null, model: SQL_MODEL_VERSION, fallback: false, picks: [], candidates: [] });
  assertEquals(api.calls.length, 0);
  assertEquals(log.suggestionRows, []);
});

// -- The inputs ----------------------------------------------------------------

Deno.test('the filters reach suggestion_candidates as its named arguments', async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(validReply));

  await suggest(
    deps(db, api.fetchImpl),
    request({
      medium: 'movie',
      genres: ['Drama'],
      excludeGenres: ['Horror'],
      maxMinutes: 120,
      providerIds: [8, 337],
      region: 'GB',
      includeBacklog: true,
    }),
  );

  assertEquals(log.candidateArgs, [{
    p_medium: 'movie',
    p_genres: ['Drama'],
    p_exclude_genres: ['Horror'],
    p_max_minutes: 120,
    p_platforms: null,
    p_provider_ids: [8, 337],
    p_region: 'GB',
    p_include_backlog: true,
    p_limit: 30,
  }]);
  assertEquals(log.tierLists, ['movie:loved', 'movie:liked']);
});

Deno.test('the taste context is Loved then Liked, top ten, scored by the band math', async () => {
  const { db } = fakeDb();

  const taste = await loadTaste(db, 'game');

  assertEquals(taste.top.map((item) => item.title), TOP_TEN);
  // Loved has four: 10, 9.5, 9, 8.5. Liked has eight from 8.4 down.
  assertEquals(taste.top.slice(0, 5).map((item) => item.score), [10, 9.5, 9, 8.5, 8.4]);
  assertEquals(taste.top[9]!.score, 7.0);
  // packages/core scoreForPosition: a lone item sits at the band midpoint.
  assertEquals(scoreForPosition('loved', 0, 1), 9.3);
  assertEquals(scoreForPosition('liked', 0, 1), 7.5);
  assertEquals(taste.dropped, DROPPED);
  assertEquals(taste.notes, NOTES);
});

Deno.test('the body is validated, normalised, and strict about unknown fields', () => {
  const parsed = parseSuggestRequest({
    medium: 'game',
    genres: [' Roguelike ', 'Roguelike', 'Puzzle'],
    platforms: [],
    region: 'gb',
    note: '  something short  ',
  });
  assert(parsed.ok);
  assertEquals(parsed.value, {
    medium: 'game',
    genres: ['Roguelike', 'Puzzle'],
    excludeGenres: null,
    maxMinutes: null,
    platforms: null,
    providerIds: null,
    region: 'GB',
    includeBacklog: false,
    note: 'something short',
    language: 'en',
  });

  const refusals: [unknown, string][] = [
    [{}, 'medium'],
    [{ medium: 'book' }, 'medium'],
    [{ medium: 'game', exclude_genres: ['Horror'] }, 'unknown field: exclude_genres'],
    [{ medium: 'game', maxMinutes: 0 }, 'maxMinutes'],
    [{ medium: 'game', providerIds: ['8'] }, 'providerIds'],
    [{ medium: 'game', note: 'x'.repeat(281) }, 'at most 280'],
    [{ medium: 'game', region: 'USA' }, 'region'],
    [{ medium: 'game', language: 'fr' }, 'language must be one of en, es'],
    [{ medium: 'game', language: 'es-419' }, 'language'],
    [[], 'JSON object'],
  ];
  for (const [body, message] of refusals) {
    const result = parseSuggestRequest(body);
    assertFalse(result.ok, JSON.stringify(body));
    if (!result.ok) assertStringIncludes(result.error, message);
  }
});

// -- The person's language -----------------------------------------------------

Deno.test('the language is read from the body, English when absent', () => {
  const spanish = parseSuggestRequest({ medium: 'movie', language: 'es' });
  assert(spanish.ok);
  assertEquals(spanish.value.language, 'es');
  const english = parseSuggestRequest({ medium: 'movie', language: 'en' });
  assert(english.ok);
  assertEquals(english.value.language, 'en');
  const absent = parseSuggestRequest({ medium: 'movie', language: null });
  assert(absent.ok);
  assertEquals(absent.value.language, 'en');
});

Deno.test('English sends the system prompt unchanged; Spanish adds the one rule', async () => {
  assertEquals(systemPrompt('en'), SYSTEM_PROMPT);
  assertEquals(systemPrompt(), SYSTEM_PROMPT);
  const spanish = systemPrompt('es');
  assert(spanish.startsWith(SYSTEM_PROMPT));
  assertStringIncludes(spanish, '8. Write every reason in Latin American Spanish');
  assertStringIncludes(spanish, 'tú');
  assertStringIncludes(spanish, `"${STRETCH_ES}"`);
  assertEquals(STRETCH_ES, 'una apuesta');

  const { db } = fakeDb();
  const api = stubFetch(jsonResponse(validReply));
  await suggest(deps(db, api.fetchImpl), request({ language: 'es' }));
  const body = api.calls[0]!.body;
  assertEquals(body.system, spanish);
  const pick = body.output_config.format.schema.properties.pick1 as unknown as {
    properties: { reason: { description: string } };
  };
  assertStringIncludes(pick.properties.reason.description, 'Latin American Spanish');
  assertStringIncludes(pick.properties.reason.description, `"${STRETCH_ES}"`);
});

Deno.test("a Spanish request's fallback writes the template reasons in Spanish", async () => {
  const { db, log } = fakeDb();
  const api = stubFetch(jsonResponse(invalidReply));

  const body = ok(await suggest(deps(db, api.fetchImpl, []), request({ language: 'es' })));

  assert(body.fallback);
  assertEquals(body.picks.map((pick) => pick.reason), [
    'Porque pusiste Hades en “Me encantó” y comparte el género Roguelike.',
    'Porque pusiste Outer Wilds en “Me encantó” y comparte el género Puzzle.',
    'Porque pusiste Slay the Spire en “Me gustó” y comparte el género Card & Board Game.',
  ]);
  assertEquals(body.picks.map((pick) => pick.because), [['Hades'], ['Outer Wilds'], ['Slay the Spire']]);
  assertEquals(log.suggestionRows[0]!.request.language, 'es');
});

Deno.test('the short list says the rating line in Spanish too', async () => {
  const two = [CANDIDATES[8]!, CANDIDATES[29]!];
  const { db } = fakeDb({ candidates: two });
  const api = stubFetch(jsonResponse(validReply));

  const body = ok(await suggest(deps(db, api.fetchImpl), request({ language: 'es' })));

  assertEquals(api.calls.length, 0);
  assertEquals(body.picks.map((pick) => pick.reason), [
    'Porque pusiste Celeste en “Me encantó” y comparte el género Platform.',
    'Entre los juegos mejor valorados que coinciden con tus filtros.',
  ]);
});
