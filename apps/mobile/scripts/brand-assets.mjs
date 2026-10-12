#!/usr/bin/env node
/**
 * Writes the app's icon and splash files from Rafa's mark. Run by hand, not by
 * the build; its outputs are committed. To rerun, from the repo root:
 *
 *   node apps/mobile/scripts/brand-assets.mjs              # write the assets
 *   node apps/mobile/scripts/brand-assets.mjs --previews   # and previews, in apps/mobile/.brand-previews/ (ignored)
 *
 * Sources, so nothing is restated:
 * - the mark: `docs/design/assets/brand/verso-mark.svg` (and its white twin),
 *   the two paths read verbatim and only ever placed with a translate and a
 *   scale, never redrawn (decision 31);
 * - the App Store master: `docs/design/assets/brand/app-icon-1024.png`;
 * - the colors: `packages/tokens/tokens.json` (`brand/primary`,
 *   `brand/on-primary`, `brand/text`, `brand/tint-half`, `brand/tint-quarter`).
 *
 * Outputs, in apps/mobile/assets/:
 * - `images/icon.png`: the master's own pixels, written without its alpha
 *   channel (it is fully opaque, and App Store Connect rejects an alpha
 *   channel on the 1024 icon). Android's legacy icon and Expo Go use it.
 * - `expo.icon/`: the iOS icon as an Icon Composer document, so iOS 26 draws
 *   it as a native layered icon: a solid `brand/primary` fill and two SVG
 *   layers, the white V and the `brand/tint-quarter` play, the mark at 63% of
 *   the tile's height, centered. In dark mode the layers take the brand's
 *   on-black colors (V `brand/text` dark, play `brand/tint-half`) instead of
 *   the system's default, which would put the deep green on black.
 * - `images/android-icon-foreground.png`: the white V and pale play on a
 *   transparent 1024 square, the mark at 63% of the 72dp visible tile (42% of
 *   the 108dp canvas), which keeps every point inside the 66dp safe circle.
 *   The background is `brand/primary` as a color in app.json, no image.
 * - `images/android-icon-monochrome.png`: the same placement, the V and the
 *   play as one white silhouette, for Android 13's themed icons.
 * - `images/favicon.png`: the icon's tile at 196, square.
 * - `images/splash-icon.png`, `images/splash-icon-dark.png`: the mark filling
 *   the height of a 912 square, in its on-white colors on white and its
 *   on-black colors on black, the splash's own grounds. 912 is 12 times the
 *   splash's 76pt `imageWidth`, so every size Expo cuts from it (76 to 304 px)
 *   is a whole-number reduction. The squares are opaque on purpose: without
 *   `sharp`, Expo fits a splash image by compositing it onto transparent black
 *   with Jimp, which leaves partly transparent pixels premultiplied, so the
 *   play (73% on white) came out darker and every edge grey. Opaque on the
 *   ground it sits on, the image is identical on screen and passes through.
 * And `public/apple-touch-icon.png`, the tile at 180 for the web app.
 *
 * And the holding page's favicon, in apps/holding/ (rankverso.com):
 * - `favicon.svg`: the bare mark in its on-white colors, squared by its
 *   viewBox, switching to its on-black colors when the browser is dark;
 * - `favicon.png`: the same mark at 32, in its on-white colors, for browsers
 *   that take no SVG icon.
 * The bare mark rather than the app's tile: at 16 px its V is half again the
 * tile's and still reads, with the play a dot as brand-identity.md expects.
 *
 * Rendering is Playwright's Chromium, which this repo does not depend on; the
 * npx cache has it (as for apps/site/scripts/logo-slot-assets.mjs). Set
 * PLAYWRIGHT_DIR to a playwright package to choose one, CHROMIUM_PATH for the
 * browser. The previews also use Icon Composer's `ictool` when Xcode is
 * installed, to draw the iOS icon the way the system will.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.join(here, '..');
const REPO_ROOT = path.join(APP_ROOT, '..', '..');
export const BRAND_DIR = path.join(REPO_ROOT, 'docs', 'design', 'assets', 'brand');
export const TOKENS_PATH = path.join(REPO_ROOT, 'packages', 'tokens', 'tokens.json');
export const ICON_BUNDLE = path.join(APP_ROOT, 'assets', 'expo.icon');
const IMAGES = path.join(APP_ROOT, 'assets', 'images');
export const HOLDING = path.join(REPO_ROOT, 'apps', 'holding');
const PREVIEWS = path.join(APP_ROOT, '.brand-previews');

/** The mark's height as a share of the tile, iOS and Android alike (decision 31). */
export const TILE_MARK_SHARE = 0.63;
/** Android: the visible tile is 72dp of the 108dp canvas; the safe circle is 66dp across. */
const ANDROID_VISIBLE = 72 / 108;
const ANDROID_SAFE = 66 / 108;
/** The Icon Composer canvas, in points. */
const ICON_CANVAS = 1024;
/** The splash image's side: 12 × the 76pt `imageWidth` in app.json. */
export const SPLASH_SIDE = 912;

