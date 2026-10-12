/**
 * Downloads the site's cover art once and writes it into `public/art/`, run
 * by hand, not by the build; its outputs are committed:
 *
 *   node apps/site/scripts/art-assets.mjs
 *
 * The page serves every cover itself, so a reader's browser asks Steam's and
 * TMDB's hosts for nothing (src/content/art.ts says why). This script is the
 * only place their addresses live: the sources below are fetched here, on
 * the developer's machine, and never reach the built site.
 *
 * Each source is scaled to the width `art.ts` gives it (twice the largest
 * CSS width the page shows it at) with the height at 2:3, and encoded as
 * WebP at quality 92, the shots' setting, by `cwebp` (libwebp; on a Mac,
 * `brew install webp`). Steam's 600 × 900 capsule and TMDB's `w500` poster
 * are both larger than any target, so every file is a downscale.
 *
 * Checked 2026-10-08: all 27 sources answered 200 with a 2:3 JPEG; the seven
 * added in the finalize round (2026-10-08) were checked the same way.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { art } from '../src/content/art.ts';

const SITE = path.resolve(fileURLToPath(import.meta.url), '../..');
const OUT = path.join(SITE, 'public/art');

/** Steam's library capsule at 600 × 900, by app id. */
const steam = (appId) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`;

/** TMDB's poster at w500 (500 × 750), by poster path, read from the film's themoviedb.org page. */
const tmdb = (posterPath) => `https://image.tmdb.org/t/p/w500/${posterPath}`;

/** Where each cover in art.ts comes from. */
const SOURCES = {
  hades: steam(1145360),
  stardewValley: steam(413150),
  portal2: steam(620),
  eldenRing: steam(1245620),
  outerWilds: steam(753640),
  baldursGate3: steam(1086940),
  terraria: steam(105600),
  witcher3: steam(292030),
  transistor: steam(237930),
  inside: steam(304430),
  undertale: steam(391540),
  persona5Royal: steam(1687950),
  southPark: steam(213670),

  duneTwo: tmdb('6izwz7rsy95ARzTR3poZ8H6c5pp.jpg'), // TMDB 693134
  darkKnight: tmdb('qJ2tW6WMUDux911r6m7haRef0WH.jpg'), // 155
  interstellar: tmdb('yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg'), // 157336
  inception: tmdb('xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg'), // 27205
  spiderVerse: tmdb('iiZZdoQBEYBv6id8su7ImL0oCbD.jpg'), // 324857
  toyStory: tmdb('uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg'), // 862
  paddington2: tmdb('1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg'), // 346648
  oppenheimer: tmdb('8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg'), // 872585
  arrival: tmdb('pEzNVQfdzYDzVK0XqxERIw2x2se.jpg'), // 329865
  everythingEverywhere: tmdb('u68AjlvlutfEIcpmbYpKcdi09ut.jpg'), // 545611
  getOut: tmdb('tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg'), // 419430
  topGunMaverick: tmdb('n0YuM4f5lvGAP6MAW2kBIzugXnc.jpg'), // 361743
  barbie: tmdb('iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg'), // 346698
  parasite: tmdb('7IiTTgloJzvGI1TAYymCfbfl3vT.jpg'), // 496243
  superbad: tmdb('ek8e8txUyUwd2BNqj6lFEerJfbq.jpg'), // 8363
  homeAlone: tmdb('onTSipZ8R3bliBdKfPtsDuHTdlL.jpg'), // 771
  bridesmaids: tmdb('gJtA7hYsBMQ7EM3sPBMUdBfU7a0.jpg'), // 55721
  thePrestige: tmdb('Ag2B2KHKQPukjH7WutmgnnSNurZ.jpg'), // 1124
  dune: tmdb('v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg'), // 438631
  duneLynch: tmdb('4kJmUCE7mkVJjXa7A0g2rY4IGTm.jpg'), // 841
  findingNemo: tmdb('eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg'), // 12
  wonka: tmdb('qhb1qOilapbapxWQn9jtRCMwXJF.jpg'), // 787699
  jurassicWorld: tmdb('rhr4y79GpxQF9IsfJItRXVaoGs4.jpg'), // 135397
};

const missing = Object.keys(art).filter((key) => !(key in SOURCES));
if (missing.length) throw new Error(`No source for ${missing.join(', ')}`);

fs.mkdirSync(OUT, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verso-art-'));
const kept = new Set();

for (const [key, file] of Object.entries(art)) {
  const response = await fetch(SOURCES[key]);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) {
    throw new Error(`${key}: ${SOURCES[key]} answered ${response.status} ${response.headers.get('content-type')}`);
  }
  const jpeg = path.join(temp, `${key}.jpg`);
  fs.writeFileSync(jpeg, Buffer.from(await response.arrayBuffer()));

  const name = path.basename(file.src);
  const target = path.join(OUT, name);
  execFileSync('cwebp', ['-quiet', '-q', '92', '-m', '6', '-metadata', 'none', '-resize', String(file.width), String(file.height), jpeg, '-o', target]);
  kept.add(name);
  console.log(`${name} ${file.width} × ${file.height} ${fs.statSync(target).size} bytes`);
}

/* A cover art.ts no longer names leaves the folder. */
for (const name of fs.readdirSync(OUT)) if (!kept.has(name)) fs.rmSync(path.join(OUT, name));
fs.rmSync(temp, { recursive: true });
