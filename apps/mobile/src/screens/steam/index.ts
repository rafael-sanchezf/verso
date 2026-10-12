/**
 * What other screens use from the Steam folder.
 *
 * The onboarding's "Link Steam" screen (bulk-entry-build.md, PR 4) offers the
 * same link as Settings → Steam, so the flow is exported rather than copied:
 * `LinkSteamButton` for the button and its failure line, `useSteamLink` for a
 * screen that wants the phases itself, `useSteamAccount` to know whether there
 * is a link already (offer the button "only if not linked"), and
 * `useSteamImport` to run the import once the link lands. onboarding.md then
 * pushes "the import and candidates screens of that flow, then the tabs", so
 * the two screens are exported too, with their exits (`onImported`,
 * `onNotNow`, `onDone`) open for a stack that ends somewhere other than
 * Settings.
 */

export { LinkSteamButton, type LinkSteamButtonProps } from './link-steam-button';
export {
  useSteamAccount,
  useSteamLink,
  useUnlinkSteam,
  type SteamLinkFlow,
  type UseSteamLinkOptions,
} from './use-steam-link';
export { useSteamImport, type ImportMove, type SteamImport } from './use-steam-import';
export { SteamAttribution } from './attribution';
export { SteamCandidatesScreen, type SteamCandidatesScreenProps } from './candidates-screen';
export { SteamPrivacyScreen, type SteamPrivacyScreenProps } from './privacy-screen';
export type { LinkPhase } from './link-flow';
export type { LinkReturn } from './link-return';
