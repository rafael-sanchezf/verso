/**
 * "Add to…": the three things you can say about a game you just found.
 *
 * A route rather than a component, so it gets the native iOS form sheet the
 * shell registers (`add/[id]`, detents 0.45 and 0.9) with its drag, its grabber
 * and its dismiss for free — rule 7. Everything inside it is one read of
 * `gamePage(client, id)` under `['game', id]`: the same cache the game page
 * itself uses, so opening the sheet and then the page is one round trip rather
 * than two.
 *
 * The three options are the three states a game can be in before it is ranked
 * (rule 3, three per decision), and they are the whole sheet: the platform row
 * that sat under them left with decision 26 (2026-10-06). Where a game was
 * played is recorded on the game page.
 *
 * A game that is not out yet gets one option instead, "Want to play": none of
 * the rest can be true of it (phone feedback entry 7). Which rows, and their
 * words, are `addSheetRows` in `add-options.ts`.
 */

import {
  coverCandidates,
  gamePage,
  markFinished,
  moveToBacklog,
  releaseState,
  setStatus,
  type GamePage,
} from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { invalidateEntry, invalidateMovieHome } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Cover, ErrorLine, Icon, Text } from '@/ui';
import { useTheme, type ColorToken } from '@/ui/theme';

import { addSheetRows, FILM_ROWS, type Choice } from './add-options';
import { GameRowSkeleton } from './placeholders';

export function AddSheet({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const page = useQuery({
    queryKey: queryKeys.game(id),
    queryFn: () => gamePage(supabase, id),
  });

  const choose = useMutation({
    mutationFn: async (choice: Choice) => {
      // "I watched this" writes nothing here: the log sheet does, with its date.
      if (choice === 'watched') return null;
      if (choice === 'backlog') return moveToBacklog(supabase, id);
      if (choice === 'playing') return setStatus(supabase, id, 'playing');
      return markFinished(supabase, id);
    },
    onSuccess: (_result, choice) => {
      invalidateEntry(queryClient, id);
      // A film onto the watchlist is a row on movies Home.
      if (choice === 'backlog') invalidateMovieHome(queryClient);
      router.back();
      // A film's "I watched this" is its log sheet (movies-build.md, PR 2, item 5).
      if (choice === 'watched') {
        router.push({ pathname: '/log/[id]', params: { id } });
        return;
      }
      // "I finished this" is the start of the ranking flow, not the end of the
      // sheet: the game page opens with `log=1` and pushes the tier sheet as
      // soon as it has loaded (specs/game-page.md). `from` is the back title.
      if (choice === 'finished') {
        router.push({ pathname: '/game/[id]', params: { id, from: 'Search', log: '1' } });
      }
    },
    onError: (error) => complain(error),
  });

  const body = (() => {
    if (page.isPending) return <Loading />;
    if (page.isError || !page.data) {
      return (
        <ErrorLine message="Couldn't load that game." onRetry={() => void page.refetch()} />
      );
    }
    return (
      <Loaded
        page={page.data}
        busy={choose.isPending}
        onChoose={(choice) => choose.mutate(choice)}
      />
    );
  })();

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors['bg/canvas'] }}
      contentContainerStyle={{
        paddingTop: theme.space[3],
        paddingHorizontal: theme.space[4],
        // The sheet can be dragged over the home indicator; the last row should
        // not end up under it.
        paddingBottom: insets.bottom + theme.space[3],
        gap: theme.space[2],
      }}>
      {body}
    </ScrollView>
  );
}

/** A failed write says so and changes nothing. Native alert, per rule 7. */
function complain(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Please try again.';
  Alert.alert("That didn't save", message);
}

function Loading() {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space[2] }}>
      <GameRowSkeleton />
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{
            height: 66,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors['bg/surface'],
          }}
        />
      ))}
    </View>
  );
}

function Loaded({
  page,
  busy,
  onChoose,
}: {
  page: GamePage;
  busy: boolean;
  onChoose: (choice: Choice) => void;
}) {
  const theme = useTheme();
  // A tracked game gets the same rows as an untracked one, as it always has;
  // an unreleased one, tracked or not, gets the single row.
  const film = page.medium === 'movie';
  const rows = film ? FILM_ROWS : addSheetRows(releaseState(page.releaseDate));

  return (
    <>
      <View style={[styles.game, { paddingBottom: 6, gap: theme.space[3] }]}>
        <Cover
          width={40}
          radius={6}
          aspect={film ? 'poster' : 'cover'}
          candidates={coverCandidates(page)}
          accessibilityLabel={page.title}
        />
        <View style={styles.fill}>
          <Text size={17} weight={600} numberOfLines={2}>
            {page.title}
          </Text>
          <Text size={14} color="text/secondary">
            Add to…
          </Text>
        </View>
      </View>

      {rows.options.map((option) => (
        <Option
          key={option.choice}
          title={option.title}
          description={option.description}
          filled={option.filled}
          disabled={busy}
          onPress={() => onChoose(option.choice)}
        />
      ))}
    </>
  );
}

function Option({
  title,
  description,
  filled,
  disabled,
  onPress,
}: {
  title: string;
  description: string;
  filled: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  const fill: ColorToken = filled ? 'brand/primary' : 'bg/surface';
  const label: ColorToken = filled ? 'brand/on-primary' : 'text/primary';
  // The spec puts a `text/secondary` chevron on all three rows; on the filled
  // one that is a grey glyph on green, so it takes the row's own label color.
  // Listed in the PR.
  const secondary: ColorToken = filled ? 'brand/on-primary' : 'text/secondary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: theme.colors[fill],
          borderRadius: theme.radius.md,
          paddingHorizontal: 14,
          paddingVertical: 13,
          gap: theme.space[3],
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <View style={styles.fill}>
        <Text size={16} weight={600} color={label}>
          {title}
        </Text>
        <Text size={12} color={secondary}>
          {description}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  game: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fill: { flex: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
