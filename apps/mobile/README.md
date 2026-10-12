# mobile

The Verso app: one Expo Router codebase for iOS, Android and web.

## Running it

```bash
cp .env.example .env     # fill in EXPO_PUBLIC_SUPABASE_ANON_KEY
pnpm ios                 # from the repo root: builds and launches on the booted simulator
```

`.env` holds public values only — `EXPO_PUBLIC_` variables are bundled into the
app, and the anon key is public by design because RLS is the security boundary.

Two things worth knowing on a device:

- `xcrun simctl openurl booted verso://preview` opens the primitive gallery:
  every shared component in light and dark, plus the drag-to-reorder proof.
- `xcrun simctl ui booted appearance dark` switches the scheme. Everything on
  screen follows the device; nothing has its own toggle.

## Layout

```
src/app/      routes, file-based. The map and who owns each file is in
              ../../docs/design/specs/README.md.
src/ui/       the shared primitives. Owned by the shell; a screen that needs
              something else builds it in its own folder and says so.
src/screens/  one folder per screen, for that screen's own components.
src/lib/      the Supabase client and its encrypted session storage, the
              session store, query keys, invalidation, formatters.
```

## Where the values come from

Colors, spacing, radius and the type ramp are generated from
`packages/tokens/tokens.json` — exported from the Figma file — into a typed
theme module and a CSS variables file. `pnpm tokens:build` regenerates both, and
CI fails if what is committed is stale. Nothing in `src/ui` writes a hex value.

Styling is Uniwind on Tailwind v4, reading the same generated variables, so a
class and the theme object cannot disagree.

## Before you write any code here

Read [AGENTS.md](AGENTS.md).
