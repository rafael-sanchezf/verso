/**
 * The last check before a one-tap Playing or played write: Search's two
 * intents and the Next tab's Start button all go through it, so a game that is
 * not out is never marked as started or finished (phone feedback entry 10).
 */

import { describe, expect, it, vi } from 'vitest';

import { whenReleased } from '../src/lib/when-released';

const TODAY = '2026-09-23';

/** A write that records whether it ran. */
function write() {
  return vi.fn(async () => 'written' as const);
}

describe('whenReleased', () => {
  it('writes for a game that is out, and hands back what the write returned', async () => {
    const run = write();

    await expect(whenReleased(async () => '2020-09-17', run, { today: TODAY })).resolves.toEqual({
      released: true,
      value: 'written',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('writes for a game out today, and for an undated one', async () => {
    const run = write();

    await whenReleased(async () => TODAY, run, { today: TODAY });
    await whenReleased(async () => null, run, { today: TODAY });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('writes nothing for a game that is not out', async () => {
    const run = write();

    await expect(whenReleased(async () => '2026-09-24', run, { today: TODAY })).resolves.toEqual({
      released: false,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('writes nothing when the date cannot be read', async () => {
    const run = write();

    await expect(
      whenReleased(
        async () => {
          throw new Error('offline');
        },
        run,
        { today: TODAY },
      ),
    ).rejects.toThrow('offline');
    expect(run).not.toHaveBeenCalled();
  });
});
