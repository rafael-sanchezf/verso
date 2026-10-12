/**
 * The personal suggestion, end to end, with the database and the network
 * injected so suggest.test.ts can drive every branch without either.
 *
 * docs/design/recommendation-engine.md, "PR B, the `suggest` Edge Function".
 * In order:
 *
 *   1. **The meter.** `count_suggestion_requests('24 hours')` against the daily
 *      limit (SUGGEST_DAILY_LIMIT, default 20). At or over it the answer is a
 *      429 and nothing else runs: no candidates, no model call, no row.
 *   2. **Candidates.** `suggestion_candidates` with the request's filters, at
 *      most 30 rows, best predicted first. SQL owns the score.
 *   3. **The taste context.** Loved and Liked from `tier_list`, the top ten by
 *      the derived score; up to five dropped entries; up to five recent notes.
 *      Never the comparison log.
 *   4. **Fewer than three candidates** is not a choice: they are returned with
 *      a template reason and the model is not called.
 *   5. **One Messages API call** whose structured output can only name the
 *      labels it was sent (prompt.ts). The reply is validated here again --
 *      three distinct labels, each in the sent set, `because` drawn from the
 *      user's own titles -- and any failure at all (network, non-200, a
 *      refusal, any other stop than end_turn, a label outside the list, a
 *      repeat) falls back to SQL's top three with a template reason built from
 *      `why`, and the response says `fallback: true`.
 *   6. **The logs.** One `suggestion_requests` row (the meter's unit, with the
 *      token counts) and one `prediction_log` row per pick, whose `request_id`
 *      is that row's id. Both tables are owner-insert under Row Level Security,
 *      so the caller's own client writes them. A failed write is an error, not
 *      a warning: a suggestion that is not recorded is one the meter never
 *      counted.
 *
 * The API call is raw HTTP rather than the Anthropic SDK. An `npm:` import in a
 * module the Deno tests load makes `deno test` resolve npm packages against the
 * monorepo's package.json, which fails (and rewrites that file) in this repo;
 * the existing functions keep their one npm import, supabase-js, in index.ts
 * for the same reason. The request shape follows the claude-api skill's
 * documented Messages API: `x-api-key`, `anthropic-version: 2023-06-01`,
 * `output_config.format` of type `json_schema`, adaptive thinking at the effort
 * prompt.ts sets. The reply may open with `thinking` blocks before its text, so
 * the answer is the block whose type is `text`, never the first block.
 */

import {
  buildMessagesRequest,
  citableTitles,
  decadeLabel,
  labelFor,
  type LabeledCandidate,
  mediumNoun,
  plainFeature,
  toNumber,
} from './prompt.ts';

/**
 * Claude Haiku 5.5, released 2026-10-07 (platform.claude.com, the Haiku 5.5
 * overview and migration guide, checked 2026-10-08). It replaced Claude Haiku
 * 4.5, the default from 2026-09-24 to 2026-10-08.
 */
export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const DEFAULT_DAILY_LIMIT = 20;
/** The meter's window, as a Postgres interval. */
export const METER_WINDOW = '24 hours';
/** What `suggestion_candidates` is asked for, and the most the prompt ever carries. */
export const MAX_CANDIDATES = 30;
/**
 * The ceiling on everything the model writes, thinking included. The answer is
 * three picks of under 25 words plus the JSON around them: about 200 tokens on
 * Haiku 4.5, about 260 on Haiku 5.5, whose tokenizer counts the same text as
 * about 30% more. Haiku 5.5 thinks first (adaptive, at effort low), and those
 * tokens count against this ceiling too: a ceiling hit after the thinking
 * block and before the text leaves no answer at all. 4,000 is about fifteen
 * times the answer, so a long think still has room to answer. Only what is
 * written is billed, so the ceiling costs nothing in normal use, and a reply
 * that does use all of it costs $0.002 at $0.50 per million output tokens;
 * API_TIMEOUT_MS, not this, bounds the wait.
 */
