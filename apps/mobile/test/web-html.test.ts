import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_TITLE, documentTitleFor } from '../src/lib/document-title';
import { canvasColors, expectedIndexHtml, renderIndexHtml } from '../scripts/build-web-html.mjs';

// The web export is built around `public/index.html` and the files beside it
// (scripts/build-web-html.mjs says why). The export itself is checked by the
// `web` CI job; these tests guard the sources it is built from, which no
// compiler looks at: a stale generated page, a title rule that drifted from
// the app's name, a missing static file.

const appRoot = join(__dirname, '..');
const publicFile = (name: string) => join(appRoot, 'public', name);
const read = (path: string) => readFileSync(path, 'utf8');

const tokens = JSON.parse(read(join(appRoot, '..', '..', 'packages', 'tokens', 'tokens.json')));
const appJson = JSON.parse(read(join(appRoot, 'app.json')));
const html = read(publicFile('index.html'));

describe('documentTitleFor', () => {
  it('names a page "<page> · Verso"', () => {
    expect(documentTitleFor('Home')).toBe('Home · Verso');
    expect(documentTitleFor('Signing you in')).toBe('Signing you in · Verso');
  });

  it('is the bare app name when there is no page name', () => {
    expect(documentTitleFor()).toBe('Verso');
    expect(documentTitleFor(null)).toBe('Verso');
    expect(documentTitleFor('')).toBe('Verso');
    expect(documentTitleFor('   ')).toBe('Verso');
  });

  it("matches the exported page's own title, which comes from the app name", () => {
    expect(APP_TITLE).toBe(appJson.expo.name);
    expect(html).toContain('<title>%WEB_TITLE%</title>');
  });
});

describe('public/index.html', () => {
  it('is the committed output of the template and the tokens', () => {
    // On failure: `pnpm mobile web:html`, then commit the result.
    expect(html).toBe(expectedIndexHtml());
  });

  it('has a theme-color for each scheme, the bg/canvas token', () => {
    const { light, dark } = canvasColors(tokens);
    expect(html).toContain(`<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)" />`);
    expect(html).toContain(`<meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)" />`);
    expect(html).not.toContain('{{');
  });

  it('fills the placeholders from the token file, not from a literal', () => {
    const filled = renderIndexHtml('{{canvas-light}} {{canvas-dark}}', {
      color: { bg: { canvas: { $value: '#111111', $extensions: { verso: { modes: { light: '#222222', dark: '#333333' } } } } } },
    });
    expect(filled).toBe('#222222 #333333');
  });

  it('leaves the language and the title to Expo, and sets the language in app.json', () => {
    expect(html).toContain('<html lang="%LANG_ISO_CODE%">');
    expect(appJson.expo.web.lang).toBe('en');
  });

  it('carries the description and the Open Graph title and description', () => {
    const line = 'Verso: a head-to-head ranking app for digital media.';
    expect(html).toContain(`<meta name="description" content="${line}" />`);
    expect(html).toContain(`<meta property="og:description" content="${line}" />`);
    expect(html).toContain('<meta property="og:title" content="Verso" />');
  });

  it('does not also ask app.json for a description or theme color, which would add a second tag', () => {
    expect(appJson.expo.web.description).toBeUndefined();
    expect(appJson.expo.web.themeColor).toBeUndefined();
  });

  it('links an apple-touch-icon that exists', () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(existsSync(publicFile('apple-touch-icon.png'))).toBe(true);
  });
});

describe('public/robots.txt', () => {
  it('allows everything', () => {
    const lines = read(publicFile('robots.txt')).split('\n').map((line) => line.trim());
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Allow: /');
    expect(lines.some((line) => line.toLowerCase().startsWith('disallow: /'))).toBe(false);
  });
});
