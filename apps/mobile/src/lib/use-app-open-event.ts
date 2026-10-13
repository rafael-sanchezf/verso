/**
 * Log `app_open` once per calendar day, on launch and whenever the app comes
 * back to the foreground (specs/onboarding.md, "Events"; the day-7 return is
 * read from these rows rather than logged).
 *
 * Into Verso's own `events` table and nowhere else: no SDK, no third party
 * (decision 21, guidelines principle 12). A failed write is a lost data point,
 * not a reason to bother the user, so it is dropped and tried again on the
 * next foreground; the day is stamped only once the row has landed.
 *
 * Mounted once, in the root layout, with the signed-in user's id (null signed
 * out, which does nothing).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { APP_OPEN_KEY, appOpenDue, appOpenStamp, localDay } from './app-open';
import { logAppEvent } from './log-event';

export function useAppOpenEvent(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    let running = false;

    const check = async () => {
      if (running) return;
      running = true;
      try {
        const day = localDay(new Date());
        const stored = await AsyncStorage.getItem(APP_OPEN_KEY).catch(() => null);
        if (!appOpenDue(stored, userId, day)) return;
        await logAppEvent('app_open');
        await AsyncStorage.setItem(APP_OPEN_KEY, appOpenStamp(userId, day));
      } catch {
        // Dropped on purpose: see the header.
      } finally {
        running = false;
      }
    };

    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [userId]);
}