export const MAX_OUTPUT_TOKENS = 4_000;
export const REASON_MAX_CHARS = 200;
export const MAX_BECAUSE = 2;
/** `model_version` when SQL's order and a template reason are what the user sees. */
export const SQL_MODEL_VERSION = 'sql-top3';
export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
/**
 * Haiku 4.5 answered this in two or three seconds. Haiku 5.5 thinks first and
 * has not been timed here yet; twenty seconds leaves it room. The Edge
 * Function's wall clock is 150.
 */
export const API_TIMEOUT_MS = 20_000;
export const NOTE_MAX_CHARS = 280;

const TASTE_TOP = 10;
const DROPPED_MAX = 5;
const NOTES_MAX = 5;
const TASTE_NOTE_CHARS = 160;

export type Medium = 'game' | 'movie' | 'tv';
export type Tier = 'loved' | 'liked' | 'fine' | 'disliked';
export const MEDIA: readonly Medium[] = ['game', 'movie', 'tv'];

/** The validated body. Arrays that were absent or empty are null, which is "no filter" to SQL. */
export interface SuggestRequest {
  medium: Medium;
  genres: string[] | null;
  excludeGenres: string[] | null;
  maxMinutes: number | null;
  platforms: string[] | null;
  providerIds: number[] | null;
  region: string;
  includeBacklog: boolean;
  /** Free text, the user's own words. Context for the model, never a filter. */
  note: string | null;
}

export interface WhyFeature {
  feature: string;
  weight: number | string;
}

/** A row of `suggestion_candidates`, as PostgREST returns it. */
export interface CandidateRow {
  media_item_id: string;
  title: string;
  year: number | null;
  cover_image_id: string | null;
  genres: string[] | null;
  minutes: number | null;
  prior_score: number | string | null;
  content_score: number | string | null;
  predicted_score: number | string | null;
  confidence: string;
  why: WhyFeature[] | null;
  /** Not in the first version's return table; read if a later one adds it. */
  developer?: string | null;
  developers?: string[] | null;
  director?: string | null;
  directors?: string[] | null;
}

/** A row of `tier_list`. Only the columns read here. */
export interface TierListRow {
  media_item_id: string;
  position: number;
  title: string;
  year: number | null;
  cover_image_id?: string | null;
  genres: string[] | null;
  platforms: string[] | null;
}

export interface TasteItem {
  mediaItemId: string;
  title: string;
  year: number | null;
  tier: 'loved' | 'liked';
  score: number;
  genres: string[];
  platforms: string[];
}

export interface DroppedEntry {
  title: string;
  year: number | null;
  note: string | null;
}

export interface NoteEntry {
  title: string;
  status: string;
  note: string;
}

export interface TasteContext {
  /** Loved then Liked, best first, at most ten. */
  top: TasteItem[];
  dropped: DroppedEntry[];
  notes: NoteEntry[];
}

/** `suggestion_candidates`' named arguments, exactly as the RPC takes them. */
export interface SuggestionCandidatesArgs {
  p_medium: Medium;
  p_genres: string[] | null;
  p_exclude_genres: string[] | null;
  p_max_minutes: number | null;
  p_platforms: string[] | null;
  p_provider_ids: number[] | null;
  p_region: string;
  p_include_backlog: boolean;
  p_limit: number;
}

export type FallbackReason =
  | 'network_error'
  | 'timeout'
  | 'http_error'
  | 'bad_response'
  | 'refusal'
  | 'not_finished'
  | 'schema_mismatch'
  | 'unknown_label'
  | 'duplicate_label'
  | 'unknown_title';

/** What `suggestion_requests.picks` holds: the picks, and whether the model's survived. */
export interface LoggedPicks {
  fallback: boolean;
  fallbackReason: FallbackReason | null;
  items: { label: string; mediaItemId: string; reason: string; because: string[] }[];
}

