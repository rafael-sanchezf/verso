import { describe, expect, it } from 'vitest';
import { RateLimiter, type Clock } from '../src/rate-limit';

/**
 * Virtual time: `sleep` advances the clock and resolves on the microtask
 * queue, so a test that would otherwise wait real seconds finishes instantly
 * while the limiter's arithmetic stays exactly as it is in production.
 */
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

/**
 * Let every pending microtask run. The limiter's admission path awaits several
 * promises per call, so counting individual ticks would be brittle; a macrotask
 * boundary drains all of them.
 */
function flush(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('RateLimiter', () => {
  it('admits up to perSecond requests without sleeping', async () => {
    const clock = new TestClock();
    const limiter = new RateLimiter({ perSecond: 4, maxInFlight: 8, clock });

    for (let i = 0; i < 4; i += 1) {
      await limiter.run(async () => i);
    }

    expect(clock.sleeps).toEqual([]);
  });

  it('sleeps out the rest of the window when the fifth request arrives', async () => {
    const clock = new TestClock();
    const limiter = new RateLimiter({ perSecond: 4, maxInFlight: 8, clock });

    for (let i = 0; i < 5; i += 1) {
      await limiter.run(async () => i);
    }

    // Four starts at t=0, so the fifth waits the full second.
    expect(clock.sleeps).toEqual([1000]);
    expect(clock.time).toBe(1000);
  });

  it('uses a rolling window, not a fixed one', async () => {
    const clock = new TestClock();
    const limiter = new RateLimiter({ perSecond: 2, maxInFlight: 8, clock });

    await limiter.run(async () => 0); // t=0
    clock.time = 600;
    await limiter.run(async () => 1); // t=600
    await limiter.run(async () => 2); // must wait until the t=0 start expires

    expect(clock.sleeps).toEqual([400]);
    expect(clock.time).toBe(1000);

    // The t=600 start is still inside the window, so the next one waits again.
    await limiter.run(async () => 3);
    expect(clock.sleeps).toEqual([400, 600]);
  });

  it('never runs more than maxInFlight at once', async () => {
    const clock = new TestClock();
    const limiter = new RateLimiter({ perSecond: 1000, maxInFlight: 2, clock });

    let concurrent = 0;
    let peak = 0;
    const gates = Array.from({ length: 6 }, () => deferred());

    const running = gates.map((gate, index) =>
      limiter.run(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await gate.promise;
        concurrent -= 1;
        return index;
      }),
    );

    // Let admission settle, then release the tasks one at a time.
    await flush();
    expect(concurrent).toBe(2);

    for (const gate of gates) {
      gate.resolve();
      await flush();
      expect(concurrent).toBeLessThanOrEqual(2);
    }

    await Promise.all(running);
    expect(peak).toBe(2);
    expect(limiter.peakInFlight).toBe(2);
  });

  it('releases the slot when the task throws', async () => {
    const clock = new TestClock();
    const limiter = new RateLimiter({ perSecond: 1000, maxInFlight: 1, clock });

    await expect(
      limiter.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // The single slot is free again, so this resolves rather than hanging.
    await expect(limiter.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('returns each task its own result in order of completion', async () => {
    const clock = new TestClock();
    const limiter = new RateLimiter({ perSecond: 4, maxInFlight: 4, clock });

    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => limiter.run(async () => n * 10)),
    );

    expect(results).toEqual([10, 20, 30, 40, 50, 60]);
  });
});