/* ---------- the mark and the colors ---------- */

/**
 * The mark as drawn: its viewBox, the two paths verbatim and their fills.
 * `verso-mark.svg` is the on-white file, `verso-mark-white.svg` the on-green.
 */
export function readMark(dir = BRAND_DIR) {
  const parse = (file) => {
    const svg = fs.readFileSync(path.join(dir, file), 'utf8');
    const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    const paths = [...svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})"(?: fill-opacity="([\d.]+)")?\/>/g)];
    if (!viewBox || paths.length !== 2) throw new Error(`${file}: expected a viewBox and two paths`);
    const [play, v] = paths;
    return {
      width: Number(viewBox[1]),
      height: Number(viewBox[2]),
      play: { d: play[1], fill: play[2], opacity: play[3] === undefined ? 1 : Number(play[3]) },
      v: { d: v[1], fill: v[2] },
    };
  };
  const onWhite = parse('verso-mark.svg');
  const onGreen = parse('verso-mark-white.svg');
  if (onWhite.play.d !== onGreen.play.d || onWhite.v.d !== onGreen.v.d) {
    throw new Error('verso-mark.svg and verso-mark-white.svg disagree on the geometry');
  }
  return { width: onWhite.width, height: onWhite.height, play: onWhite.play.d, v: onWhite.v.d, onWhite, onGreen };
}

/** The colors the files use, by ground, from tokens.json. */
export function brandColors(tokens) {
  const mode = (token, scheme) => token.$extensions.verso.modes[scheme];
  const brand = tokens.color.brand;
  return {
    green: mode(brand.primary, 'light'),
    canvas: { light: mode(tokens.color.bg.canvas, 'light'), dark: mode(tokens.color.bg.canvas, 'dark') },
    onGreen: { v: mode(brand['on-primary'], 'light'), play: mode(brand['tint-quarter'], 'light') },
    onWhite: { v: mode(brand.text, 'light'), play: mode(brand['tint-half'], 'light') },
    onBlack: { v: mode(brand.text, 'dark'), play: mode(brand['tint-half'], 'dark') },
  };
}

export function readTokens() {
  return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
}

/* ---------- the iOS icon, as an Icon Composer document ---------- */

/** `#RRGGBB` as Icon Composer writes a color: `srgb:r,g,b,a`, five decimals. */
export function iconComposerColor(hex) {
  const channel = (i) => (parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255).toFixed(5);
  return `srgb:${channel(0)},${channel(1)},${channel(2)},1.00000`;
}

/** One layer's SVG: the mark's own box, one of its paths, one fill. */
function layerSvg(mark, d, fill) {
  return `<svg width="${mark.width}" height="${mark.height}" viewBox="0 0 ${mark.width} ${mark.height}" fill="none" xmlns="http://www.w3.org/2000/svg">\n<path d="${d}" fill="${fill}"/>\n</svg>\n`;
}

/**
 * The files of `assets/expo.icon`, by path inside the bundle.
 *
 * Each layer keeps the mark's 882 × 915 box, so the two line up exactly as
 * drawn; Icon Composer centers a layer on its box and `scale` sizes it, here
 * to 63% of the 1024pt canvas. The keys are the ones Icon Composer writes
 * (Expo's template bundle, and `ictool`, which renders this one).
 */
export function iconBundleFiles(mark, colors) {
  const scale = (TILE_MARK_SHARE * ICON_CANVAS) / mark.height;
  const position = { scale: Number(scale.toFixed(6)), 'translation-in-points': [0, 0] };
  const dark = (hex) => [{ appearance: 'dark', value: { solid: iconComposerColor(hex) } }];
  const doc = {
    fill: { solid: iconComposerColor(colors.green) },
    groups: [
      {
        layers: [
          { 'fill-specializations': dark(colors.onBlack.play), 'image-name': 'play.svg', name: 'Play', position },
          { 'fill-specializations': dark(colors.onBlack.v), 'image-name': 'v.svg', name: 'V', position },
        ],
        shadow: { kind: 'neutral', opacity: 0.5 },
        // Off, so the V stays white and the play its tint rather than letting the green through.
        translucency: { enabled: false, value: 0.5 },
      },
    ],
    'supported-platforms': { squares: 'shared' },
  };
  return {
    'icon.json': `${JSON.stringify(doc, null, 2).replace(/": /g, '" : ')}\n`,
    'Assets/play.svg': layerSvg(mark, mark.play, colors.onGreen.play),
    'Assets/v.svg': layerSvg(mark, mark.v, colors.onGreen.v),
  };
}

