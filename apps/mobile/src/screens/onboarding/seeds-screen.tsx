/**
 * "Games you love" (specs/onboarding.md, frame 96:46) and "Films you love"
 * (movies-build.md, PR 6, item 3; frame 286:59): the first ranked titles,
 * found the way Search finds them, and the genres the deck's order starts
 * from (guidelines: Netflix's three titles, Spotify's three artists,
 * Letterboxd's four favourites). One screen for both media; `?medium=movie`
 * is the films' (Search with `medium: 'movie'`, posters at 2:3, rows
 * "year · genre").
 *
 * Search's field and its 250 ms debounce, Search's result row with a plus
 * pill; a tap on a result adds it to the list and clears the field. "Rank"
 * waits for three and takes any number past it (Rafa's letters, 2026-10-14,
 * VER-228: no count in the copy). It marks each game played (`startRanking`,
 * which writes no finished date, VER-281), or each film seen before Verso
 * (`logSeen`, an undated diary row), and opens the session with the picks in
 * Loved and no predictions; the session goes straight on to the deck, with no
 * review (`onDone: 'deck'`).
 *
 * Rules (the floor, the slot, the button) are in seeds.ts. A tap on a pick's
 * check takes it back out.
 */

import { coverCandidates, logSeen, searchGames, startRanking, type OnboardingGameRow } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { filmMeta } from '@/lib/film';
import { useT } from '@/lib/i18n';
import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { useDebouncedQuery } from '@/screens/search/debounce';
import { GameRowSkeletons } from '@/screens/search/placeholders';
import { SearchField } from '@/screens/search/search-field';
import { filmResultSubtitle, searchSubtitle } from '@/screens/search/subtitle';
import type { LiveMedium } from '@/state/medium';
import { Button, ErrorLine, Icon, ListRow, Text, artHeight, useTheme } from '@/ui';

import { BottomActions, TitleBlock } from './pieces';
import { fromSearchRow } from './rows';
import { addSeed, canAddSeed, emptySlot, mediumParam, removeSeed, SEEDS_WORDS, seedsButton } from './seeds';
import { deckHref, SESSION_HREF } from './session/routes';
import { startSession } from './session/session-store';

/** The same limit Search asks for, so the two share the `['search', query, medium]` cache. */
const RESULT_LIMIT = 20;

