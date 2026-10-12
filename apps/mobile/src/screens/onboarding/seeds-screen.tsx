/**
 * "Three games you love" (specs/onboarding.md, frame 96:46): the first ranked
 * games, found by title the way Search finds them, and the genres the deck's
 * order starts from (guidelines: Netflix's three titles, Spotify's three
 * artists, Letterboxd's four favourites).
 *
 * Search's field and its 250 ms debounce, Search's result row with a plus
 * pill; a tap on a result adds it to YOUR THREE and clears the field. "Rank
 * these" is live from two: it marks each seed played (`markFinished`) and opens
 * the session with the seeds in Loved and no predictions, which costs at most
 * three questions; the session goes straight on to the deck, with no review,
 * because three rows need none (`onDone: 'deck'`).
 *
 * Rules (the three, the slots) are in seeds.ts. Not drawn, coded from the row
 * conventions (rule 7, in the PR): an empty first and second slot read "Add a
 * first" and "Add a second" as the frame's third reads "Add a third"; a tap on
 * a seed's check takes it back out.
 */

import { coverCandidates, markFinished, searchGames, type OnboardingGameRow } from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { useDebouncedQuery } from '@/screens/search/debounce';
import { GameRowSkeletons } from '@/screens/search/placeholders';
import { SearchField } from '@/screens/search/search-field';
import { searchSubtitle } from '@/screens/search/subtitle';
import { Button, ErrorLine, Icon, ListRow, Text, coverHeight, useTheme } from '@/ui';

import { BottomActions, TitleBlock } from './pieces';
import { SESSION_HREF } from './session/routes';
import { fromSearchRow } from './rows';
import { addSeed, canAddSeed, canRankSeeds, emptySlots, removeSeed } from './seeds';
import { startSession } from './session/session-store';

/** The same limit Search asks for, so the two share the `['search', query]` cache. */
const RESULT_LIMIT = 20;

export function SeedsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const debounced = useDebouncedQuery(trimmed);
  const [seeds, setSeeds] = useState<OnboardingGameRow[]>([]);

  const results = useQuery({
    queryKey: queryKeys.search(debounced),
    queryFn: () => searchGames(supabase, debounced, { limit: RESULT_LIMIT }),
    enabled: debounced !== '',
  });

  const rank = useMutation({
    mutationFn: async (rows: OnboardingGameRow[]) => {
      const outcomes = await Promise.all(rows.map((row) => markFinished(supabase, row.mediaItemId)));
      // A game already ranked has its place; the session only places new ones.
      return rows.filter((_, index) => !outcomes[index]?.alreadyRanked);
    },
    onSuccess: (toRank, rows) => {
      for (const row of rows) invalidateEntry(queryClient, row.mediaItemId);
      if (toRank.length === 0) {
        router.push('/onboarding/deck');
        return;
      }
      startSession({
        source: 'seeds',
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

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'], paddingTop: insets.top + theme.space[2] }]}>
      <View style={{ paddingHorizontal: theme.space[4], paddingBottom: 18 }}>
        <TitleBlock
          title="Three games you love"
          subtitle="They go straight into your ranking and tune what we ask about next."
        />
      </View>

      <SearchField value={query} onChangeValue={setQuery} />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[4], gap: theme.space[5] }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {searching ? (
          settling || results.isPending ? (
            <GameRowSkeletons count={4} />
          ) : results.isError ? (
            <ErrorLine message="Couldn't search just now." onRetry={() => void results.refetch()} />
          ) : hits.length === 0 ? (
            <Text size={15} color="text/secondary">
              No games match “{trimmed}”.
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
                    candidates={coverCandidates(row)}
                    title={row.title}
                    subtitle={searchSubtitle(hit)}
                    onPress={addable ? () => add(row) : undefined}
                    trailing={
                      <AddPill
                        added={seeds.some((seed) => seed.mediaItemId === row.mediaItemId)}
                        disabled={!addable}
                      />
                    }
                  />
                );
              })}
            </View>
          )
        ) : null}

        <View style={{ gap: theme.space[1] }}>
          <Text size={12} weight={600} color="text/secondary">
            YOUR THREE
          </Text>
          {seeds.map((seed) => (
            <SeedRow
              key={seed.mediaItemId}
              seed={seed}
              onRemove={() => setSeeds((current) => removeSeed(current, seed.mediaItemId))}
            />
          ))}
          {emptySlots(seeds).map((label) => (
            <EmptySlot key={label} label={label} />
          ))}
        </View>
      </ScrollView>

      <BottomActions>
        {rank.isError ? (
          <ErrorLine message="Couldn't save these. Check your connection and try again." />
        ) : null}
        <Button label="Rank these" disabled={!canRankSeeds(seeds) || rank.isPending} onPress={() => rank.mutate(seeds)} />
        <Text size={13} color="text/secondary" align="center">
          Their genres tune the deck; you can always add more later.
        </Text>
      </BottomActions>
    </View>
  );
}

/** Search's plus pill, drawn as a mark: the whole row is the button. */
function AddPill({ added, disabled }: { added: boolean; disabled: boolean }) {
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
          opacity: disabled && !added ? 0.4 : 1,
        },
      ]}>
      <Icon name={added ? 'check' : 'plus'} size={18} color={added ? 'brand/text' : 'text/primary'} />
    </View>
  );
}

function SeedRow({ seed, onRemove }: { seed: OnboardingGameRow; onRemove: () => void }) {
  const theme = useTheme();

  return (
    <ListRow
      coverWidth={44}
      candidates={coverCandidates(seed)}
      title={seed.title}
      subtitle={seed.year === null ? null : String(seed.year)}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${seed.title}`}
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

function EmptySlot({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.slot, { paddingVertical: 10, gap: theme.space[3] }]}>
      <View
        style={{
          width: 44,
          height: coverHeight(44),
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