/* ---------- the holding page's favicon ---------- */

/**
 * The bare mark as an SVG favicon: its two paths, its on-white colors, a
 * viewBox widened to a square so it sits centered, and the on-black colors
 * when the browser is in dark mode.
 */
export function holdingFaviconSvg(mark, colors) {
  const pad = (mark.height - mark.width) / 2;
  const opacity = mark.onWhite.play.opacity;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} 0 ${mark.height} ${mark.height}">`,
    `<style>@media (prefers-color-scheme: dark) { .play { fill: ${colors.onBlack.play}; fill-opacity: 1; } .v { fill: ${colors.onBlack.v}; } }</style>`,
    `<path class="play" d="${mark.play}" fill="${colors.onWhite.play}" fill-opacity="${opacity}"/>`,
    `<path class="v" d="${mark.v}" fill="${colors.onWhite.v}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

/* ---------- PNG, enough of it ---------- */

/** Decode an 8- or 16-bit, non-interlaced PNG into 8-bit samples. */
export function decodePng(buffer) {
  let at = 8;
  let header = null;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    }
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const { width, height, depth, colorType, interlace } = header;
  if (interlace) throw new Error('interlaced PNGs are not handled');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const bpp = (channels * depth) / 8;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(data));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let value = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = value & 255;
    }
  }
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < width * height * channels; i++) pixels[i] = depth === 16 ? out[i * 2] : out[i];
  return { width, height, channels, colorType, pixels };
}

/** Encode 8-bit RGB or RGBA samples as a PNG. */
export function encodePng({ width, height, channels, pixels }) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The master's pixels without the alpha channel, refusing if any pixel is not opaque. */
export function flattenOpaque(png) {
  if (png.channels === 3) return png;
  if (png.channels !== 4) throw new Error('expected an RGB or RGBA image');
  const rgb = Buffer.alloc(png.width * png.height * 3);
  for (let i = 0; i < png.width * png.height; i++) {
    if (png.pixels[i * 4 + 3] !== 255) throw new Error('the master icon has a pixel that is not opaque');
    png.pixels.copy(rgb, i * 3, i * 4, i * 4 + 3);
  }
  return { ...png, channels: 3, pixels: rgb };
}

/* ---------- the drawings ---------- */

const round = (n) => Math.round(n * 1000) / 1000;

/** The mark at `height`, its box's top-left at (x, y), in the given colors. */
function placedMark(mark, { x, y, height }, { v, play, playOpacity = 1 }) {
  const s = height / mark.height;
  const opacity = playOpacity === 1 ? '' : ` fill-opacity="${playOpacity}"`;
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${s})"><path d="${mark.play}" fill="${play}"${opacity}/><path d="${mark.v}" fill="${v}"/></g>`;
}

/** The mark centered in a `side` square at `share` of its height, on `ground` (or transparent). */
function squareSvg(mark, side, share, colors, ground = null) {
  const height = side * share;
  const width = (height * mark.width) / mark.height;
  const back = ground ? `<rect width="${side}" height="${side}" fill="${ground}"/>` : '';
  const body = placedMark(mark, { x: (side - width) / 2, y: (side - height) / 2, height }, colors);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">${back}${body}</svg>`;
}

