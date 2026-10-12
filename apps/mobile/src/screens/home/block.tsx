/**
 * The one piece of chrome all three Home blocks share that is Home's own.
 *
 * The other two that used to live here — `BlockError` and `Skeleton` — were
 * this screen's copies of the loading and error states specs/README.md defines
 * for every screen and the frames never drew. Five screens had built their own;
 * Phase 3 promoted one of each to `@/ui` as `ErrorLine` and `Skeleton`, and
 * the blocks import them from there now.
 */

import { Text } from '@/ui';

/** A block's heading: 22 bold, the same on all three. */
export function BlockTitle({ children }: { children: string }) {
  return <Text style="title-2">{children}</Text>;
}