export interface SuggestionRequestRow {
  user_id: string;
  medium: Medium;
  kind: 'personal';
  model: string;
  input_tokens: number;
  output_tokens: number;
  candidate_count: number;
  request: SuggestRequest;
  picks: LoggedPicks;
}

export interface PredictionLogRow {
  user_id: string;
  medium: Medium;
  media_item_id: string;
  surface: 'suggest';
  predicted_score: number | null;
  confidence: string;
  model_version: string;
  components: {
    label: string;
    prior_score: number | null;
    content_score: number | null;
    why: WhyFeature[];
  };
  request_id: string;
}

/**
 * Everything suggest() needs from Postgres. index.ts implements it on the
 * caller's own client, so every call runs under the caller's Row Level Security.
 */
export interface SuggestDb {
  /** `count_suggestion_requests(p_since)`: the caller's rows in the window. */
  countRequests(since: string): Promise<number>;
  /** `suggestion_candidates(...)`. */
  candidates(args: SuggestionCandidatesArgs): Promise<CandidateRow[]>;
  /** `tier_list(p_medium, p_tier)`. */
  tierList(medium: Medium, tier: Tier): Promise<TierListRow[]>;
  /** The caller's `user_entries` with status `dropped`, most recent first. */
  droppedEntries(medium: Medium, limit: number): Promise<DroppedEntry[]>;
  /** The caller's other `user_entries` with a note, most recent first. */
  recentNotes(medium: Medium, limit: number): Promise<NoteEntry[]>;
  /** Insert one `suggestion_requests` row; returns its id. */
  insertSuggestionRequest(row: SuggestionRequestRow): Promise<string>;
  insertPredictions(rows: PredictionLogRow[]): Promise<void>;
}

export interface SuggestDeps {
  db: SuggestDb;
  /** The caller, from the verified session. Written on both log rows. */
  userId: string;
  apiKey: string;
  model?: string;
  dailyLimit?: number;
  /** Swapped for a stub in tests. */
  fetchImpl?: typeof fetch;
  messagesUrl?: string;
  timeoutMs?: number;
  /** Where a fallback's cause is reported. console.error by default. */
  logError?: (message: string) => void;
}

export interface SuggestPick {
  mediaItemId: string;
  title: string;
  year: number | null;
  coverImageId: string | null;
  reason: string;
  /** The user's own titles the reason cites. */
  because: string[];
  predictedScore: number | null;
  confidence: string;
}

export interface SuggestResponse {
  /** The `suggestion_requests` row, or null when there was nothing to suggest. */
  requestId: string | null;
  /** The model whose picks these are, or `sql-top3`. */
  model: string;
  /** True when the model was asked and its answer was not used. */
  fallback: boolean;
  picks: SuggestPick[];
  /** The candidate rows exactly as `suggestion_candidates` returned them. */
  candidates: CandidateRow[];
}

export interface LimitReached {
  error: 'daily_limit_reached';
  message: string;
  limit: number;
  used: number;
}

export type SuggestOutcome =
  | { status: 200; body: SuggestResponse }
  | { status: 429; body: LimitReached };

interface Usage {
  input: number;
  output: number;
}

interface Choice {
  candidate: LabeledCandidate;
  reason: string;
  because: string[];
}

const NO_USAGE: Usage = { input: 0, output: 0 };

