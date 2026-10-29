/**
 * Every route the root layout presents as a form sheet paints `bg/sheet`
 * (VER-200, VER-218).
 *
 * No renderer runs here (vitest.config.ts), so these tests read the sources:
 * the route map's `FORM_SHEETS`, each route's file, and the screen modules it
 * imports. A sheet either draws `SheetFrame`, which paints the surface, or
 * paints it itself the way `SheetFrame` does: `bg/sheet`, `sheetEdge` and
 * `ElevatedScope`. A canvas fill is the gap VER-218 closed in the log flow and
 * the add-to sheet: in dark mode it is the black of the dimmed screen behind.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..', 'src');
const read = (path: string) => readFileSync(path, 'utf8');

const formSheets = [...read(join(src, 'app', '_layout.tsx')).matchAll(/\{ name: '([^']+)', detents:/g)].map(
  (match) => match[1]!,
);

/** A sheet's route file and the screen modules it imports from `@/screens`. */
function sheetSource(route: string): string {
  const file = read(join(src, 'app', `${route}.tsx`));
  const screens = [...file.matchAll(/from '@\/screens\/([^']+)'/g)].map((match) =>
    read(join(src, 'screens', `${match[1]}.tsx`)),
  );
  return [file, ...screens].join('\n');
}

describe('form sheets', () => {
  it('are read from the route map', () => {
    expect(formSheets).toEqual(expect.arrayContaining(['add/[id]', 'log/[id]', 'game/[id]/hours']));
  });

  it.each(formSheets)('%s paints bg/sheet, not the canvas', (route) => {
    const source = sheetSource(route);
    expect(source).not.toContain("theme.colors['bg/canvas']");
    if (source.includes('<SheetFrame')) return;
    expect(source).toContain("theme.colors['bg/sheet']");
    expect(source).toContain('sheetEdge(theme)');
    expect(source).toContain('<ElevatedScope>');
  });
});
