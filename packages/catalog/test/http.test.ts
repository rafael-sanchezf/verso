import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY_USER_AGENT,
  DEFAULT_TIMEOUT_MS,
  HttpError,
  HttpRateLimitedError,
  JsonClient,
  MAX_RETRY_AFTER_MS,
} from '../src/http';
import type { Clock } from '../src/rate-limit';

class TestClock implements Clock {
  time = 0;
  slept: number[] = [];
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.slept.push(ms);
    this.time += ms;
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function client(answers: Array<() => Response>, options: { clock?: TestClock } = {}) {
  const clock = options.clock ?? new TestClock();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let index = 0;

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const answer = answers[Math.min(index, answers.length - 1)]!;
    index += 1;
    return answer();
  }) as unknown as typeof fetch;

  return {
    http: new JsonClient({ name: 'Test host', fetchImpl: impl, clock, intervalMs: 10 }),
    calls,
    clock,
  };
}

describe('JsonClient', () => {
  it('names us on every request, GET and POST alike', async () => {
    const { http, calls } = client([() => json({ ok: true })]);

    await http.getJson('https://example.test/a');
    await http.postJson('https://example.test/b', [1, 2]);

    for (const call of calls) {
      const headers = new Headers(call.init!.headers as HeadersInit);
      expect(headers.get('user-agent')).toBe(AVAILABILITY_USER_AGENT);
      expect(headers.get('accept')).toBe('application/json');
    }
    expect(calls[1]!.init!.method).toBe('POST');
    expect(String(calls[1]!.init!.body)).toBe('[1,2]');
  });

  it('lets a caller override a header without losing the User-Agent', async () => {
    const { http, calls } = client([() => json({})]);

    await http.getJson('https://example.test/a', { 'ITAD-API-Key': 'k' });

    const headers = new Headers(calls[0]!.init!.headers as HeadersInit);
    expect(headers.get('itad-api-key')).toBe('k');
    expect(headers.get('user-agent')).toBe(AVAILABILITY_USER_AGENT);
  });

  it('retries a 429 with doubling backoff and then gives up on the host', async () => {
    const clock = new TestClock();
    const { http } = client([() => json({}, 429)], { clock });

    await expect(http.getJson('https://example.test/a')).rejects.toBeInstanceOf(
      HttpRateLimitedError,
    );
    expect(http.requestCount).toBe(4);
    expect(http.retryCount).toBe(3);
    expect(clock.slept).toEqual([2000, 4000, 8000]);
  });

  it('retries a 5xx and succeeds when the host recovers', async () => {
    const { http } = client([() => json({}, 500), () => json({ recovered: true })]);

    expect(await http.getJson('https://example.test/a')).toEqual({ recovered: true });
    expect(http.retryCount).toBe(1);
  });

  it('does not retry a 404: that is an answer, not a bad night', async () => {
    const { http } = client([() => json({}, 404)]);

    await expect(http.getJson('https://example.test/a')).rejects.toThrow(
      /Test host returned 404/,
    );
    expect(http.requestCount).toBe(1);
  });

  it('honours Retry-After instead of its own backoff', async () => {
    const clock = new TestClock();
    const { http } = client([() => json({}, 429, { 'retry-after': '3' })], { clock });

    await expect(http.getJson('https://example.test/a')).rejects.toBeInstanceOf(
      HttpRateLimitedError,
    );
    expect(clock.slept).toEqual([3000, 3000, 3000]);
  });

  it('treats an HTML error page behind a 200 as one lost answer', async () => {
    const impl = (async () =>
      new Response('<html>nope</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;

    const http = new JsonClient({ name: 'Test host', fetchImpl: impl, clock: new TestClock() });

    const error = await http.getJson('https://example.test/a').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).toMatch(/unparseable JSON/);
  });

  it('puts a deadline on every request, GET and POST alike', async () => {
    // The limiter is strictly serial, so a host that accepts a connection and
    // never answers would hold this source and every source after it until the
    // workflow's own kill -- which could land between an upsert and its
    // close-out. `requestTimeout` is the same helper wikidata.ts and
    // opencritic.ts use, and it yields nothing on a runtime without
    // AbortSignal.timeout, so the assertion is conditional on that.
    const { http, calls } = client([() => json({})]);

    await http.getJson('https://example.test/a');
    await http.postJson('https://example.test/b', []);

    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.init!.signal).toBeInstanceOf(AbortSignal);
      }
    }
  });

  it('gives each attempt its own deadline rather than sharing one', async () => {
    const { http, calls } = client([() => json({}, 500), () => json({ ok: true })]);

    await http.getJson('https://example.test/a');

    expect(calls).toHaveLength(2);
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      expect(calls[0]!.init!.signal).not.toBe(calls[1]!.init!.signal);
    }
  });

  it('paces requests to one host rather than firing them together', async () => {
    const clock = new TestClock();
    const { http } = client([() => json({})], { clock });

    await http.getJson('https://example.test/a');
    await http.getJson('https://example.test/b');
    await http.getJson('https://example.test/c');

    expect(clock.time).toBeGreaterThanOrEqual(20);
  });
});

describe('the Retry-After cap', () => {
  // The header itself is `retryAfterMs` in wikidata.ts, tested there. What is
  // this client's own is the ceiling it puts on the answer.
  it('waits no longer than the cap, however long the host asks for', async () => {
    const clock = new TestClock();
    const { http } = client([() => json({}, 429, { 'retry-after': '86400' })], { clock });

    await expect(http.getJson('https://example.test/a')).rejects.toBeInstanceOf(
      HttpRateLimitedError,
    );
    expect(clock.slept).toEqual([MAX_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS]);
  });

  it('falls back to its own doubling backoff when there is no header', async () => {
    const clock = new TestClock();
    const { http } = client([() => json({}, 429)], { clock });

    await expect(http.getJson('https://example.test/a')).rejects.toBeInstanceOf(
      HttpRateLimitedError,
    );
    expect(clock.slept).toEqual([2000, 4000, 8000]);
  });
});
