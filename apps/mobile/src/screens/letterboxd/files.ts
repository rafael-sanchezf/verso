/**
 * Picking the export's files and reading them back.
 *
 * Letterboxd mails a zip; iOS unzips it with one tap in Files, and the user
 * picks the CSVs inside. More than one at a time, because the ratings and the
 * diary are two files and the import wants both. The picker is asked for CSV
 * by three names, since iOS, Android and the Files app do not agree on one,
 * and for plain text as a fallback for a file whose type the system never
 * worked out; `readLetterboxdFile` decides by the header row anyway.
 */

import { readLetterboxdFile, type LetterboxdFile } from '@verso/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export interface PickedFile {
  uri: string;
  name: string;
}

/** Opens the document picker for one or more CSVs. Null if the user cancelled. */
export async function pickLetterboxdFiles(): Promise<PickedFile[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', 'text/plain'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name }));
}

/** Reads every picked file as a Letterboxd file, in the order picked. Never throws for a file that is not one. */
export async function readPickedFiles(files: readonly PickedFile[]): Promise<LetterboxdFile[]> {
  return Promise.all(
    files.map(async (picked) => {
      const text = await new File(picked.uri).text();
      return readLetterboxdFile(picked.name, text);
    }),
  );
}

/** One line per file for the review screen: what each turned out to be. */
export function fileNote(file: LetterboxdFile): string {
  switch (file.kind) {
    case 'ratings':
    case 'diary':
    case 'reviews':
    case 'watched':
    case 'import': {
      const rows = `${file.rows.length} ${file.rows.length === 1 ? 'row' : 'rows'}`;
      return file.malformed > 0 ? `${file.name}: ${rows}, ${file.malformed} unreadable` : `${file.name}: ${rows}`;
    }
    case 'watchlist':
      return `${file.name}: skipped, a watchlist is not watched`;
    case 'ambiguous':
      return `${file.name}: skipped, could not tell watched from watchlist by its name`;
    case 'unknown':
      return `${file.name}: not a Letterboxd file`;
  }
}
