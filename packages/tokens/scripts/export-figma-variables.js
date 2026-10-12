/**
 * Exports the Verso Figma file's variables and text styles as `tokens.json`.
 *
 * This is not a Node script. It is the body of a read-only `use_figma` call
 * (the Figma Plugin API, with top-level `await` and `return`), which is why it
 * ends in a bare `return`. It reads and never writes.
 *
 * How to run it:
 *   1. Paste this file's contents as the `code` of one `use_figma` call on the
 *      Verso file (its key is in docs/private/CONTEXT.md). Load the figma-use skill first,
 *      and count the call against the session's Figma budget
 *      (docs/design/figma-workflow.md).
 *   2. Write the returned JSON to `packages/tokens/tokens.json`, pretty-printed
 *      with two spaces and a trailing newline:
 *        node -e 'const fs=require("fs");const p="packages/tokens/tokens.json";fs.writeFileSync(p,JSON.stringify(JSON.parse(fs.readFileSync(p,"utf8")),null,2)+"\n")'
 *   3. `pnpm tokens:build`, then commit `tokens.json` with the regenerated
 *      `src/theme.ts` and `theme.css` (`pnpm tokens:check` fails otherwise).
 *
 * What it maps, so that the output needs no hand edits:
 *   - Colors: every variable, grouped by the part of its name before the `/`,
 *     in the collection's order. `$value` is the Light mode, `modes` carries
 *     Light and Dark, `css` is the WEB code syntax without `var()`, and the
 *     description is the variable's own (Figma stores apostrophes as `&#39;`).
 *   - Spacing and Radius as `px` dimensions. `radius/pill` is written as
 *     9999px, a pill at any height (README.md); Figma holds 999 there.
 *   - The ten text styles, keyed by name in kebab case, weight from the style.
 *   - `score`: a note about `packages/core`'s `scoreColor`, which has no Figma
 *     source and so is fixed here.
 */

const FILE_DESCRIPTION =
  'Design tokens exported from the Verso Figma file (Foundations page). $value is the light value; $extensions.verso.modes carries light and dark; $extensions.verso.css is the CSS custom property name Tailwind v4 and Uniwind consume. Regenerate from Figma rather than editing by hand, with packages/tokens/scripts/export-figma-variables.js.';

const SCORE_DESCRIPTION =
  'Score badges shade continuously across the tier palette by score: anchors at the band centers 1.95 (disliked), 5.2 (fine), 7.45 (liked), 9.25 (loved), clamped outside; tier band edges are 4.0, 6.5, 8.5 (see packages/core TIER_BANDS).';

const WEIGHTS = { Regular: 400, Medium: 500, 'Semi Bold': 600, Bold: 700 };

const hex = (c) => {
  const byte = (x) => Math.round(x * 255).toString(16).padStart(2, '0').toUpperCase();
  return '#' + byte(c.r) + byte(c.g) + byte(c.b) + (c.a !== undefined && c.a < 1 ? byte(c.a) : '');
};

const decode = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const cssName = (variable) => {
  const web = variable.codeSyntax.WEB;
  if (!web) throw new Error(`${variable.name} has no WEB code syntax`);
  return web.replace(/^var\((.*)\)$/, '$1');
};

const collections = await figma.variables.getLocalVariableCollectionsAsync();
const byName = Object.fromEntries(collections.map((c) => [c.name, c]));
for (const name of ['Colors', 'Spacing', 'Radius']) {
  if (!byName[name]) throw new Error(`no ${name} collection`);
}

async function variablesOf(collection) {
  const out = [];
  for (const id of collection.variableIds) out.push(await figma.variables.getVariableByIdAsync(id));
  return out;
}

// Colors
const colors = byName.Colors;
const light = colors.modes.find((m) => m.name === 'Light');
const dark = colors.modes.find((m) => m.name === 'Dark');
if (!light || !dark) throw new Error('Colors needs Light and Dark modes');

const color = {};
for (const v of await variablesOf(colors)) {
  const [group, name] = v.name.split('/');
  const lightValue = hex(v.valuesByMode[light.modeId]);
  const darkValue = hex(v.valuesByMode[dark.modeId]);
  const token = { $type: 'color', $value: lightValue };
  if (v.description) token.$description = decode(v.description);
  token.$extensions = { verso: { figma: v.name, css: cssName(v), modes: { light: lightValue, dark: darkValue } } };
  (color[group] = color[group] || {})[name] = token;
}

// Spacing and radius
function dimensions(variables, value) {
  const out = {};
  for (const v of variables) {
    const name = v.name.split('/')[1];
    const raw = v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    out[name] = { $type: 'dimension', $value: value(name, raw), $extensions: { verso: { figma: v.name, css: cssName(v) } } };
  }
  return out;
}
const space = dimensions(await variablesOf(byName.Spacing), (_name, raw) => `${raw}px`);
const radius = dimensions(await variablesOf(byName.Radius), (name, raw) => (name === 'pill' ? '9999px' : `${raw}px`));

// Text styles
const font = {};
for (const s of await figma.getLocalTextStylesAsync()) {
  const weight = WEIGHTS[s.fontName.style];
  if (!weight) throw new Error(`${s.name}: unmapped style ${s.fontName.style}`);
  if (s.lineHeight.unit !== 'PIXELS') throw new Error(`${s.name}: line height is not in pixels`);
  const ls = s.letterSpacing;
  const letterSpacing = ls.value === 0 ? '0' : `${ls.value}${ls.unit === 'PERCENT' ? '%' : 'px'}`;
  font[s.name.toLowerCase().replace(/\s+/g, '-')] = {
    $type: 'typography',
    $value: {
      fontFamily: s.fontName.family,
      fontWeight: weight,
      fontSize: `${s.fontSize}px`,
      lineHeight: `${s.lineHeight.value}px`,
      letterSpacing,
    },
    $extensions: { verso: { figma: s.name } },
  };
}

return {
  $schema: 'https://design-tokens.github.io/community-group/format/',
  $description: FILE_DESCRIPTION,
  color,
  space,
  radius,
  font,
  score: { $description: SCORE_DESCRIPTION },
};
