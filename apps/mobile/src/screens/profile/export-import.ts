/**
 * Settings → Data: Export as JSON, Export as CSV, Import from a file
 * (profile.md, "Behavior"). On the phone each export is written to a file
 * with `expo-file-system` and handed to the share sheet with `expo-sharing`,
 * exactly as the spec asks; in a browser, where neither exists, it is a
 * download. `lib/save-file.ts` holds both ways behind one signature. Import
 * picks a file with `expo-document-picker` (a file input on web) and reads it
 * back through the same module. The JSON and CSV themselves are built in
 * `@verso/api` and are the same on every platform.
 */

import { exportUserData, exportUserDataCsv, importEntries, ImportValidationError, type ImportResult } from '@verso/api';
import * as DocumentPicker from 'expo-document-picker';

import { readTextFile, saveFile } from '@/lib/save-file';
import { supabase } from '@/lib/supabase';

function timestampedName(extension: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `verso-export-${stamp}.${extension}`;
}

/** Export as JSON: the whole document (entries, rankings, comparisons), unchanged. */
export async function exportJson(): Promise<void> {
  const doc = await exportUserData(supabase);
  await saveFile(timestampedName('json'), JSON.stringify(doc, null, 2), 'application/json');
}

/** Export as CSV: one row per entry, ranking columns included. See `exportUserDataCsv`'s own doc comment for the shape. */
export async function exportCsv(): Promise<void> {
  const csv = await exportUserDataCsv(supabase);
  await saveFile(timestampedName('csv'), csv, 'text/csv');
}

export interface PickedFile {
  uri: string;
  name: string;
  /** Web only: the browser's own `File`, which the picker returns there and which is read directly. */
  webFile?: Blob;
}

/** Opens the document picker restricted to JSON. Null if the user cancelled. */
export async function pickImportFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0]!;
  return { uri: asset.uri, name: asset.name, ...(asset.file ? { webFile: asset.file } : null) };
}

/** Reads and imports the picked file. Throws `ImportValidationError` for a file that is not a Verso export. */
export async function importFromFile(picked: PickedFile): Promise<ImportResult> {
  const text = await readTextFile(picked.uri, picked.webFile);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportValidationError(['the file is not valid JSON']);
  }

  return importEntries(supabase, parsed);
}

/** A message worth putting in an alert: the validator's own wording, or a generic fallback. */
export function importErrorMessage(cause: unknown): string {
  if (cause instanceof ImportValidationError) return cause.message;
  return cause instanceof Error ? cause.message : 'Something went wrong. Try again.';
}