export async function suggest(deps: SuggestDeps, request: SuggestRequest): Promise<SuggestOutcome> {
  const limit = deps.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  const model = deps.model ?? DEFAULT_MODEL;

  // 1. The meter, before anything that costs.
  const used = await deps.db.countRequests(METER_WINDOW);
  if (used >= limit) {
    return {
      status: 429,
      body: {
        error: 'daily_limit_reached',
        message: `Suggestion limit reached: ${limit} in 24 hours. Try again later.`,
        limit,
        used,
      },
    };
  }

  // 2. Candidates. Sliced as well as asked for, so the prompt's bound does not
  // depend on the SQL function honouring p_limit.
  const rows = (await deps.db.candidates(candidateArgs(request))).slice(0, MAX_CANDIDATES);
  if (rows.length === 0) {
    return {
      status: 200,
      body: { requestId: null, model: SQL_MODEL_VERSION, fallback: false, picks: [], candidates: [] },
    };
  }
  const labeled = rows.map((row, index) => ({ label: labelFor(index), row }));

  // 3. The taste context. The template reasons need it too.
  const taste = await loadTaste(deps.db, request.medium);

  // 4. Too few to choose from: show them, say why from `why`, skip the model.
  if (labeled.length < 3) {
    const choices = labeled.map((candidate) => templateChoice(candidate, taste, request.medium));
    return {
      status: 200,
      body: await record(deps, request, labeled, {
        requestModel: SQL_MODEL_VERSION,
        modelVersion: SQL_MODEL_VERSION,
        usage: NO_USAGE,
        fallback: false,
        fallbackReason: null,
        choices,
      }),
    };
  }

  // 5. One call. Anything short of a clean answer is SQL's top three.
  const attempt = await askModel(deps, model, request, taste, labeled);
  if (attempt.ok) {
    return {
      status: 200,
      body: await record(deps, request, labeled, {
        requestModel: model,
        modelVersion: model,
        usage: attempt.usage,
        fallback: false,
        fallbackReason: null,
        choices: attempt.choices,
      }),
    };
  }

  (deps.logError ?? console.error)(`suggest: fell back to SQL (${attempt.reason}): ${attempt.detail}`);
  return {
    status: 200,
    body: await record(deps, request, labeled, {
      // The row records what was attempted and what it cost; the picks'
      // model_version records what the user actually saw.
      requestModel: model,
      modelVersion: SQL_MODEL_VERSION,
      usage: attempt.usage,
      fallback: true,
      fallbackReason: attempt.reason,
      choices: labeled.slice(0, 3).map((candidate) => templateChoice(candidate, taste, request.medium)),
    }),
  };
}

export function candidateArgs(request: SuggestRequest): SuggestionCandidatesArgs {
  return {
    p_medium: request.medium,
    p_genres: request.genres,
    p_exclude_genres: request.excludeGenres,
    p_max_minutes: request.maxMinutes,
    p_platforms: request.platforms,
    p_provider_ids: request.providerIds,
    p_region: request.region,
    p_include_backlog: request.includeBacklog,
    p_limit: MAX_CANDIDATES,
  };
}

// -- The taste context ---------------------------------------------------------

export async function loadTaste(db: SuggestDb, medium: Medium): Promise<TasteContext> {
  const [loved, liked, dropped, notes] = await Promise.all([
    db.tierList(medium, 'loved'),
    db.tierList(medium, 'liked'),
    db.droppedEntries(medium, DROPPED_MAX),
    db.recentNotes(medium, NOTES_MAX),
  ]);

  // Loved's band sits wholly above Liked's, so "top ten by score" is Loved in
  // order, then Liked in order; the sort is stable, so rounding ties keep the
  // user's own order.
  const top = [...scored(loved, 'loved'), ...scored(liked, 'liked')]
    .sort((a, b) => b.score - a.score)
    .slice(0, TASTE_TOP);

  return {
    top,
    dropped: dropped.slice(0, DROPPED_MAX).map((entry) => ({
      title: entry.title,
      year: entry.year,
      note: entry.note ? capText(entry.note, TASTE_NOTE_CHARS) : null,
    })),
    notes: notes
      .filter((entry) => typeof entry.note === 'string' && entry.note.trim() !== '')
      .slice(0, NOTES_MAX)
      .map((entry) => ({ ...entry, note: capText(entry.note, TASTE_NOTE_CHARS) })),
  };
}

function scored(rows: TierListRow[], tier: 'loved' | 'liked'): TasteItem[] {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  return ordered.map((row, index) => ({
    mediaItemId: row.media_item_id,
    title: row.title,
    year: row.year,
    tier,
    score: scoreForPosition(tier, index, ordered.length),
    genres: row.genres ?? [],
    platforms: row.platforms ?? [],
  }));
}

