/**
 * The grid's column count, kept on the device per user (the build's default
 * 2). A failed read is three across, a failed write keeps the count for the
 * session.
 *
 * Two guards, as the medium store has: a pinch made before the stored value
 * answered wins over it, and once a value is in hand (read or pinched) the
 * read does not run again when the session's user arrives and the key
 * changes. Only a key that has answered nothing yet is read again.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSession } from '@/lib/use-session';

import { columnsStorageKey, DEFAULT_COLUMNS, parseColumns, type Columns } from './zoom';

export function useColumns(): [Columns, (next: Columns) => void] {
  const session = useSession();
  const key = columnsStorageKey(session.user?.id ?? null);
  const [columns, setColumns] = useState<Columns>(DEFAULT_COLUMNS);
  // Set by a pinch, or by a stored value that was read.
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current) return;
    let cancelled = false;
    void AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || settled.current || raw === null) return;
        settled.current = true;
        setColumns(parseColumns(raw));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback(
    (next: Columns) => {
      settled.current = true;
      setColumns(next);
      void AsyncStorage.setItem(key, String(next)).catch(() => undefined);
    },
    [key],
  );

  return [columns, update];
}
