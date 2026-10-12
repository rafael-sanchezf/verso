/**
 * A file out of the app, and a picked file back in: the browser's way.
 *
 * Out: the file is built in memory as a Blob and downloaded through an anchor
 * with `download` set, which is how a web app saves a file it made (W0 finding
 * 6). The browser decides where it goes, as it does for every download.
 * In: `expo-document-picker` is a file input on web and returns the browser's
 * `File` beside a `uri` (a data URL by default); the `File` is read directly,
 * and the `uri` through `fetch` if a picker ever leaves the `File` out.
 *
 * Same signatures as `save-file.ts`.
 */

/** Save `contents` as `filename`: in a browser, a download. */
export async function saveFile(filename: string, contents: string, mimeType: string): Promise<void> {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  // Firefox follows a click only on an anchor that is in the document.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoked a moment later rather than at once: the click starts the download
  // asynchronously, and a URL revoked before it is read downloads nothing.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The text of a picked file: the browser's `File` when there is one, else the `uri`. */
export async function readTextFile(uri: string, webFile?: Blob): Promise<string> {
  if (webFile) return webFile.text();
  const response = await fetch(uri);
  return response.text();
}