const TIER_BANDS = { loved: [8.5, 10], liked: [6.5, 8.4] } as const;

/**
 * packages/core/src/ranking.ts `scoreForPosition`, restated for the two tiers
 * read here: linear inside the tier's band, best at the top, a lone item at the
 * midpoint, one decimal. Restated rather than imported because an Edge
 * Function is bundled from supabase/functions alone.
 */
export function scoreForPosition(tier: 'loved' | 'liked', position: number, size: number): number {
  const [low, high] = TIER_BANDS[tier];
  if (size <= 1) return round1((low + high) / 2);
  return round1(high - (high - low) * (position / (size - 1)));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// -- The model call ------------------------------------------------------------

type ModelAttempt =
  | { ok: true; usage: Usage; choices: Choice[] }
  | { ok: false; usage: Usage; reason: FallbackReason; detail: string };

async function askModel(
  deps: SuggestDeps,
  model: string,
  request: SuggestRequest,
  taste: TasteContext,
  candidates: LabeledCandidate[],
): Promise<ModelAttempt> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const body = buildMessagesRequest(model, MAX_OUTPUT_TOKENS, request, taste, candidates);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? API_TIMEOUT_MS);
  let status: number;
  let text: string;
  try {
    const response = await fetchImpl(deps.messagesUrl ?? MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': deps.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    status = response.status;
    text = await response.text();
  } catch (cause) {
    return {
      ok: false,
      usage: NO_USAGE,
      reason: controller.signal.aborted ? 'timeout' : 'network_error',
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    clearTimeout(timer);
  }

  if (status < 200 || status > 299) {
    // The API's error body names the problem (overloaded, invalid model, bad
    // schema) and carries nothing of the user's; the request is never logged.
    return { ok: false, usage: NO_USAGE, reason: 'http_error', detail: `HTTP ${status}: ${text.slice(0, 300)}` };
  }

  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error('not an object');
    message = parsed;
  } catch {
    return {
      ok: false,
      usage: NO_USAGE,
      reason: 'bad_response',
      detail: 'the API answered 200 with a body that is not a message',
    };
  }

  // Billed whether or not the answer is usable, so read before anything can fail.
  const usage = readUsage(message.usage);

  // By type, never by position: Haiku 5.5's reply can open with a `thinking`
  // block (empty text by default) before the answer's text block.
  const block = Array.isArray(message.content)
    ? message.content.find((entry) => isRecord(entry) && entry.type === 'text' && typeof entry.text === 'string')
    : undefined;

  if (message.stop_reason === 'refusal') {
    // Haiku 5.5's safety classifiers declined. Nothing retries it on another
    // model; SQL's three are the answer. Only the category is logged: like the
    // request, the free-text explanation stays out of the logs.
    return {
      ok: false,
      usage,
      reason: 'refusal',
      detail: `stop_reason refusal, category ${refusalCategory(message.stop_details)}`,
    };
  }
  if (message.stop_reason !== 'end_turn') {
    // max_tokens cuts the JSON off. With no text block at all, thinking used
    // the whole ceiling, which says MAX_OUTPUT_TOKENS is too low.
    const missing = isRecord(block) ? '' : ', no text block';
    return { ok: false, usage, reason: 'not_finished', detail: `stop_reason ${String(message.stop_reason)}${missing}` };
  }

  if (!isRecord(block)) {
    return { ok: false, usage, reason: 'bad_response', detail: 'no text block in the answer' };
  }

  let answer: unknown;
  try {
    answer = JSON.parse(block.text as string);
  } catch {
    return { ok: false, usage, reason: 'schema_mismatch', detail: 'the answer is not JSON' };
  }

  const checked = readPicks(answer, candidates, citableTitles(taste));
  if (!checked.ok) return { ok: false, usage, reason: checked.reason, detail: checked.detail };
  return { ok: true, usage, choices: checked.choices };
}

