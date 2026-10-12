import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { darkTheme, lightTheme } from '@verso/tokens';
import { describe, expect, it } from 'vitest';

import {
  HOLDING,
  ICON_BUNDLE,
  SPLASH_SIDE,
  brandColors,
  decodePng,
  holdingFaviconSvg,
  iconBundleFiles,
  readMark,
  readTokens,
} from '../scripts/brand-assets.mjs';
import {
  MARK_MIN_SIZE,
  MARK_PLAY_OPACITY_ON_WHITE,
  MARK_PLAY_PATH,
  MARK_V_PATH,
  MARK_VIEWBOX,
  lockupMetrics,
  markColors,
  markSize,
} from '../src/ui/verso-mark';

// Rafa's mark is final (decision 31): these tests hold the app's copy of it,
// and the files cut from it, to the SVGs in docs/design/assets/brand/ and to
// the tokens. The PNGs themselves are written by scripts/brand-assets.mjs.

const appRoot = join(__dirname, '..');
const mark = readMark();
const tokens = readTokens();
const colors = brandColors(tokens);
const appJson = JSON.parse(readFileSync(join(appRoot, 'app.json'), 'utf8')).expo;
const splash = appJson.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
const png = (path: string) => decodePng(readFileSync(join(appRoot, path)));

describe('the mark', () => {
  it('is the SVG, path for path, never redrawn', () => {
    expect(MARK_PLAY_PATH).toBe(mark.play);
    expect(MARK_V_PATH).toBe(mark.v);
    expect(MARK_VIEWBOX).toEqual({ width: mark.width, height: mark.height });
  });

  it('draws the play at the opacity it was drawn with on white', () => {
    expect(MARK_PLAY_OPACITY_ON_WHITE).toBe(mark.onWhite.play.opacity);
  });

  it('keeps the drawing ratio and never goes under 16', () => {
    expect(markSize(28)).toEqual({ width: (28 * 882) / 915, height: 28 });
    expect(markSize(10).height).toBe(MARK_MIN_SIZE);
    expect(MARK_MIN_SIZE).toBe(16);
  });
});

describe('markColors', () => {
  it('on white: the colors in verso-mark.svg', () => {
    expect(markColors(lightTheme, 'canvas')).toEqual({
      v: mark.onWhite.v.fill,
      play: mark.onWhite.play.fill,
      playOpacity: mark.onWhite.play.opacity,
    });
    expect(markColors(lightTheme)).toEqual({ v: '#006822', play: '#80B491', playOpacity: 0.733333 });
  });

  it('on black in dark mode: the lifted V and an opaque play', () => {
    expect(markColors(darkTheme, 'canvas')).toEqual({ v: '#009B37', play: '#80B491', playOpacity: 1 });
  });

  it('on the brand green, either mode: the colors in verso-mark-white.svg', () => {
    const onGreen = { v: mark.onGreen.v.fill, play: mark.onGreen.play.fill, playOpacity: 1 };
    expect(markColors(lightTheme, 'brand')).toEqual(onGreen);
    expect(markColors(darkTheme, 'brand')).toEqual(onGreen);
    expect(onGreen).toEqual({ v: '#FFFFFF', play: '#CDE8D3', playOpacity: 1 });
  });
});

describe('lockupMetrics', () => {
  it('reproduces the Figma lockup: a 112 mark beside a 104 word, half a mark apart', () => {
    const { markHeight, gap } = lockupMetrics(104);
    expect(markHeight).toBe(112);
    // 238:42 puts the word at x 161.94 after a mark 107.96 wide.
    expect(gap).toBeCloseTo(161.94 - 107.96, 1);
  });
});

describe('the app icon and splash', () => {
  it('ships the Icon Composer bundle the script writes, and nothing else in it', () => {
    const expected = iconBundleFiles(mark, colors);
    const onDisk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? onDisk(join(dir, entry.name)) : [relative(ICON_BUNDLE, join(dir, entry.name))],
      );
    expect(onDisk(ICON_BUNDLE).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, body] of Object.entries(expected)) {
      expect(readFileSync(join(ICON_BUNDLE, name), 'utf8')).toBe(body);
    }
    expect(appJson.ios.icon).toBe('./assets/expo.icon');
  });

  it('fills the iOS tile and the Android background with the brand green', () => {
    expect(colors.green).toBe('#006822');
    expect(JSON.parse(iconBundleFiles(mark, colors)['icon.json']).fill.solid).toBe('srgb:0.00000,0.40784,0.13333,1.00000');
    expect(appJson.android.adaptiveIcon.backgroundColor).toBe(colors.green);
    expect(appJson.android.adaptiveIcon.backgroundImage).toBeUndefined();
  });

  it('opens on the canvas color, light and dark', () => {
    expect(splash.backgroundColor).toBe(colors.canvas.light);
    expect(splash.dark.backgroundColor).toBe(colors.canvas.dark);
    // Every size Expo cuts from the splash image is a whole-number reduction.
    expect(SPLASH_SIDE % splash.imageWidth).toBe(0);
    // Opaque on the splash's own ground (brand-assets.mjs says why).
    const hex = (pixels: Uint8Array) => `#${[...pixels.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    for (const [file, ground] of [[splash.image, splash.backgroundColor], [splash.dark.image, splash.dark.backgroundColor]]) {
      const image = png(file);
      expect([image.width, image.height, image.channels]).toEqual([SPLASH_SIDE, SPLASH_SIDE, 3]);
      expect(hex(image.pixels)).toBe(ground);
    }
  });

  it('points every asset at a file that exists', () => {
    const paths = [
      appJson.icon,
      appJson.ios.icon,
      appJson.web.favicon,
      appJson.android.adaptiveIcon.foregroundImage,
      appJson.android.adaptiveIcon.monochromeImage,
      splash.image,
      splash.dark.image,
    ];
    for (const path of paths) expect(existsSync(join(appRoot, path)), path).toBe(true);
  });

  it('uses the App Store master as icon.png, opaque and without an alpha channel', () => {
    const icon = png(appJson.icon);
    const master = decodePng(readFileSync(join(appRoot, '..', '..', 'docs', 'design', 'assets', 'brand', 'app-icon-1024.png')));
    expect([icon.width, icon.height, icon.channels]).toEqual([1024, 1024, 3]);
    for (let i = 0; i < 1024 * 1024; i += 997) {
      expect([...icon.pixels.subarray(i * 3, i * 3 + 3)]).toEqual([...master.pixels.subarray(i * 4, i * 4 + 3)]);
    }
  });

  it('cuts the favicon and the Android layers at their sizes', () => {
    expect(png(appJson.web.favicon).width).toBe(196);
    expect(png(appJson.android.adaptiveIcon.foregroundImage).width).toBe(1024);
    expect(png(appJson.android.adaptiveIcon.monochromeImage).width).toBe(1024);
  });
});

describe("the holding page's favicon", () => {
  const html = readFileSync(join(HOLDING, 'index.html'), 'utf8');

  it('is the bare mark the script writes, its paths verbatim', () => {
    const svg = readFileSync(join(HOLDING, 'favicon.svg'), 'utf8');
    expect(svg).toBe(holdingFaviconSvg(mark, colors));
    expect(svg).toContain(`d="${mark.play}"`);
    expect(svg).toContain(`d="${mark.v}"`);
    const png = decodePng(readFileSync(join(HOLDING, 'favicon.png')));
    expect([png.width, png.height]).toEqual([32, 32]);
  });

  it('is linked from the page, which still loads nothing from anywhere else', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />');
    expect(html).not.toContain('data:,');
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
  });
});
