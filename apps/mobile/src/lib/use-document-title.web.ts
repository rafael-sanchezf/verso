/**
 * Name the browser tab's page from a screen. Web: sets `document.title`.
 *
 * Called from the shell's route files ("Home", "Settings", ...) with the
 * page's name. The title is set when the screen comes into focus and put back
 * to the plain app name when it goes out, so a screen that does not call the
 * hook (a game page, a sheet) reads "Verso" rather than the title of whatever
 * was open before it. React Navigation emits the blur before the focus, so
 * going from one named screen to another ends on the second's title.
 *
 * Why not `expo-router/head` or a navigator `title` option: the router
 * disables React Navigation's own document-title handling, so `title` in
 * `options` never reaches the tab, and `<Head>` renders on web but registers a
 * Handoff activity on iOS (see `use-document-title.ts`). Setting the property
 * directly is the one mechanism that is identical in every output mode and
 * invisible to the phone.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { APP_TITLE, documentTitleFor } from './document-title';

/** Set the tab title to "<page> · Verso" while the screen is in front. */
export function useDocumentTitle(page?: string | null): void {
  useFocusEffect(
    useCallback(() => {
      if (typeof document === 'undefined') return undefined;
      document.title = documentTitleFor(page);
      return () => {
        document.title = APP_TITLE;
      };
    }, [page]),
  );
}