/**
 * The usage block's input and output. Input is the sum of the three input
 * counters, because `input_tokens` alone is only the uncached remainder once
 * any caching is in play; nothing here caches today, so the two are equal.
 * Output includes the thinking tokens, which are billed as output.
 */
function readUsage(usage: unknown): Usage {
  if (!isRecord(usage)) return NO_USAGE;
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  return {
    input: count(usage.input_tokens) + count(usage.cache_creation_input_tokens) +
      count(usage.cache_read_input_tokens),
    output: count(usage.output_tokens),
  };
}

/** `stop_details.category` on a refusal: an open set of short names, or null. */
function refusalCategory(details: unknown): string {
  if (!isRecord(details) || typeof details.category !== 'string') return 'none';
  return JSON.stringify(details.category.slice(0, 40));
}

type PickCheck =
  | { ok: true; choices: Choice[] }
  | { ok: false; reason: FallbackReason; detail: string };

/**
 * The server-side half of the grounding. The schema already constrains the
 * labels and titles; this refuses anything that got past it, maps each label
 * back to its row, and applies the two limits the schema cannot express.
 */
export function readPicks(
  answer: unknown,
  candidates: LabeledCandidate[],
  titles: string[],
): PickCheck {
  if (!isRecord(answer)) return { ok: false, reason: 'schema_mismatch', detail: 'the answer is not an object' };

  const byLabel = new Map(candidates.map((candidate) => [candidate.label, candidate]));
  const citable = new Set(titles);
  const seen = new Set<string>();
  const choices: Choice[] = [];

  for (const key of ['pick1', 'pick2', 'pick3'] as const) {
    const pick = answer[key];
    if (!isRecord(pick)) return { ok: false, reason: 'schema_mismatch', detail: `${key} is missing` };

    const label = pick.label;
    if (typeof label !== 'string') {
      return { ok: false, reason: 'schema_mismatch', detail: `${key}.label is not a string` };
    }
    const candidate = byLabel.get(label);
    if (!candidate) {
      return {
        ok: false,
        reason: 'unknown_label',
        detail: `${key}.label ${JSON.stringify(label.slice(0, 20))} was not sent`,
      };
    }
    if (seen.has(label)) {
      return { ok: false, reason: 'duplicate_label', detail: `${key}.label ${label} repeats an earlier pick` };
    }
    seen.add(label);

    if (typeof pick.reason !== 'string' || pick.reason.trim() === '') {
      return { ok: false, reason: 'schema_mismatch', detail: `${key}.reason is empty` };
    }

    let because: string[] = [];
    if (pick.because !== undefined) {
      if (!Array.isArray(pick.because) || pick.because.some((title) => typeof title !== 'string')) {
        return { ok: false, reason: 'schema_mismatch', detail: `${key}.because is not a list of titles` };
      }
      // The user's own titles are not logged, only that one was out of place.
      if (pick.because.some((title) => !citable.has(title as string))) {
        return { ok: false, reason: 'unknown_title', detail: `${key}.because cites a title outside their list` };
      }
      because = [...new Set(pick.because as string[])].slice(0, MAX_BECAUSE);
    }

    choices.push({ candidate, reason: capText(pick.reason, REASON_MAX_CHARS), because });
  }

  return { ok: true, choices };
}

/**
 * Collapse whitespace and cut at about `max` characters, on a word boundary
 * when one is near, with an ellipsis. The model is asked for under 25 words
 * (about 150 characters); this is the ceiling the card is laid out for.
 */
export function capText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '');
  return `${base}…`;
}

// -- Template reasons ----------------------------------------------------------

function templateChoice(candidate: LabeledCandidate, taste: TasteContext, medium: Medium): Choice {
  return { candidate, ...templateReason(candidate.row, taste, medium) };
}

