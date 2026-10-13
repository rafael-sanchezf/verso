/**
 * The Watchlist's filter sheet (frame `Watchlist · Filters` 273:53; Rafa's
 * letters on the site round, 2026-10-12, and round three's ticks).
 *
 * Length as the six-stop slider, Genre as chips from the watchlist's own
 * genres, Director as a field that suggests the watchlist's own directors,
 * Decade as chips, Sort as a segmented control, then "Show N films". The
 * sheet edits a draft; "Show N films" applies it and closes, and closing any
 * other way leaves the filters as they were (the iOS filter-sheet convention,
 * rule 7). "Reset" clears the draft's filters and keeps its sort. Mood, from
 * the engine's tags, comes later and is not drawn.
 *
 * The count on the button is `matchesAll` over the unfiltered watchlist with
 * the draft and the current services scope: the number the grid will show.
 */

import type { MovieWatchlistRow } from '@verso/api';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { filmGenreLabel } from '@/lib/film';
import { Button, Chip, fontFamilyFor, Icon, SegmentedControl, Sheet, Text, TextButton, useTheme } from '@/ui';

import {
  DECADES,
  directorSuggestions,
  filtersReducer,
  genreOptions,
  matchesAll,
  showLabel,
  SORTS,
  type WatchlistFilters,
  type WatchlistSort,
} from './filters';
import { LengthSlider } from './length-slider';

/** Genre chips shown before "More". */
const GENRES_FOLDED = 6;

export function FilterSheet({
  visible,
  applied,
  rows,
  onMyServices,
  onApply,
  onDismiss,
}: {
  visible: boolean;
  applied: WatchlistFilters;
  /** The whole watchlist, unfiltered: the genres, the directors and the count come from it. */
  rows: readonly MovieWatchlistRow[];
  onMyServices: boolean;
  onApply: (filters: WatchlistFilters) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [draft, dispatch] = useReducer(filtersReducer, applied);
  const [moreGenres, setMoreGenres] = useState(false);
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);

  // Each opening starts from what is applied.
  useEffect(() => {
    if (!visible) return;
    dispatch({ type: 'replace', filters: applied });
    setTyped('');
    setTyping(false);
    setMoreGenres(false);
  }, [visible, applied]);

  const genres = useMemo(() => genreOptions(rows), [rows]);
  const shownGenres = moreGenres ? genres : genres.slice(0, GENRES_FOLDED);
  const suggestions = useMemo(() => directorSuggestions(rows, typed), [rows, typed]);
  // A name typed and not picked from the suggestions still counts: it is the
  // director the sheet applies, matched as a whole name, any case.
  const effective = useMemo(
    () => (typing && typed.trim() !== '' ? filtersReducer(draft, { type: 'director', director: typed }) : draft),
    [draft, typed, typing],
  );
  const count = useMemo(
    () => rows.filter((row) => matchesAll(row, effective, onMyServices)).length,
    [rows, effective, onMyServices],
  );

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <ScrollView
        style={{ maxHeight: height * 0.78 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 20, paddingTop: theme.space[3], paddingBottom: theme.space[2] }}>
        <View style={styles.header}>
          <Text size={20} weight={600}>
            Filters
          </Text>
          <TextButton label="Reset" size={15} color="text/secondary" onPress={() => dispatch({ type: 'reset' })} />
        </View>

        <Block title="Length">
          <LengthSlider value={draft.maxMinutes} onChange={(maxMinutes) => dispatch({ type: 'length', maxMinutes })} />
        </Block>

        {genres.length > 0 ? (
          <Block title="Genre">
            <View style={[styles.wrap, { gap: theme.space[2] }]}>
              {shownGenres.map((genre) => {
                const on = draft.genres.includes(genre);
                return (
                  <Chip
                    key={genre}
                    label={filmGenreLabel(genre) ?? genre}
                    size={14}
                    variant={on ? 'played' : 'surface'}
                    onPress={() => dispatch({ type: 'genre', genre })}
                  />
                );
              })}
              {genres.length > GENRES_FOLDED && !moreGenres ? (
                <Chip label="More" size={14} icon="chevron-down" onPress={() => setMoreGenres(true)} />
              ) : null}
            </View>
          </Block>
        ) : null}

        <Block title="Director">
          <View
            style={[
              styles.field,
              { backgroundColor: theme.colors['bg/surface'], borderRadius: theme.radius.md, gap: theme.space[2] },
            ]}>
            <Icon name="search" size={18} color="text/secondary" />
            <TextInput
              value={typing ? typed : (draft.director ?? '')}
              onChangeText={(text) => {
                setTyping(true);
                setTyped(text);
                if (text.trim() === '') dispatch({ type: 'director', director: null });
              }}
              onFocus={() => {
                setTyping(true);
                setTyped(draft.director ?? '');
              }}
              // Leaving the field keeps what was typed as the director, and keeps
              // the suggestions up: on the web a tap on one blurs the field
              // first, and hiding them then would swallow the tap.
              onBlur={() => {
                if (typed.trim() !== '') dispatch({ type: 'director', director: typed });
              }}
              placeholder="Any director"
              placeholderTextColor={theme.colors['text/secondary']}
              autoCorrect={false}
              accessibilityLabel="Director"
              style={[styles.input, { color: theme.colors['text/primary'], fontFamily: fontFamilyFor(400) }]}
            />
            {draft.director !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear director"
                hitSlop={12}
                onPress={() => {
                  dispatch({ type: 'director', director: null });
                  setTyped('');
                }}>
                <Icon name="x" size={16} color="text/secondary" />
              </Pressable>
            ) : null}
          </View>
          {typing && suggestions.length > 0 && !suggestions.some((name) => name === typed.trim()) ? (
            <View>
              {suggestions.map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => {
                    dispatch({ type: 'director', director: name });
                    setTyped(name);
                    setTyping(false);
                  }}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                  <Text size={16}>{name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Block>

        <Block title="Decade">
          <View style={[styles.wrap, { gap: theme.space[2] }]}>
            {DECADES.map(({ value, label }) => (
              <Chip
                key={value}
                label={label}
                size={14}
                variant={draft.decades.includes(value) ? 'played' : 'surface'}
                onPress={() => dispatch({ type: 'decade', decade: value })}
              />
            ))}
          </View>
        </Block>

        <Block title="Sort">
          <SegmentedControl<WatchlistSort>
            segments={SORTS}
            value={draft.sort}
            onChange={(sort) => dispatch({ type: 'sort', sort })}
          />
        </Block>

        <Button label={showLabel(count)} onPress={() => onApply(effective)} />
      </ScrollView>
    </Sheet>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2] + 2 }}>
      <Text size={13} weight={600} color="text/secondary">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  input: { flex: 1, fontSize: 17, padding: 0 },
  suggestion: { paddingVertical: 10 },
  pressed: { opacity: 0.6 },
});