/** Every PNG the app ships, as SVG to render, with its size and whether its ground is transparent. */
export function pngJobs(mark, colors) {
  const onGreen = { v: colors.onGreen.v, play: colors.onGreen.play };
  const white = { v: '#FFFFFF', play: '#FFFFFF' };
  const androidShare = TILE_MARK_SHARE * ANDROID_VISIBLE;
  return [
    { file: path.join(IMAGES, 'android-icon-foreground.png'), side: 1024, transparent: true, svg: squareSvg(mark, 1024, androidShare, onGreen) },
    { file: path.join(IMAGES, 'android-icon-monochrome.png'), side: 1024, transparent: true, svg: squareSvg(mark, 1024, androidShare, white) },
    { file: path.join(IMAGES, 'favicon.png'), side: 196, transparent: false, svg: squareSvg(mark, 196, TILE_MARK_SHARE, onGreen, colors.green) },
    { file: path.join(APP_ROOT, 'public', 'apple-touch-icon.png'), side: 180, transparent: false, svg: squareSvg(mark, 180, TILE_MARK_SHARE, onGreen, colors.green) },
    {
      file: path.join(HOLDING, 'favicon.png'),
      side: 32,
      transparent: true,
      svg: squareSvg(mark, 32, 1, { ...colors.onWhite, playOpacity: mark.onWhite.play.opacity }),
    },
    {
      file: path.join(IMAGES, 'splash-icon.png'),
      side: SPLASH_SIDE,
      transparent: false,
      svg: squareSvg(mark, SPLASH_SIDE, 1, { ...colors.onWhite, playOpacity: mark.onWhite.play.opacity }, colors.canvas.light),
    },
    {
      file: path.join(IMAGES, 'splash-icon-dark.png'),
      side: SPLASH_SIDE,
      transparent: false,
      svg: squareSvg(mark, SPLASH_SIDE, 1, colors.onBlack, colors.canvas.dark),
    },
  ];
}

/** The largest distance of any mark point from the box's center, as a share of the mark's height (for the safe-zone check). */
function markReach(mark) {
  // Every command in the two paths is M, L, H or V with absolute coordinates.
  let reach = 0;
  const tokens = `${mark.play} ${mark.v}`.match(/[MLHVZ]|-?\d*\.?\d+/g);
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; i++) {
    const command = tokens[i];
    if (command === 'M' || command === 'L') { x = Number(tokens[++i]); y = Number(tokens[++i]); }
    else if (command === 'H') x = Number(tokens[++i]);
    else if (command === 'V') y = Number(tokens[++i]);
    else continue;
    reach = Math.max(reach, Math.hypot(x - mark.width / 2, y - mark.height / 2));
  }
  return reach / mark.height;
}

/* ---------- rendering ---------- */

async function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_DIR) candidates.push(process.env.PLAYWRIGHT_DIR);
  const npx = path.join(os.homedir(), '.npm/_npx');
  if (fs.existsSync(npx)) for (const dir of fs.readdirSync(npx)) candidates.push(path.join(npx, dir, 'node_modules/playwright'));
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

const ICTOOL = '/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool';

async function main({ previews }) {
  const mark = readMark();
  const colors = brandColors(readTokens());

  const androidReach = markReach(mark) * TILE_MARK_SHARE * ANDROID_VISIBLE;
  if (androidReach > ANDROID_SAFE / 2) throw new Error('the Android mark would leave the 66dp safe circle');

  // The App Store master, flattened.
  const master = decodePng(fs.readFileSync(path.join(BRAND_DIR, 'app-icon-1024.png')));
  if (master.width !== 1024 || master.height !== 1024) throw new Error('the master is not 1024 square');
  fs.writeFileSync(path.join(IMAGES, 'icon.png'), encodePng(flattenOpaque(master)));

  // The Icon Composer document, rewritten whole.
  fs.rmSync(ICON_BUNDLE, { recursive: true, force: true });
  for (const [name, body] of Object.entries(iconBundleFiles(mark, colors))) {
    fs.mkdirSync(path.dirname(path.join(ICON_BUNDLE, name)), { recursive: true });
    fs.writeFileSync(path.join(ICON_BUNDLE, name), body);
  }

  fs.writeFileSync(path.join(HOLDING, 'favicon.svg'), holdingFaviconSvg(mark, colors));

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--force-color-profile=srgb'] });
  const render = async (html, width, height, { transparent = false, scale = 1 } = {}) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: 'load' });
    const png = await page.screenshot({ type: 'png', omitBackground: transparent });
    await page.close();
    return png;
  };
  const bare = (svg) => `<!doctype html><html><body style="margin:0;background:transparent;line-height:0">${svg}</body></html>`;

  for (const job of pngJobs(mark, colors)) {
    fs.writeFileSync(job.file, await render(bare(job.svg), job.side, job.side, { transparent: job.transparent }));
  }

  if (previews) await writePreviews({ render, mark, colors });
  await browser.close();
  console.log(`Wrote icon.png, expo.icon/, the Android foreground and monochrome, favicon.png, the two splash images, public/apple-touch-icon.png and the holding page's favicon.svg and favicon.png; the green is ${colors.green}.`);
}

