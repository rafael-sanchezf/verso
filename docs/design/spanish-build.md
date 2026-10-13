# The app in Spanish: the build plan

Rafa asked on 2026-10-13 to start the Spanish translation of the app. This is the plan it runs from: the layer, the waves, what each PR touches, and what stays English on purpose. The record of the decision is ROADMAP.md, decision 36.

## What exists now

Nothing spoke Spanish before this. The app had about 1,100 English sentences written into 158 screen files, no locale layer, and a date helper (`apps/mobile/src/lib/format.ts`) whose header said localization would land there when it arrived. Fourteen branches were in flight, so a single PR that rewrote every sentence would have conflicted with all of them.

## The layer (PR 1, VER-187)

`apps/mobile/src/lib/i18n/`:

- `model.ts`: the languages (`en`, `es`), the preference (`system` or a language), how the device's locales and the preference resolve into one language, `interpolate` for `{name}` variables, and `createLanguageStore`, a persisted holder after `createMediumStore`. No React, no native import; tested in `test/i18n-model.test.ts`.
- `store.ts`: the one store instance, shared by the screens and by `format.ts`.
- `en.ts` and `en/`: every sentence the app says, one module per wave (`common`, `sign-in`, `settings`, then `shell`, `onboarding`, `browse`, `lists`, `profile`, empty until their wave), each grouped by screen in the order the screen shows them. The source of truth for the shape.
- `es.ts` and `es/`: the same modules in Spanish, each typed against its English twin so a missing sentence does not compile. A test also checks that both carry the same `{variables}`.
- `dictionary.ts`: `TranslationKey` (every dotted path, so a typo is a compile error) and `translate`, with English as the run-time fallback and the key itself as the last resort.
- `index.ts`: the binding. `expo-localization` for the device's locales, read at start and again when Android comes to the foreground; `AsyncStorage` under `verso.language` for the preference; `t()` for any module and `useT()` for a component, which re-renders on a change; on web the document's `lang` follows.

`format.ts` keeps its shapes and gains one table per language for months, weekdays, Today and Yesterday, and the played word. Spanish writes the day first (`24 sept`, `2 sept 2025`), the RAE's lowercase month abbreviations, `Hoy`, `Ayer`, the weekday capitalized as a standalone label, and `14 h jugadas` or `40 min jugados`. Platform names, hour counts and the tilde are the same in both.

Settings gains an "App" section with one row, "Language": its value is the language the app is in (`Device (English)` while following the device), and it opens the action sheet with the device's language and each language the app speaks. The native header title for Settings and the browser tab title follow.

