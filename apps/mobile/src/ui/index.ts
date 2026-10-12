/**
 * The shared primitives. Import from `@/ui`, never from a file inside it.
 *
 * This folder belongs to the shell. A screen that needs a primitive it does not
 * find here builds it inside its own `src/screens/<name>/` folder and says so
 * in its PR, rather than editing these — seven parallel screen branches
 * editing one folder is seven conflicts.
 */

export { Button, Pressed, TextButton, type ButtonProps, type ButtonSize, type ButtonVariant } from './button';
export { Chip, type ChipProps, type ChipVariant } from './chip';
// `coverHeight` is exported for the skeletons and fixed row heights that mirror
// a cover: one ratio, read from one place (rule 29).
export { Cover, COVER_ASPECT, coverHeight, type CoverProps } from './cover';
// The web primitives of W1 (web-brief.md): each renders on native too, as the
// platform's own control or as nothing, so a screen imports them unguarded.
export { DateField, type DateFieldProps } from './date-field';
export { Dialog, DialogHost, type DialogProps } from './dialog';
export { Menu, MenuList, type MenuItem, type MenuListProps, type MenuProps } from './menu';
export { EmptyState, EmptyStateCard, type EmptyStateProps } from './empty-state';
// The two states specs/README.md defines for every screen and the frames never
// drew. Five copies of each before Phase 3; one now.
export { ErrorLine, type ErrorLineProps } from './error-line';
export { Skeleton, type SkeletonProps } from './skeleton';
export { FilterChip, MenuChip, type FilterChipProps, type MenuChipProps } from './filter-chip';
export { GenreIcon, type GenreIconProps } from './genre-icon';
export { FieldLabel, SheetFrame, type SheetFrameProps } from './sheet-frame';
export { Icon, ICON_NAMES, type IconName, type IconProps } from './icon';
export { ListRow, type ListRowProps } from './list-row';
export {
  PlatformChip,
  PlatformIcon,
  type PlatformChipProps,
  type PlatformIconProps,
} from './platform-icon';
export { MediumChip, ScreenHeader, type ScreenHeaderProps } from './screen-header';
export { ScoreBadge, tierPalette, type ScoreBadgeProps } from './score-badge';
export { SegmentedControl, type Segment, type SegmentedControlProps } from './segmented-control';
export { Sheet, type SheetProps } from './sheet';
export { Text, joinParts, textStyles, type TextProps } from './text';
export {
  TierChip,
  TIER_ICONS,
  TIER_LABELS,
  TIER_ORDER,
  tierColor,
  type TierChipProps,
} from './tier-chip';
export { GoogleMark, VersoMark } from './marks';
export { NotBuiltYet, type NotBuiltYetProps } from './not-built-yet';
export { navigationThemeFor } from './navigation-theme';
export { TABS, TabBar } from './tab-bar';
export {
  FONT_FAMILIES,
  FONT_WEIGHTS,
  ThemeScope,
  fontFamilyFor,
  themeFor,
  useTheme,
  type ColorScheme,
  type ColorToken,
  type FontStyle,
  type FontWeight,
  type RadiusToken,
  type SpaceToken,
  type Theme,
} from './theme';
