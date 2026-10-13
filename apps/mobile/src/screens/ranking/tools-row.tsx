/**
 * The row under the header: what you are looking at, and how.
 *
 * `FilterChip` and `MenuChip` were built here on the Ranking screen's branch,
 * because `src/ui` was shared by six other screen branches at the time;
 * Phase 3 promoted both into `@/ui`, where the next screen that filters a list
 * can find them.
 *
 * What is still this screen's own is `ViewToggle`: two 16pt icons in a 2pt
 * trough, where `SegmentedControl` draws equal widths with labels. A different
 * control, and only Ranking has two views.
 *
 * Each filter's values carry an icon at 16, in the sheet and on the chip once
 * chosen: a genre's Lucide icon (entry 3 in docs/private/phone-feedback.md)
 * and a platform's brand mark, the one the game page draws (entry 5). The words
 * beside them are the ones the rest of the app prints: the genre's display name
 * with a capital, the platform's short name.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import type { Medium } from '@verso/core';

import { platformShortName } from '@/lib/format';
import { useT, type TranslationKey } from '@/lib/i18n';
import { Chip, GenreIcon, Icon, MenuChip, PlatformIcon, useTheme } from '@/ui';

import { genreChipLabel, isFiltered, type RankingFilters } from './model';

export type RankingView = 'list' | 'grid';

export interface ToolsRowProps {
  /** Films name their genres by TMDB's labels and have no Platform filter. */
  medium?: Medium;
  filters: RankingFilters;
  onFiltersChange: (filters: RankingFilters) => void;
  /** Every genre in the whole ranking, as IGDB names (`genreOptions`); not just the filtered subset. */
  genres: readonly string[];
  /**
   * Where the user played the ranked games, as catalog names (`platformOptions`):
   * the played-on platforms, a game's catalog list only when it has none recorded.
   */
  platforms: readonly string[];
  view: RankingView;
  onViewChange: (view: RankingView) => void;
}

export function ToolsRow({
  medium = 'game',
  filters,
  onFiltersChange,
  genres,
  platforms,
  view,
  onViewChange,
}: ToolsRowProps) {
  const t = useT();
  const theme = useTheme();
  const filtered = isFiltered(filters);

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] },
      ]}>
      <View style={[styles.filters, { gap: theme.space[2] }]}>
        <Chip
          label={t('lists.ranking.all')}
          size={14}
          variant={filtered ? 'surface' : 'filled'}
          onPress={filtered ? () => onFiltersChange({ genre: null, platform: null }) : undefined}
        />
        {genres.length > 0 ? (
          <MenuChip
            name={t('lists.ranking.genre')}
            value={filters.genre}
            options={genres}
            // The chip and the sheet read "RPG"; the value that comes back is
            // IGDB's `Role-playing (RPG)`, which the icon is looked up by.
            formatOption={(genre) => genreChipLabel(medium)(genre) ?? genre}
            // TMDB's genres have no icon set of their own yet; IGDB's would mislabel them.
            renderIcon={(genre, color) => (medium === 'movie' ? null : <GenreIcon genre={genre} color={color} />)}
            onChange={(genre) => onFiltersChange({ ...filters, genre })}
          />
        ) : null}
        {platforms.length > 0 ? (
          <MenuChip
            name={t('lists.ranking.platform')}
            value={filters.platform}
            options={platforms}
            // The chip and the sheet read "PS5"; the value that comes back, and
            // that `filterItems` matches on, is the catalog's own name.
            formatOption={platformShortName}
            // The mark alone: the short name beside it already says which
            // PlayStation, so no suffix, and a platform with no mark shows
            // the gamepad without repeating its name.
            renderIcon={(platform, color) => <PlatformIcon name={platform} color={color} markOnly />}
            onChange={(platform) => onFiltersChange({ ...filters, platform })}
          />
        ) : null}
      </View>

      <ViewToggle value={view} onChange={onViewChange} />
    </View>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: RankingView;
  onChange: (view: RankingView) => void;
}) {
  const t = useT();
  const theme = useTheme();

  return (
    <View
      style={[
        styles.toggle,
        { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.sm },
      ]}>
      {VIEWS.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={t(option.label)}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.toggleButton,
              selected && { backgroundColor: theme.colors['bg/canvas'] },
              pressed && styles.pressed,
            ]}>
            <Icon
              name={option.value === 'list' ? 'list' : 'grid-2x2'}
              size={16}
              color={selected ? 'text/primary' : 'text/secondary'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const VIEWS: readonly { value: RankingView; label: TranslationKey }[] = [
  { value: 'list', label: 'lists.ranking.listView' },
  { value: 'grid', label: 'lists.ranking.gridView' },
];

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    // The chips give way to the toggle when a genre name is long, rather than
    // pushing it off the edge.
    flexShrink: 1,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    gap: 2,
  },
  toggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pressed: { opacity: 0.7 },
});