/** Pictures to look at, not to ship: the icon as iOS and Android mask it, and the splash on a 402 × 874 screen. */
async function writePreviews({ render, mark, colors }) {
  fs.mkdirSync(PREVIEWS, { recursive: true });
  const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  const page = (body, background = '#E5E5EA') =>
    `<!doctype html><html><body style="margin:0;background:${background};font:12px -apple-system,sans-serif;color:#6E6E73">${body}</body></html>`;

  // The App Store master as shipped, and under the iOS corner (a preview only; iOS applies its own mask).
  const icon = dataUrl(path.join(IMAGES, 'icon.png'));
  fs.writeFileSync(path.join(PREVIEWS, 'icon-1024.png'), await render(page(`<img src="${icon}" width="1024" height="1024" style="display:block">`), 1024, 1024));

  // Icon Composer's own renderer, when Xcode is here.
  if (fs.existsSync(ICTOOL)) {
    for (const rendition of ['Default', 'Dark', 'ClearLight', 'TintedDark']) {
      execFileSync(ICTOOL, [ICON_BUNDLE, '--export-image', '--output-file', path.join(PREVIEWS, `ios-icon-${rendition}.png`), '--platform', 'iOS', '--rendition', rendition, '--width', '1024', '--height', '1024', '--scale', '1', '--tint-color', '0.4', '--tint-strength', '0.75']);
    }
  }

  // Android: the foreground over the background color, under a circle and a rounded-square mask, and the themed monochrome.
  const fg = dataUrl(path.join(IMAGES, 'android-icon-foreground.png'));
  const mono = dataUrl(path.join(IMAGES, 'android-icon-monochrome.png'));
  // The masks cut the visible 72dp out of the 108dp canvas: draw the 1024 canvas at 324 and show its middle 216.
  const masked = (radius, layer, background) =>
    `<div style="flex:none;width:216px;height:216px;border-radius:${radius};overflow:hidden;background:${background};position:relative"><img src="${layer}" style="position:absolute;left:-54px;top:-54px;width:324px;height:324px"></div>`;
  // A themed icon: the launcher paints the monochrome layer's shape in a dark tone on a pale one.
  const themed = `<div style="flex:none;width:216px;height:216px;border-radius:50%;overflow:hidden;background:#D7E8DB;position:relative"><div style="position:absolute;left:-54px;top:-54px;width:324px;height:324px;background:#1F3D27;-webkit-mask:url(${mono}) center/324px 324px no-repeat;mask:url(${mono}) center/324px 324px no-repeat"></div></div>`;
  const safe = `<div style="flex:none;width:324px;height:324px;position:relative;background:${colors.green}"><img src="${fg}" style="width:324px;height:324px"><div style="position:absolute;left:${(324 * (1 - ANDROID_SAFE)) / 2}px;top:${(324 * (1 - ANDROID_SAFE)) / 2}px;width:${324 * ANDROID_SAFE}px;height:${324 * ANDROID_SAFE}px;border-radius:50%;outline:1px dashed #FF3B30"></div><div style="position:absolute;left:54px;top:54px;width:216px;height:216px;outline:1px dashed #FFCC00"></div></div>`;
  const android = `<div style="display:flex;gap:24px;align-items:center;padding:24px">${safe}${masked('50%', fg, colors.green)}${masked('28%', fg, colors.green)}${themed}</div>`;
  fs.writeFileSync(path.join(PREVIEWS, 'android-adaptive.png'), await render(page(android), 1092, 372));

  // The splash on a 402 × 874 screen at 3x: the image contained in a 76pt square, centered, as the plugin lays it out.
  for (const [scheme, file] of [['light', 'splash-icon.png'], ['dark', 'splash-icon-dark.png']]) {
    const image = dataUrl(path.join(IMAGES, file));
    const screen = `<div style="width:402px;height:874px;display:flex;align-items:center;justify-content:center;background:${colors.canvas[scheme]}"><img src="${image}" style="width:76px;height:76px;object-fit:contain"></div>`;
    fs.writeFileSync(path.join(PREVIEWS, `splash-${scheme}.png`), await render(page(screen, colors.canvas[scheme]), 402, 874, { scale: 3 }));
  }

  // The tile as rendered from the SVG beside the master, to compare the placement by eye.
  const tile = squareSvg(mark, 512, TILE_MARK_SHARE, colors.onGreen, colors.green);
  fs.writeFileSync(path.join(PREVIEWS, 'tile-vs-master.png'), await render(page(`<div style="display:flex;gap:16px;padding:16px">${tile}<img src="${icon}" width="512" height="512"></div>`), 1072, 544));
  console.log(`Previews in ${path.relative(process.cwd(), PREVIEWS)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main({ previews: process.argv.includes('--previews') });
}
