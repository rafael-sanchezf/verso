/**
 * Cuts Rafa's mark into the site's icons and share image in `public/`, run
 * by hand as one command, not by the build; its outputs are committed:
 *
 *   pnpm --filter @verso/site logo
 *
 * (`next build`, for the site's own Inter in `out/`, then this script.)
 *
 * The source is the mark on the brand green, `src/brand/mark-white.svg`
 * (docs/design/assets/brand/verso-mark-white.svg byte for byte: the V white,
 * the play `#CDE8D3`), read by src/brand/mark.ts as the nav's mark is. Its
 * paths are checked against `src/brand/mark.svg` first, so the two files can
 * never carry two different drawings. Nothing is redrawn or traced: every
 * file nests his SVG, and the rasters are Chromium's render of it.
 *
 *   favicon.svg           the app icon at 32, rounded
 *   favicon.ico           the same at 16, 32 and 48, for /favicon.ico
 *   apple-touch-icon.png  the app icon at 180, square (iOS rounds it)
 *   og-image.png          1200 x 630, his board's billboard: the brand green,
 *                         the white mark, the tagline in white Inter, and the
 *                         wordmark small beside the mark
 *
 * The app icon is decision 31's: the `brand/primary` tile with the white V
 * and the pale play, the mark at 63% of the tile's height, centered on its
 * box, as `app-icon-1024.png` (the App Store master) draws it. The favicon's
 * corner is 22.5% of the side, near iOS's own. At 16 px the play becomes a
 * dot and the V carries the mark, as brand-identity.md expects.
 *
 * The share image follows the billboard (14:48 on the board, frame 227:119)
 * at the share image's shape: the mark at the left, the tagline beside it,
 * its first line's capitals level with the mark's top, and the wordmark under
 * the tagline as the lockup sets it, half the mark's width from the mark and
 * its baseline on the mark's apex.
 *
 * Where everything comes from, so nothing is restated:
 * - the colors: packages/tokens/tokens.json (`brand/primary` for the ground,
 *   `brand/on-primary` for the words); the mark's own colors are the file's;
 * - the type: the site's own Inter, the variable latin file `next/font` put
 *   in `out/`;
 * - the words: `TAGLINE` and `copy.nav.wordmark` (src/content/copy.ts, loaded
 *   by Node's own TypeScript stripping, as src/brand/mark.ts is).
 *
 * Rendering is Playwright's Chromium, which this repo does not depend on;
 * the npx cache has it. Set PLAYWRIGHT_DIR to a playwright package to choose
 * one; without it the script looks for `playwright` in ~/.npm/_npx, and for
 * Chromium in Playwright's cache (or CHROMIUM_PATH).
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { MARK_FILE, MARK_WHITE_FILE, markAspect, nestedMark, readMark } from '../src/brand/mark.ts';
import { copy, TAGLINE } from '../src/content/copy.ts';

const SITE = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUBLIC = path.join(SITE, 'public');

/** The app icon: the mark's height over the tile's (decision 31), and the favicon's corner over its side. */
const ICON_MARK = 0.63;
const CORNER = 0.225;

/* The colors, from the tokens the app and the site style from. */
const requireFromSite = createRequire(path.join(SITE, 'package.json'));
const tokens = requireFromSite('@verso/tokens/tokens.json');
const light = (token) => token.$extensions.verso.modes.light;
const GREEN = light(tokens.color.brand.primary);
const ON_GREEN = light(tokens.color.brand['on-primary']);

/* The mark on the green, and the same drawing on white to check it against. */
const mark = readMark(SITE, MARK_WHITE_FILE);
const onWhite = readMark(SITE, MARK_FILE);
if (
  mark.viewBox.join(' ') !== onWhite.viewBox.join(' ') ||
  mark.paths.length !== onWhite.paths.length ||
  mark.paths.some((shape, index) => shape.d !== onWhite.paths[index].d)
) {
  throw new Error(`${MARK_WHITE_FILE} and ${MARK_FILE} draw different marks; both are copies of docs/design/assets/brand/.`);
}

const round = (n) => Math.round(n * 1000) / 1000;

/** The mark `height` tall, centered on (cx, cy), as an SVG fragment. */
function markAt(cx, cy, height) {
  const width = height * markAspect(mark);
  return nestedMark(mark, { x: round(cx - width / 2), y: round(cy - height / 2), width: round(width), height: round(height) });
}

/** The app icon as SVG at `size`: the green tile, the mark at 63% of its height, centered. */
function appIcon(size, { rounded }) {
  const corner = rounded ? ` rx="${round(CORNER * size)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}"${corner} fill="${GREEN}"/>${markAt(size / 2, size / 2, ICON_MARK * size)}</svg>`;
}

/* The site's latin Inter, from the export's own stylesheet. */
function siteInterFace() {
  const chunks = path.join(SITE, 'out/_next/static/chunks');
  if (!fs.existsSync(chunks)) throw new Error('Run `pnpm --filter @verso/site build` first: the share image uses the site\'s own Inter from out/.');
  for (const file of fs.readdirSync(chunks).filter((name) => name.endsWith('.css'))) {
    const sheet = fs.readFileSync(path.join(chunks, file), 'utf8');
    for (const face of sheet.match(/@font-face\{[^}]*\}/g) ?? []) {
      if (!face.includes('font-family:Inter;') || !face.includes('unicode-range:U+??')) continue;
      const url = /url\(([^)]+)\)/.exec(face)?.[1];
      const font = fs.readFileSync(path.resolve(chunks, url));
      return face.replace(/url\([^)]+\)/, `url(data:font/woff2;base64,${font.toString('base64')})`);
    }
  }
  throw new Error('No latin Inter face in the export\'s CSS');
}

