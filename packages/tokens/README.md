# tokens

Design tokens for the app, exported from the Figma file's variables (Foundations page). This package is the single source both the Expo app (through the Tailwind v4 theme and Uniwind) and any future web app consume.

## What is in `tokens.json`

W3C Design Tokens Community Group format, one file.

- `color.*`: every Colors variable. `$value` is the light value; `$extensions.verso.modes` carries `light` and `dark`, matching the two modes of the Figma collection. `$extensions.verso.css` is the CSS custom property name (`--color-brand-primary`, `--color-tier-loved`, and so on), which is also the WEB code syntax set on the variable in Figma.
- `space.*` and `radius.*`: the Spacing and Radius collections as `px` dimensions (`--spacing-4`, `--radius-md`). The pill radius is 9999px.
- `font.*`: the ten text styles (Inter, iOS type scale) as typography tokens.
- `score`: a note on how score badges pick a color across the tier palette; the math lives in `packages/core`.

## Rules

- Do not hand-edit values. Change them in Figma, then re-export with [`scripts/export-figma-variables.js`](scripts/export-figma-variables.js): paste it into one read-only `use_figma` call on the Verso file, write the returned JSON to `tokens.json` (the script's header has the one-line pretty-print), then `pnpm tokens:build`. The script reads the local variable collections and text styles and maps everything, descriptions included, so the output needs no hand edits.
- Names mirror the Figma variable names with `/` replaced by `-`, so no translation table is needed between design and code.
- One brand color, not one per medium (decision 29, 2026-10-07): `brand/primary` is the fill in both modes with `brand/on-primary` on it, and `brand/text` is brand-colored text and icons, lifted in dark mode. `text/destructive` is the app's red for destructive and error text (`#FF453A` in dark); `tier/disliked` is the verdict only. The tier palette is option A, four deep solids with one value for both modes and the white `tier/label` on them. `medium/*` stays in the file because old Figma frames are bound to it; code does not use it.
