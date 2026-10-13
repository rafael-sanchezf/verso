/**
 * The words every screen shares, and the language picker's own.
 *
 * `common` is the buttons every dialog has; `language` is the Settings row
 * and the names of the languages, each in its own language.
 */

export const common = {
  cancel: 'Cancel',
  ok: 'OK',
  continue: 'Continue',
  save: 'Save',
  delete: 'Delete',
  import: 'Import',
} as const;

export const language = {
  title: 'Language',
  system: 'Device language',
  /** The row's value while following the device: `Device (English)`. */
  systemValue: 'Device ({language})',
  en: 'English',
  es: 'Español',
} as const;
