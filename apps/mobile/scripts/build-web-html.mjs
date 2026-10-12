#!/usr/bin/env node
/**
 * Generates `public/index.html`, the page the web export is built around.
 *
 * `web.output` is `single`, and under that output Expo has no `+html.tsx`
 * (that file only runs for the static and server outputs). The one hook for
 * what goes in `<head>` is `public/index.html`: when it exists, `expo export`
 * and the dev server use it instead of the built-in template, fill in
 * `%LANG_ISO_CODE%` from `web.lang` and `%WEB_TITLE%` from `web.name`, and
 * append the favicon link, the stylesheet and the script. So the file here is
 * Expo's own template plus the description, the Open Graph tags, the
 * apple-touch-icon link and a `theme-color` for each scheme.
 *
 * The two theme colors are the `bg/canvas` token, light and dark. A static
 * tag cannot import a token, so `web-index.template.html` carries
 * placeholders and this script fills them from `packages/tokens/tokens.json`,
 * the way `build-theme.mjs` does for the theme: the output is committed so
 * nothing builds it in CI, and `test/web-html.test.ts` fails when the committed
 * file is out of step with the template or the tokens.
 *
 * Regenerate with `pnpm mobile web:html`. Never edit `public/index.html`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');

export const TEMPLATE_PATH = join(here, 'web-index.template.html');
export const OUTPUT_PATH = join(appRoot, 'public', 'index.html');
export const TOKENS_PATH = join(appRoot, '..', '..', 'packages', 'tokens', 'tokens.json');

/** The `bg/canvas` token's two modes, as the hex strings tokens.json carries. */
export function canvasColors(tokens) {
  const canvas = tokens.color.bg.canvas;
  const modes = canvas.$extensions?.verso?.modes ?? {};
  return { light: modes.light ?? canvas.$value, dark: modes.dark ?? canvas.$value };
}

/** The template with its token placeholders filled. Pure, so the test can call it. */
export function renderIndexHtml(template, tokens) {
  const { light, dark } = canvasColors(tokens);
  return template.replaceAll('{{canvas-light}}', light).replaceAll('{{canvas-dark}}', dark);
}

/** The page as it should be committed, read from the template and the tokens on disk. */
export function expectedIndexHtml() {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
  return renderIndexHtml(template, tokens);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUTPUT_PATH, expectedIndexHtml());
  console.log(`wrote ${OUTPUT_PATH}`);
}