/** `initialQuery` and `initialSeeds` are for `/preview-onboarding` only: the frame's state on fixtures. */
export function SeedsScreen({
  initialQuery = '',
  initialSeeds = [],
}: { initialQuery?: string; initialSeeds?: OnboardingGameRow[] } = {}) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ medium?: string }>();
  const medium = mediumParam(params.medium);
  const film = medium === 'movie';
  const words = SEEDS_WORDS[medium];

  const [query, setQuery] = useState(initialQuery);
  const trimmed = query.trim();
  const debounced = useDebouncedQuery(trimmed);
  const [seeds, setSeeds] = useState<OnboardingGameRow[]>(initialSeeds);

  const results = useQuery({
    queryKey: queryKeys.search(debounced, medium),
    queryFn: () => searchGames(supabase, debounced, { limit: RESULT_LIMIT, medium }),
    enabled: debounced !== '',
  });

  const rank = useMutation({
    mutationFn: async (rows: OnboardingGameRow[]) => {
      // A film is seen before Verso (an undated diary row); a game is played.
      const write = film ? logSeen : startRanking;
      const outcomes = await Promise.all(rows.map((row) => write(supabase, row.mediaItemId)));
      // A title already ranked has its place; the session only places new ones.
      return rows.filter((_, index) => !outcomes[index]?.alreadyRanked);
    },
    onSuccess: (toRank, rows) => {
      for (const row of rows) invalidateEntry(queryClient, row.mediaItemId);
      if (toRank.length === 0) {
        router.push(deckHref(medium));
        return;
      }
      startSession({
        source: 'seeds',
        medium,
        items: toRank.map((row) => ({ mediaItemId: row.mediaItemId, tier: 'loved', row })),
        onDone: 'deck',
      });
      router.push(SESSION_HREF);
    },
  });

  const add = (row: OnboardingGameRow) => {
    setSeeds((current) => addSeed(current, row));
    setQuery('');
  };

  const searching = trimmed !== '';
  const settling = debounced !== trimmed;
  const hits = results.data ?? [];
  const button = seedsButton(seeds);

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'], paddingTop: insets.top + theme.space[2] }]}>
      <View style={{ paddingHorizontal: theme.space[4], paddingBottom: 18 }}>
        <TitleBlock title={t(words.title)} subtitle={t('onboarding.seeds.subtitle')} />
      </View>

      <SearchField value={query} onChangeValue={setQuery} placeholder={t(words.searchPlaceholder)} />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[4], gap: theme.space[5] }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {searching ? (
          settling || results.isPending ? (
            <GameRowSkeletons count={4} />
          ) : results.isError ? (
            <ErrorLine message={t('onboarding.seeds.couldNotSearch')} onRetry={() => void results.refetch()} />
          ) : hits.length === 0 ? (
            <Text size={15} color="text/secondary">
              {t(words.noMatch, { query: trimmed })}
            </Text>
          ) : (
            <View>
              {hits.map((hit) => {
                const row = fromSearchRow(hit);
                const addable = canAddSeed(seeds, row.mediaItemId);
                return (
                  <ListRow
                    key={row.mediaItemId}
                    coverWidth={44}
                    coverAspect={film ? 'poster' : 'cover'}
                    titleWeight={film ? 600 : 500}
                    candidates={coverCandidates(row)}
                    title={row.title}
                    subtitle={film ? filmResultSubtitle(hit) : searchSubtitle(hit)}
                    onPress={addable ? () => add(row) : undefined}
                    trailing={<AddPill added={!addable} />}
                  />
                );
              })}
            </View>
          )
        ) : null}

        <View style={{ gap: theme.space[1] }}>
          <Text size={12} weight={600} color="text/secondary">
            {t(words.yourPicks)}
          </Text>
          {seeds.map((seed) => (
            <SeedRow
              key={seed.mediaItemId}
              seed={seed}
              medium={medium}
              onRemove={() => setSeeds((current) => removeSeed(current, seed.mediaItemId))}
            />
          ))}
          {/* One slot, always: the list grows past three (Rafa's letters, 2026-10-14). */}
          <EmptySlot label={t(emptySlot(seeds, medium))} medium={medium} />
        </View>
      </ScrollView>

      <BottomActions>
        {rank.isError ? (
          <ErrorLine message={t('onboarding.seeds.couldNotSave')} />
        ) : null}
        {/* Gray until three are in, the brand green from the third (seeds.ts). */}
        <Button
          label={t(button.label)}
          variant={button.variant}
          disabled={button.disabled || rank.isPending}
          onPress={() => rank.mutate(seeds)}
        />
        <Text size={13} color="text/secondary" align="center">
          {t(words.footnote)}
        </Text>
      </BottomActions>
    </View>
  );
}

/** Search's plus pill, drawn as a mark: the whole row is the button. A check once the title is in the list. */
function AddPill({ added }: { added: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space[2],
          paddingVertical: theme.space[1],
        },
      ]}>
      <Icon name={added ? 'check' : 'plus'} size={18} color={added ? 'brand/text' : 'text/primary'} />
    </View>
  );
}

function SeedRow({ seed, medium, onRemove }: { seed: OnboardingGameRow; medium: LiveMedium; onRemove: () => void }) {
  const t = useT();
  const theme = useTheme();
  const film = medium === 'movie';

  return (
    <ListRow
      coverWidth={44}
      coverAspect={film ? 'poster' : 'cover'}
      titleWeight={film ? 600 : 500}
      candidates={coverCandidates(seed)}
      title={seed.title}
      subtitle={film ? filmMeta(seed.year, seed.genres) : seed.year === null ? null : String(seed.year)}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.seeds.remove', { title: seed.title })}
          onPress={onRemove}
          hitSlop={10}
          style={({ pressed }) => [
            styles.check,
            { backgroundColor: theme.colors['brand/primary'] },
            pressed && styles.pressed,
          ]}>
          <Icon name="check" size={14} color="brand/on-primary" strokeWidth={2.5} />
        </Pressable>
      }
    />
  );
}

function EmptySlot({ label, medium }: { label: string; medium: LiveMedium }) {
  const theme = useTheme();

  return (
    <View style={[styles.slot, { paddingVertical: 10, gap: theme.space[3] }]}>
      <View
        style={{
          width: 44,
          height: artHeight(44, medium === 'movie' ? 'poster' : 'cover'),
          borderRadius: 6,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: theme.colors['border/separator'],
        }}
      />
      <Text size={16} color="text/secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pill: { alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  slot: { flexDirection: 'row', alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