/*
 * The share image's measures, in px of the 1200 x 630 image. The mark is
 * 240 tall (38% of the height; the billboard's is 44% of a wider, shorter
 * board), the gap to the words half its width (the lockup's), the tagline in
 * Inter Bold at 52 (the board's headline weight) on two lines, the wordmark
 * in Inter Semi Bold at -2% at 36.
 */
const SHARE = { width: 1200, height: 630, mark: 240, tagline: 52, wordmark: 36 };

function shareImageHtml() {
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const markWidth = SHARE.mark * markAspect(mark);
  const gap = markWidth / 2;
  const top = (SHARE.height - SHARE.mark) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${round(markWidth)}" height="${SHARE.mark}" viewBox="0 0 ${round(markWidth)} ${SHARE.mark}">${markAt(markWidth / 2, SHARE.mark / 2, SHARE.mark)}</svg>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${siteInterFace()}
html, body { margin: 0; }
body { width: ${SHARE.width}px; height: ${SHARE.height}px; background: ${GREEN}; color: ${ON_GREEN}; font-family: Inter; -webkit-font-smoothing: antialiased; }
main { position: relative; height: 100%; }
.mark { position: absolute; left: var(--left); top: ${top}px; display: block; }
.words { position: absolute; left: calc(var(--left) + ${round(markWidth + gap)}px); top: ${top}px; height: ${SHARE.mark}px; width: 700px; display: flex; flex-direction: column; justify-content: space-between; }
/* Trimmed to the capitals and the baseline, so the box's top is the first line's cap height and its foot the last baseline. */
h1, p { margin: 0; text-box: trim-both cap alphabetic; }
h1 { font-size: ${SHARE.tagline}px; font-weight: 700; line-height: 1.12; letter-spacing: -0.02em; text-wrap: balance; }
p { font-size: ${SHARE.wordmark}px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
</style></head><body><main>
${svg.replace('<svg ', '<svg class="mark" ')}
<div class="words"><h1>${escape(TAGLINE)}</h1><p>${escape(copy.nav.wordmark)}</p></div>
</main>
<script>
/* Center the group: the mark, the gap, and the wider of the tagline's lines. */
const words = document.querySelector('.words');
const range = document.createRange();
range.selectNodeContents(document.querySelector('h1'));
const textWidth = Math.max(...Array.from(range.getClientRects(), (rect) => rect.width));
const group = ${round(markWidth + gap)} + textWidth;
document.body.style.setProperty('--left', ((${SHARE.width} - group) / 2) + 'px');
</script></body></html>`;
}

/** An .ico holding the given PNGs, each with its own size entry. */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_DIR) candidates.push(process.env.PLAYWRIGHT_DIR);
  const npx = path.join(os.homedir(), '.npm/_npx');
  if (fs.existsSync(npx)) {
    for (const dir of fs.readdirSync(npx)) candidates.push(path.join(npx, dir, 'node_modules/playwright'));
  }
  for (const dir of candidates) {
    const entry = path.join(dir, 'index.mjs');
    if (fs.existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  return import('playwright');
}

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(cache)) return undefined;
  const builds = fs.readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const build of builds) {
    for (const app of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
      const file = path.join(cache, build, app);
      if (fs.existsSync(file)) return file;
    }
  }
  return undefined;
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath() });

/**
 * The top left `width` × `height` of a page at 1x, its markup set. The window
 * is never smaller than 400 px: Chromium stalls on screenshots of the tiny
 * windows a 16 px icon would ask for, so the icon is clipped out instead.
 */
async function render(html, width, height, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: Math.max(width, 400), height: Math.max(height, 400) }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
  await page.close();
  return png;
}

const bare = (svg) => `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg style="display:block" ')}</body></html>`;

fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), `${appIcon(32, { rounded: true })}\n`);

const icons = [];
for (const size of [16, 32, 48]) icons.push({ size, png: await render(bare(appIcon(size, { rounded: true })), size, size, { transparent: true }) });
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico(icons));

fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), await render(bare(appIcon(180, { rounded: false })), 180, 180));
fs.writeFileSync(path.join(PUBLIC, 'og-image.png'), await render(shareImageHtml(), SHARE.width, SHARE.height));

/* A check against the App Store master, when asked: the 1024 icon from the same geometry, to diff by eye. */
if (process.env.ICON_CHECK) {
  fs.writeFileSync(process.env.ICON_CHECK, await render(bare(appIcon(1024, { rounded: false })), 1024, 1024));
}

await browser.close();
console.log(`Wrote favicon.svg, favicon.ico (16, 32, 48), apple-touch-icon.png (180) and og-image.png (1200 × 630) to ${path.relative(process.cwd(), PUBLIC) || 'public'} from ${MARK_WHITE_FILE}; the green is ${GREEN}.`);
