/**
 * The languages Verso speaks, for the words core says: a genre's name in the
 * comparison prompt, a platform family's label, Steam's review phrase
 * (docs/design/spanish-build.md, wave 7).
 *
 * Core has no React and no device, so it never decides the language. Every
 * function that says a word takes one and defaults to English; the app passes
 * the language it is in. This is the one definition: the app's `lib/i18n`
 * re-exports it rather than keeping a second.
 */
export type Language = 'en' | 'es';
