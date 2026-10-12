/**
 * What the browser tab says, as a pure rule.
 *
 * Under the `single` web output the router never sets `document.title` itself
 * (Expo Router turns React Navigation's document-title handling off), so each
 * screen names its own page through `useDocumentTitle` and this is the one
 * place that decides how a page name becomes a title: "Ranking" is "Ranking ·
 * Verso", and no name at all is just "Verso", which is also what the exported
 * `index.html` carries before any script runs (`web.name` in `app.json`).
 *
 * Kept free of React and React Native so the rule can be tested in Node.
 */

/** The app's name as it appears in a title; `web.name` in `app.json` says the same. */
export const APP_TITLE = 'Verso';

/** The title for a page name: "Home · Verso", or "Verso" when there is no page name. */
export function documentTitleFor(page?: string | null): string {
  const name = page?.trim();
  return name ? `${name} · ${APP_TITLE}` : APP_TITLE;
}
