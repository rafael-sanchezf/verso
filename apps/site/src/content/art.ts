/**
 * Cover art for the hero's ask, How it works' scenes and the movies Home,
 * served from the site itself (launch prep, 2026-10-08), so a reader's
 * browser asks no other host for anything (onboarding guidelines,
 * principle 12; CI's `site` job fails on a Steam or TMDB image host in the
 * built output).
 *
 * Each file in `public/art/` was downloaded once from the store's own image
 * host, Steam's library capsule (`library_600x900_2x.jpg`, 600 × 900) or
 * TMDB's poster (`w500`), scaled to twice the largest width the page shows
 * it at (measured at 360 to 1920 wide, both media), rounded up to a
 * multiple of 4, and encoded as WebP at quality 92, the way the shots in
 * `public/shots/` are. `scripts/art-assets.mjs` holds the sources (the
 * Steam app ids and TMDB poster paths, which stay out of this file so they
 * never reach the bundle) and redoes it from the sizes below:
 *
 *   node apps/site/scripts/art-assets.mjs
 *
 * The art is whole at its own 2:3, never cropped (rule 29), and `width` and
 * `height` are the files' own pixels. The footer still credits Steam, IGDB
 * and TMDB (TMDB's sentence word for word); the licence conversations start
 * in January 2027, before any paid tier (site brief, "The structure").
 *
 * No relative imports and only erasable TypeScript, so the script can load
 * this file with Node's own type stripping, as the logo script loads copy.ts.
 */

export interface Art {
  src: string;
  width: number;
  height: number;
}

/** Fact: a file in `public/art/`, `width` px wide at 2:3. */
const local = (name: string, width: number): Art => ({
  src: `/art/${name}.webp`,
  width,
  height: width * 1.5,
});

/*
 * Widths are twice the largest CSS width on the page, in the comment:
 * 19 is a row on the movies Ranking phone; 21 a result on the movies
 * Search phone; 26 a row in scene 2; 36 a pick in the hero's ask; 77 a small
 * card on the movies Home; 84 a cover in scene 1; 107 a cover in scene 3 at
 * 767 wide, where the steps stack and the scene is widest; 142 a large card
 * on the movies Home.
 */
export const art = {
  // Games, from Steam (the app id is in scripts/art-assets.mjs).
  hades: local('hades', 52), // 26
  stardewValley: local('stardew-valley', 72), // 36
  portal2: local('portal-2', 72), // 36
  eldenRing: local('elden-ring', 168), // 84
  outerWilds: local('outer-wilds', 52), // 26
  baldursGate3: local('baldurs-gate-3', 168), // 84
  terraria: local('terraria', 72), // 36
  witcher3: local('the-witcher-3', 216), // 107
  transistor: local('transistor', 216), // 107
  inside: local('inside', 216), // 107
  undertale: local('undertale', 216), // 107
  persona5Royal: local('persona-5-royal', 216), // 107
  southPark: local('south-park-the-stick-of-truth', 216), // 107

  // Films, from TMDB (the poster path is in scripts/art-assets.mjs).
  duneTwo: local('dune-part-two', 168), // 84
  darkKnight: local('the-dark-knight', 52), // 26
  interstellar: local('interstellar', 168), // 84
  inception: local('inception', 52), // 26
  spiderVerse: local('spider-man-into-the-spider-verse', 72), // 36
  toyStory: local('toy-story', 72), // 36
  paddington2: local('paddington-2', 72), // 36
  oppenheimer: local('oppenheimer', 216), // 107
  arrival: local('arrival', 216), // 107
  everythingEverywhere: local('everything-everywhere-all-at-once', 216), // 107
  getOut: local('get-out', 216), // 107
  topGunMaverick: local('top-gun-maverick', 284), // 142
  barbie: local('barbie', 216), // 107
  parasite: local('parasite', 284), // 142
  superbad: local('superbad', 156), // 77
  homeAlone: local('home-alone', 156), // 77
  bridesmaids: local('bridesmaids', 156), // 77
  thePrestige: local('the-prestige', 156), // 77
  dune: local('dune', 44), // 21
  duneLynch: local('dune-1984', 44), // 21
  findingNemo: local('finding-nemo', 40), // 19
  wonka: local('wonka', 40), // 19
  jurassicWorld: local('jurassic-world', 40), // 19
} satisfies Record<string, Art>;

export type ArtKey = keyof typeof art;