/**
 * A reason written from SQL's own `why`, for the fallback and for the short
 * list: the strongest feature that one of the user's Loved or Liked items
 * shares, named with that item ("Because you put Hades in Loved and this
 * shares the Roguelike genre."). Features `tier_list` cannot match on (a
 * developer, a director) fall through to the next; with no match the strongest
 * feature is named alone, and with no features at all the reason says it is
 * the rating that put it there.
 */
export function templateReason(
  row: CandidateRow,
  taste: TasteContext,
  medium: Medium,
): { reason: string; because: string[] } {
  const features = (row.why ?? [])
    .filter((entry) => typeof entry?.feature === 'string' && Number(entry.weight) > 0)
    .sort((a, b) => Number(b.weight) - Number(a.weight));

  for (const entry of features) {
    const colon = entry.feature.indexOf(':');
    if (colon < 0) continue;
    const kind = entry.feature.slice(0, colon).trim();
    const value = entry.feature.slice(colon + 1).trim();
    const trait = sharedTrait(kind, value);
    if (!trait) continue;
    const item = taste.top.find((candidate) => trait.matches(candidate));
    if (item) {
      return {
        reason: `Because you put ${item.title} in ${item.tier === 'loved' ? 'Loved' : 'Liked'} and ${trait.phrase}.`,
        because: [item.title],
      };
    }
  }

  if (features.length > 0) {
    return { reason: `Fits your taste for ${plainFeature(features[0]!.feature)}.`, because: [] };
  }
  return { reason: `Among the best-rated ${mediumNoun(medium)} that fit your filters.`, because: [] };
}

function sharedTrait(
  kind: string,
  value: string,
): { phrase: string; matches: (item: TasteItem) => boolean } | null {
  const same = (a: string) => a.trim().toLowerCase() === value.toLowerCase();
  switch (kind) {
    case 'genre':
      return { phrase: `this shares the ${value} genre`, matches: (item) => item.genres.some(same) };
    case 'platform':
      return { phrase: `this is also on ${value}`, matches: (item) => item.platforms.some(same) };
    case 'decade': {
      const start = Number(decadeLabel(value).slice(0, 4));
      if (!Number.isInteger(start)) return null;
      return {
        phrase: `this is also from the ${start}s`,
        matches: (item) => item.year !== null && Math.floor(item.year / 10) * 10 === start,
      };
    }
    default:
      return null;
  }
}

// -- The logs and the answer ---------------------------------------------------

async function record(
  deps: SuggestDeps,
  request: SuggestRequest,
  candidates: LabeledCandidate[],
  outcome: {
    requestModel: string;
    modelVersion: string;
    usage: Usage;
    fallback: boolean;
    fallbackReason: FallbackReason | null;
    choices: Choice[];
  },
): Promise<SuggestResponse> {
  const requestId = await deps.db.insertSuggestionRequest({
    user_id: deps.userId,
    medium: request.medium,
    kind: 'personal',
    model: outcome.requestModel,
    input_tokens: outcome.usage.input,
    output_tokens: outcome.usage.output,
    candidate_count: candidates.length,
    request,
    picks: {
      fallback: outcome.fallback,
      fallbackReason: outcome.fallbackReason,
      items: outcome.choices.map((choice) => ({
        label: choice.candidate.label,
        mediaItemId: choice.candidate.row.media_item_id,
        reason: choice.reason,
        because: choice.because,
      })),
    },
  });

  await deps.db.insertPredictions(
    outcome.choices.map(({ candidate: { label, row } }) => ({
      user_id: deps.userId,
      medium: request.medium,
      media_item_id: row.media_item_id,
      surface: 'suggest',
      predicted_score: toNumber(row.predicted_score),
      confidence: row.confidence,
      model_version: outcome.modelVersion,
      components: {
        label,
        prior_score: toNumber(row.prior_score),
        content_score: toNumber(row.content_score),
        why: row.why ?? [],
      },
      request_id: requestId,
    })),
  );

  return {
    requestId,
    model: outcome.modelVersion,
    fallback: outcome.fallback,
    picks: outcome.choices.map(({ candidate: { row }, reason, because }) => ({
      mediaItemId: row.media_item_id,
      title: row.title,
      year: row.year,
      coverImageId: row.cover_image_id,
      reason,
      because,
      predictedScore: toNumber(row.predicted_score),
      confidence: row.confidence,
    })),
    candidates: candidates.map((candidate) => candidate.row),
  };
}

