import fs from 'node:fs';
import path from 'node:path';

/**
 * Rafa's mark, read from the files it lives in (decision 31).
 *
 * He drew it by hand in Figma, and its geometry is final: it is never
 * redrawn, retyped or rounded here. The two files are
 * docs/design/assets/brand/ copied byte for byte:
 *
 * - `src/brand/mark.svg`, the mark on white: the V in `#006822`, the play in
 *   `#80B491` at 73%;
 * - `src/brand/mark-white.svg`, the mark on the brand green: the V white, the
 *   play `#CDE8D3`.
 *
 * Two things read them, so the drawing lives in one place:
 *
 * - `VersoMark` and `Lockup` (components/verso-mark.tsx) draw `mark.svg`
 *   inline at build time, its colors handed to the tokens so they follow the
 *   color scheme;
 * - `pnpm --filter @verso/site logo` (scripts/brand-assets.mjs) cuts
 *   `mark-white.svg` into the favicons, the touch icon and the share image in
 *   `public/`.
 *
 * No relative imports and only erasable TypeScript, so the script can load
 * this file with Node's own type stripping, as it loads copy.ts.
 */

/** The mark on white, from apps/site. */
export const MARK_FILE = 'src/brand/mark.svg';

/** The mark on the brand green, from apps/site. */
export const MARK_WHITE_FILE = 'src/brand/mark-white.svg';

/** One shape of the mark, its attributes as written in the file. */
export interface MarkPath {
  /** The path data, character for character. */
  d: string;
  fill: string;
  /** `fill-opacity` as written, where the file sets one (the play on white). */
  fillOpacity?: string;
}

export interface Mark {
  /** The root's viewBox: min-x, min-y, width, height. */
  viewBox: readonly [number, number, number, number];
  /** Everything inside the root `<svg>`, as written. */
  body: string;
  /** The shapes, in drawing order (the play, then the V). */
  paths: readonly MarkPath[];
}

/** Read one of the mark's files under `siteDir` (apps/site). */
export function readMark(siteDir: string, file: string = MARK_FILE): Mark {
  return parseMark(fs.readFileSync(path.join(siteDir, file), 'utf8'), file);
}

function attributesOf(tag: string): Map<string, string> {
  return new Map(
    Array.from(tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g), (match) => [
      match[1]!.toLowerCase(),
      match[3] ?? match[4] ?? '',
    ]),
  );
}

export function parseMark(source: string, file: string = MARK_FILE): Mark {
  const text = source.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const open = /<svg\b([^>]*)>/i.exec(text);
  const close = text.lastIndexOf('</svg>');
  if (!open || close < open.index) throw new Error(`${file}: no <svg> root`);

  const viewBox = (attributesOf(open[1]!).get('viewbox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n)) || viewBox[2]! <= 0 || viewBox[3]! <= 0) {
    throw new Error(`${file}: the root <svg> needs a viewBox`);
  }

  const body = text.slice(open.index + open[0].length, close).trim();
  const paths = Array.from(body.matchAll(/<path\b([^>]*?)\/?>/gi), (match) => {
    const attributes = attributesOf(match[1]!);
    const d = attributes.get('d');
    const fill = attributes.get('fill');
    if (!d || !fill) throw new Error(`${file}: every path needs a d and a fill`);
    const fillOpacity = attributes.get('fill-opacity');
    return fillOpacity ? { d, fill, fillOpacity } : { d, fill };
  });
  if (paths.length === 0) throw new Error(`${file}: no paths`);

  return { viewBox: viewBox as unknown as Mark['viewBox'], body, paths };
}

/** The mark's width over its height, from its viewBox. */
export function markAspect(mark: Mark): number {
  return mark.viewBox[2] / mark.viewBox[3];
}

/** The mark nested in a larger SVG, fitted to the box (its viewBox fills it when the box keeps its aspect). */
export function nestedMark(mark: Mark, box: { x: number; y: number; width: number; height: number }): string {
  return `<svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" viewBox="${mark.viewBox.join(' ')}" fill="none">${mark.body}</svg>`;
}