`app.json` declares both locales to the `expo-localization` plugin, so iOS lists Spanish as a language the app offers (the per-app language in the phone's Settings) and Android does the same. **This is a native change: the dev client on the phone and the simulator must be rebuilt before the device reports Spanish; a JS-only reload keeps the old binary's locale list.**

In PR 1 the sign-in sheet (every step, the auth errors, the Google messages, the web return page) and Settings are in Spanish. Everything else is still English and reads English in both languages until its wave.

## The register

Latin American Spanish following Apple's own Latin American Spanish (es-419), by Rafa's word (2026-10-13, twice: Latin American, then "follow Apple's guidelines"). The `tú` of consumer apps, never `vosotros`; the words used across Latin America rather than Spain's (`agregar`, not `añadir`; `computadora`, not `ordenador`; `celular`, not `móvil`; `video`, not `vídeo`); and wherever Apple's Latin American iOS has a word for a thing, that word, so the app sounds like the phone it runs on. Language names read in their own language in every dictionary. Still inferred: the capitalized standalone weekday (`Lunes`), one dictionary line to flip.

### The glossary every wave uses

Apple's es-419 words first, then Verso's own words, decided here so five waves agree. A wave that needs a word not on this list adds it here in its PR.

| English | Spanish | Note |
|---|---|---|
| Settings | Configuración | Apple es-419; Spain says Ajustes |
| Sign in / Sign out | Iniciar sesión / Cerrar sesión | Apple |
| Continue / Cancel / OK / Done / Save / Delete / Edit / Close / Back / Next (button) / Skip / Retry | Continuar / Cancelar / OK / Listo / Guardar / Eliminar / Editar / Cerrar / Atrás / Siguiente / Omitir / Reintentar | Apple |
| Add / Remove | Agregar / Quitar | Apple es-419, never Añadir |
| Search | Buscar | Apple |
| See all / More | Ver todo / Más | Apple |
| Share / Import / Export | Compartir / Importar / Exportar | Apple |
| Today / Yesterday / Tomorrow | Hoy / Ayer / Mañana | Apple |
| Home (tab) | Inicio | Apple |
| Profile / Activity / Calendar | Perfil / Actividad / Calendario | Apple |
| Games / Movies | Juegos / Películas | Verso; the switcher's words |
| game / film (in a sentence) | juego / película | Verso |
| Ranking (tab and noun) | Ranking | Verso; the word Spanish-speaking players use, and the brand's |
| rank (verb) | clasificar | Verso |
| Next (the games list tab) | Próximos | Verso; the games you play next |
| Watchlist | Por ver | Verso; Apple's TV app says "Por ver" |
| Backlog | Pendientes | Verso |
| Playing / Played / Finished / Dropped | Jugando / Jugado / Terminado / Abandonado | Verso |
| Watched / Rewatch | Vista / Volver a ver | Verso |
| Loved / Liked / Fine / Didn't like (the tiers) | Me encantó / Me gustó / Está bien / No me gustó | Verso |
| Too close / Can't compare | Muy parejos / No puedo comparar | Verso; the two escape hatches |
| Picks / Recommendations | Recomendaciones | Brand rule 2: a surface that shows recommendations is labelled as recommendations |
| Ask (the sheet) | Preguntar | Verso |
| Log (a watch, hours) | Registrar | Verso |
| Hours / Platforms / Genres / Notes / Released | Horas / Plataformas / Géneros / Notas / Estreno | Verso |
| Diary | Diario | Verso |
| Library | Biblioteca | Verso |
| Owned | En tu colección | Verso |
| medium (games, movies) / track a medium | medio / seguir | Verso, wave 2: "Agregar un medio", "Síguelo junto a lo que ya sigues" |
| Switch to (a medium) | Cambiar a | Verso, wave 2 |
| Clear (a field's value) | Borrar | Apple es-419, wave 2 |
| Any (a filter's no-choice row) | Cualquiera | Verso, wave 2 |
| Not now / Coming soon | Ahora no / Próximamente | Apple; wave 3 |
| Link / Unlink (an account) | Vincular / Desvincular | Apple es-419; wave 3 (Link Steam) |
| TV / Books (the held media) | TV / Libros | Verso; wave 3, the media questionnaire |
| place (a game in the list) / placed by us | ubicar / ubicado por nosotros | Verso; wave 3, the session and the review |
| Slide (the untouched deck slider) | Desliza | Verso; wave 3 |
| Up next (Home's block) / Coming up | A continuación / Próximamente | Apple Music's Up Next, Apple TV's Coming Soon; wave 4 |
| Recent / Popular (Search's sections) | Recientes / Populares | Apple; wave 4 |
| Details / About / Clear (a field) | Detalles / Acerca de / Borrar | Apple; wave 4 |
| Where to watch / Rent / Buy / In theaters | Dónde ver / Alquilar / Comprar / En cines | Apple TV; wave 4 |
| Cast / Runtime | Reparto / Duración | Apple TV; wave 4 |
| I finished this / I watched this | Lo terminé / La vi | Verso; wave 4 |
| Want to play / Want to watch | Quiero jugarlo / Quiero verla | Verso; wave 4 |
| Played on / Not recorded | Jugado en / Sin registrar | Verso; wave 4 |
| Time to beat | Para terminarlo | Verso; IGDB's average; wave 4 |
| a watch (a diary row) / Log another watch | vez / Registrar otra vez | Verso; "2.ª vez"; wave 4 |
| Move up / Move down (the confirm step) | Subir / Bajar | Verso; wave 4 |
| You (the score line) | Tú | Verso; wave 4 |
| Allow / Not now | Permitir / Ahora no | Apple; the ask sheet's permission step (wave 5) |
| Filters / Reset / Clear (filters) | Filtros / Restablecer / Borrar | Apple; wave 5 |
| Upcoming (the Next segment) | Por salir | Verso; games not out yet. Not Próximos, which is the tab (wave 5) |
| Release date | Fecha de lanzamiento (games) / Fecha de estreno (films) | Verso; Apple's App Store says lanzamiento, cinema says estreno (wave 5) |
| Date added / Time to beat | Fecha agregada / Tiempo para terminar | Verso; Next's sort menu (wave 5) |
| Length / Runtime | Duración | Verso; one word for both (wave 5) |
| In theaters / Streaming on X | En cines / Disponible en X | Verso; the Calendar (wave 5) |
| Going (the planned day) / Going? | Vas a ir / ¿Vas? | Verso; the Calendar and its sheet (wave 5) |
| Want to watch (the movie page's button) | Quiero ver | Verso; named by the Watchlist's empty state (wave 5), so wave 4's button should read the same |
| Link / Unlink (an account) | Vincular / Desvincular | Wave 6; Apple es-419 |
| Try again (button) / Not now | Reintentar / Ahora no | Wave 6; Apple |
| Friends | Amigos | Wave 6 |
| tier (the word, not a tier's name) | nivel | Wave 6; the Letterboxd draft's "tier line" |
| a watch (one diary line, noun) | visionado | Wave 6; "3 visionados van a tu diario" |
| Media you track (Edit profile) | Lo que sigues | Wave 6; avoids "medios", which reads as news media |
| Top N% of rankers (Profile's tile) | Top N% / de usuarios | Wave 6; short enough for a quarter-width tile |
| Recent (Profile's section) | Reciente | Wave 6 |
| A game genre in the comparison prompt and the rows (RPG, platformer, puzzle game...) | RPG, juego de plataformas, juego de puzles... | Wave 7; the whole table is `GENRE_DISPLAY_NAMES_ES` in `packages/core/src/genres.ts`. A noun "¿Qué {noun} disfrutaste más?" swallows whole: RPG, shooter, MOBA and RTS as players say them; aventura gráfica for point-and-click; juego de peleas (Latin America), not lucha |
| Which did you enjoy more? / Which {genre} did you enjoy more? | ¿Cuál disfrutaste más? / ¿Qué {genre} disfrutaste más? | Wave 7; core's `comparisonPrompt` |
| A film genre (Sci-fi, Thriller, War...) | Ciencia ficción, Suspenso, Bélica... | Wave 7; the table is `FILM_GENRES_ES` in `apps/mobile/src/lib/film.ts`. Suspenso is Latin America's Thriller. The prompt's noun carries "película" where Spanish needs it ("película de terror") |
| Older (the platform picker's chip) / Mobile (its family) | Anteriores / Celular | Wave 7; `platformPickLabel` and `platformFamilyLabel` in core. Console names stay names |
| Steam's review phrase (Very Positive...) | Muy positivas, Mayormente positivas, Variadas... | Wave 7; Steam's own Latin American store wording, in Steam's sentence case (`steamReviewPhraseLabel`) |
| a stretch (a weak fit, in a reason) | una apuesta | Wave 7; the suggest function's rule 8, the same words on every card |
| Because you put X in Loved / Fits your taste for / Among the best-rated | Porque pusiste X en “Me encantó” / Encaja con tu gusto por / Entre los juegos mejor valorados | Wave 7; the template reason, in the function and in `packages/api` word for word |
| Steam / Letterboxd / Game Pass / PlayStation / Xbox / Switch | unchanged | Names |

## The rules for every wave

1. A screen's sentences move into the wave's module (`en/<wave>.ts`) unchanged, under the screen's key, in the order the screen shows them, and the Spanish into `es/<wave>.ts`. A wave edits those two files and its screens, never another wave's module, `en.ts` or `es.ts`. Changing an English sentence is a copy decision and is not done in a translation PR.
2. Every component that shows a sentence calls `useT()` once at the top and uses that `t`; a module with no render (an error mapper, a dialog built in a handler, a route file's title) calls `t()` from `@/lib/i18n`.
3. A sentence with a number or a name uses a `{variable}`, never string concatenation, so the Spanish can put the words in its own order.
4. A word that is data stays data: a title, a platform, a person's name, a catalog's own genre name. A genre's display name from core is not data since wave 7: it is said in the app's language (`genreDisplayName(genre, language)`).
5. The typecheck is the completeness check. A key added to `en.ts` without its Spanish line does not compile; the dictionary test catches a `{variable}` that differs between languages.
6. Spanish runs 20 to 30 percent longer. A wave's PR says which rows, chips and buttons it checked on the simulator in Spanish at the largest default text size, and files a card for any that truncate rather than shortening the Spanish.

## The waves

Each wave is one PR. Rafa asked on 2026-10-13 to run waves 2 to 6 at once rather than waiting for the open branches, so each is built on the foundation branch and its PR opens against main the moment PR #109 merges (never a PR based on another open PR). The order follows what a Spanish-speaking friend in the beta meets first.

| Wave | Screens | Waits for |
|---|---|---|
| 1 (this PR) | The layer; sign-in; Settings; dates and hours in `format.ts` | Nothing |
| 2 | The shell: tab labels (`ui/tab-bar.ts`), `MEDIUM_WORDS` (`state/medium-model.ts`), the screen headers, the medium switcher, `EmptyState` and the error line, the dialog's OK and Cancel, the native stack titles in `app/_layout.tsx` | The movies build's open PRs |
| 3 | Onboarding: the questionnaire, the bulk-entry deck per medium, the session and its review | VER-168's redraw |
| 4 | Home for games and for movies, Search, the game page, the movie page, the log sheet | Wave 2 |
| 5 | Ranking, Next, Watchlist and Calendar, the ask sheet | Wave 2 |
| 6 | Profile, Activity, Edit profile, Steam and Letterboxd imports, the export and import copy | Wave 2 |
| 7 | Core's words: genre display names and the suggest reason (`packages/core`), which need a dictionary of their own since core has no React and no device | Wave 4 |

**Wave 7, as built (VER-211, 2026-10-13).** Core gained `Language` (the one definition; the app's `lib/i18n/model.ts` re-exports it), and every word core says takes one and defaults to English: `genreDisplayName(genre, language)` over a Spanish table, `comparisonPrompt(state, { language })` and `genreCue(state, language)` (the overrides still win), `platformFamilyLabel` and `platformPickLabel` beside the English `PLATFORM_FAMILIES`, which stay the identity, and `steamReviewPhraseLabel`. The app's film helper (`lib/film.ts`) has a Spanish table read through `languageStore`, as `format.ts` does; `format.genres` and `genreLabel` follow the language, the genre icons stay keyed by the English name. The callers pass the language: the compare step and stage through `useLanguage()`, the pure modules (Ranking's namer, the score line, the platform picks) through the store. The ask sends `language` to the `suggest` function, which accepts `en` or `es` (English when absent, anything else refused), adds one rule to the system prompt for Spanish (Latin American, `tú`, "una apuesta" for "a stretch"), and writes its template reasons in Spanish too, as does `plainSuggestions` on the device. English is sent as nothing, so an English ask still passes a function deployed before this wave; a Spanish ask needs the function redeployed (`supabase functions deploy suggest`, which nothing runs on merge).

## Held, on purpose

- **Supabase's emails** (confirmation, reset) are English templates in the hosted project's Auth settings. Spanish ones are a hosted-project change Rafa runs, filed as a card once wave 1 merges.
- **The reason line and the ask's answer** now follow the person's language (wave 7): the model writes in it, and the template reasons (the fallback, the short list, "Not now") are written in it. What stays English inside a Spanish reason is data: a title, and a genre or platform named from the catalog (`comparte el género Roguelike`). Spanish reasons need the redeployed function.
- **The catalog's genre words inside a reason** are IGDB's and TMDB's English names, as above; translating them is the catalog's question, not the reason's.
- **The catalog's text** (a film's overview, a game's summary) is IGDB's and TMDB's English. TMDB serves Spanish overviews on request; whether to mirror them is a catalog-size question (VER-173) before it is a translation one.
- **The site** (rankverso.com) is a separate build in the private repo, filed as its own card.
- **A third language** adds one `xx.ts` file, one entry in `LANGUAGES`, one table in `format.ts` and one line in `app.json`. Nothing else knows how many there are.
