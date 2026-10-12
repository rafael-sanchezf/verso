/**
 * A file out of the app, and a picked file back in: the phone's way.
 *
 * Out: write it to the cache with `expo-file-system` and hand it to the share
 * sheet with `expo-sharing`, where the person chooses Files, Mail or AirDrop.
 * In: read the file the document picker copied to the cache.
 *
 * Neither module exists in a browser (W0 finding 6: Export as JSON and as CSV
 * failed there, silently), so `save-file.web.ts` has the same two functions
 * with the browser's means: a download, and the `File` the picker hands back.
 * Metro picks the file by platform; the signatures are the same, and this one
 * is what TypeScript checks callers against.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Save `contents` as `filename`: on the phone, through the share sheet. */
export async function saveFile(filename: string, contents: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.write(contents);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}

/**
 * The text of a picked file. `uri` is the copy in the cache; `webFile` is the
 * browser's `File` and is never set on the phone.
 */
export async function readTextFile(uri: string, _webFile?: Blob): Promise<string> {
  return new File(uri).text();
}