// -- The body ------------------------------------------------------------------

const REQUEST_KEYS = new Set([
  'medium',
  'genres',
  'excludeGenres',
  'maxMinutes',
  'platforms',
  'providerIds',
  'region',
  'includeBacklog',
  'note',
]);

class InvalidRequest extends Error {}

function refuse(message: string): never {
  throw new InvalidRequest(message);
}

/**
 * The POST body, checked. An unknown field is refused rather than ignored, so
 * a misspelt filter (`exclude_genres`) is an error the app sees instead of a
 * filter that silently did nothing.
 */
export function parseSuggestRequest(
  body: unknown,
): { ok: true; value: SuggestRequest } | { ok: false; error: string } {
  try {
    return { ok: true, value: readRequest(body) };
  } catch (cause) {
    if (cause instanceof InvalidRequest) return { ok: false, error: cause.message };
    throw cause;
  }
}

function readRequest(body: unknown): SuggestRequest {
  if (!isRecord(body)) refuse('the body must be a JSON object');
  for (const key of Object.keys(body)) {
    if (!REQUEST_KEYS.has(key)) refuse(`unknown field: ${key}`);
  }

  const medium = body.medium;
  if (typeof medium !== 'string' || !(MEDIA as readonly string[]).includes(medium)) {
    refuse('medium must be one of game, movie, tv');
  }

  const maxMinutes = body.maxMinutes ?? null;
  if (
    maxMinutes !== null &&
    !(typeof maxMinutes === 'number' && Number.isInteger(maxMinutes) && maxMinutes > 0 && maxMinutes <= 100_000)
  ) {
    refuse('maxMinutes must be a whole number of minutes');
  }

  const region = body.region ?? 'US';
  if (typeof region !== 'string' || !/^[A-Za-z]{2}$/.test(region)) {
    refuse('region must be a two-letter country code');
  }

  const includeBacklog = body.includeBacklog ?? false;
  if (typeof includeBacklog !== 'boolean') refuse('includeBacklog must be true or false');

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') refuse('note must be text');
    const trimmed = body.note.trim();
    if (trimmed.length > NOTE_MAX_CHARS) refuse(`note must be at most ${NOTE_MAX_CHARS} characters`);
    note = trimmed === '' ? null : trimmed;
  }

  return {
    medium: medium as Medium,
    genres: stringList(body.genres, 'genres'),
    excludeGenres: stringList(body.excludeGenres, 'excludeGenres'),
    maxMinutes: maxMinutes as number | null,
    platforms: stringList(body.platforms, 'platforms'),
    providerIds: idList(body.providerIds, 'providerIds'),
    region: region.toUpperCase(),
    includeBacklog,
    note,
  };
}

function stringList(value: unknown, name: string): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 20) refuse(`${name} must be a list of at most 20 names`);
  const names = value.map((entry) => {
    if (typeof entry !== 'string' || entry.trim() === '' || entry.trim().length > 100) {
      refuse(`${name} must be a list of non-empty names`);
    }
    return entry.trim();
  });
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique : null;
}

function idList(value: unknown, name: string): number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 50) refuse(`${name} must be a list of at most 50 ids`);
  for (const entry of value) {
    if (!Number.isInteger(entry) || entry <= 0 || entry > 2_147_483_647) {
      refuse(`${name} must be a list of positive whole numbers`);
    }
  }
  const unique = [...new Set(value as number[])];
  return unique.length > 0 ? unique : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
