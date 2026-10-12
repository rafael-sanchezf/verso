/**
 * Name the browser tab's page from a screen. Native: nothing to name.
 *
 * The web build is `use-document-title.web.ts`; this is its no-op twin so a
 * screen can call the hook unconditionally. `expo-router/head` is not used
 * for this because on iOS it is the Handoff and Spotlight API, not a no-op:
 * a `<Head>` in a shared screen would publish an activity for the phone.
 */

/** Set the tab title to "<page> · Verso" while the screen is in front. No-op on native. */
export function useDocumentTitle(_page?: string | null): void {}
