/**
 * The Platforms screen's picks, and the way back from a profile's IGDB names to
 * the chips that produced them (specs/onboarding.md, "Platforms").
 *
 * The state is a set of pick ids from `PLATFORM_FAMILIES` in @verso/core. A
 * family has no state of its own: it reads as picked while any of its picks
 * is, which keeps the two from disagreeing. So:
 *
 *  - tapping an unpicked family picks its first generation (PS5, Series X|S,
 *    Switch 2, iOS; PC is its one pick);
 *  - tapping a picked family clears every chip it has;
 *  - a chip toggles on its own, and clearing a family's last chip unpicks the
 *    family with it, the same state the tile tap leaves.
 *
 * Continue writes `expandPlatforms(picks)`; the folds of the compatibility map
 * are applied there and never shown here (decision 27).
 *
 * Reading a profile back (`?edit=1`, and the deck's "Popular on" line): a pick
 * is on when every IGDB name it stands for is in the profile and no other
 * pick's folds already account for it. The second half keeps a PS5 player's
 * stored PS4 (a fold) from coming back as a PS4 chip they never tapped; a
 * player who tapped both gets the PS5 alone, which writes the same list.
 *
 * Relative imports only, no React (`test/onboarding-platform-picks.test.ts`).
 */

import {
  PLATFORM_FAMILIES,
  platformFamilyLabel,
  withBackwardCompatible,
  type PlatformFamilyGroup,
  type PlatformFamilyId,
  type PlatformPick,
  type PlatformPickId,
} from '@verso/core';

import { platformShortName } from '../../lib/format';
import { languageStore } from '../../lib/i18n/store';

export type PickSet = ReadonlySet<PlatformPickId>;

function familyOf(id: PlatformFamilyId): PlatformFamilyGroup {
  const group = PLATFORM_FAMILIES.find((family) => family.id === id);
  if (!group) throw new Error(`unknown platform family: ${id}`);
  return group;
}

/** Whether the family's tile reads as picked: any of its picks is. */
export function isFamilyPicked(picks: PickSet, family: PlatformFamilyId): boolean {
  return familyOf(family).picks.some((pick) => picks.has(pick.id));
}

/** A tap on a family's tile. */
export function toggleFamily(picks: PickSet, family: PlatformFamilyId): Set<PlatformPickId> {
  const group = familyOf(family);
  const next = new Set(picks);
  if (isFamilyPicked(picks, family)) {
    for (const pick of group.picks) next.delete(pick.id);
  } else {
    const first = group.picks[0];
    if (first) next.add(first.id);
  }
  return next;
}

/** A tap on one generation's chip. */
export function togglePick(picks: PickSet, pick: PlatformPickId): Set<PlatformPickId> {
  const next = new Set(picks);
  if (next.has(pick)) next.delete(pick);
  else next.add(pick);
  return next;
}

/** The picks in the order the screen draws them, for the write and the labels. */
export function orderedPicks(picks: PickSet): PlatformPick[] {
  return PLATFORM_FAMILIES.flatMap((family) => family.picks).filter((pick) => picks.has(pick.id));
}

/**
 * The picks a profile's platforms stand for: every pick whose names are all
 * there, less those another such pick's folds already cover.
 */
export function picksFromPlatforms(platforms: readonly string[] | null | undefined): Set<PlatformPickId> {
  const stored = new Set(platforms ?? []);
  const present = PLATFORM_FAMILIES.flatMap((family) => family.picks).filter(
    (pick) => pick.platforms.length > 0 && pick.platforms.every((name) => stored.has(name)),
  );

  const kept = present.filter((pick) => {
    const others = present.filter((other) => other.id !== pick.id);
    const folded = new Set(
      withBackwardCompatible(others.flatMap((other) => other.platforms)).filter(
        (name) => !others.some((other) => other.platforms.includes(name)),
      ),
    );
    // Implied: every name this pick stands for arrives as a fold of another.
    return !pick.platforms.every((name) => folded.has(name));
  });

  return new Set(kept.map((pick) => pick.id));
}

/**
 * A pick as the deck's meta line names it: the generation's short name (`PS5`,
 * `Xbox Series X|S`, `Switch 2`, `PC`), and the family's name for an "Older"
 * chip, whose own label means nothing out of its row. The family's name is in
 * the app's language (`Celular` for Mobile, wave 7); the test for "Older" reads
 * the English label, which is the pick's identity.
 */
export function pickShortName(pick: PlatformPick): string {
  if (pick.label === 'Older') return platformFamilyLabel(pick.family, languageStore.language());
  const first = pick.platforms[0];
  return first ? platformShortName(first) : pick.label;
}
