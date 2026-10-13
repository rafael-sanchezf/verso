/** Settings, pushed from Profile (screens/profile/settings-screen.tsx). Wave 1. */

export const settings = {
  title: 'Settings',
  sections: {
    profile: 'Profile',
    account: 'Account',
    linkedAccounts: 'Linked accounts',
    data: 'Data',
    app: 'App',
    about: 'About',
    developer: 'Developer',
  },
  editProfile: 'Edit profile',
  email: 'Email',
  signOut: 'Sign out',
  deleteAccount: 'Delete account',
  steam: 'Steam',
  exportJson: 'Export as JSON',
  exportCsv: 'Export as CSV',
  importFromFile: 'Import from a file',
  importFromLetterboxd: 'Import from Letterboxd',
  version: 'Version',
  primitives: 'Primitives',
  couldNotSignOut: 'Could not sign out',
  deleteAccountTitle: 'Delete your account?',
  deleteAccountMessage: 'Your rankings, backlog, and profile are removed. This cannot be undone.',
  couldNotDelete: 'Could not delete your account',
  exportFailed: 'Export failed',
  importTitle: 'Import from a file',
  importMessage:
    'This adds or overwrites entries in your library from "{name}". Rankings and comparisons in the file are not restored — only entries are.',
  importComplete: 'Import complete',
  /** `{unmatched}` is `importUnmatched` or nothing. */
  importSummary: '{created} added, {updated} updated{unmatched}.',
  importUnmatched: ', {count} not found in the catalog',
  importFailed: 'Import failed',
} as const;
