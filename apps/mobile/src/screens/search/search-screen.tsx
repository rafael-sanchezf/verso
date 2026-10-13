/**
 * Search: the one screen for finding a specific game.
 *
 * Three states in one column, and which one is showing is decided by the field
 * alone. Empty field: what you searched for lately, and what everyone else is
 * playing. Something typed: the catalog, 250 ms behind you. Nothing found: one
 * empty state that names what you typed.
 *
 * "Popular", never "Popular this week" — the frame's label claims a weekly
 * signal that `popular_games` does not carry (it orders by IGDB's lifetime
 * count of ratings), and rule 9 does not allow a label to invent one.
 * specs/search.md, and the note is in the PR.
 *
 * Suggestions ("give me something from my likes") deliberately live elsewhere:
 * this screen is for a title you already have in mind.
 *
 * `?intent=playing` (Home's "Search a new game") is the same screen with one
 * job: a hint under the title, the keyboard up, and a `play` pill on every row
 * that marks the game Playing and goes back to Home. `intent.ts` has the
 * rules; the intent lasts until another tab is selected.
 *
 * `?intent=addmany` (Ranking's "I know what I played", specs/onboarding.md,
 * "The doors") titles the screen "Add many" with a "{n} added" chip, and every
 * row's control is a check circle: a tap marks the game played at once
 * (`markFinished`) and adds it to the ADDED list under the results; "Rank {n}
 * games", pinned at the bottom, opens the session over them with no tiers
 * yet. `add-many.ts` has the rules; the list ends with the visit.
 */

import {
  coverCandidates,
  markFinished,
  popularGames,
  searchGames,
  type OnboardingGameRow,
  type PopularGameRow,
  type SearchGameRow,
} from '@verso/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRoute, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alert } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { invalidateEntry } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { releaseDateOf, whenReleased } from '@/lib/when-released';
import { SESSION_HREF } from '@/screens/onboarding/session/routes';
import { fromPopularRow, fromSearchRow } from '@/screens/onboarding/rows';
import { startSession } from '@/screens/onboarding/session/session-store';
import { say as sayWords } from '@/screens/game/phrase';
import { Button, EmptyState, ErrorLine, Icon, ListRow, MediumChip, ScreenHeader, Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import {
  EMPTY_ADD_MANY,
  addedChipLabel,
  afterMarked,
  addManyPill,
  alreadyRankedLine,
  isAdded,
  rankAddedLabel,
  type AddManyState,
} from './add-many';
import { useDebouncedQuery } from './debounce';
import { GameRow, type GameRowControl } from './game-row';
import { isSelectedTab, parseSearchIntent, playingIntentControl, type SearchIntent } from './intent';
import { GameRowSkeletons } from './placeholders';
import { RECENT_SHOWN } from './recent';
import { SearchField } from './search-field';
import { filmPopularSubtitle, filmResultSubtitle, popularSubtitle, searchSubtitle } from './subtitle';
import { useRecentSearches } from './use-recent-searches';
import { useStartPlaying } from './use-start-playing';
import { useReleaseDates } from './use-release-dates';
import { useTrackedIds } from './use-tracked';
import { useActiveMedium } from '@/state/medium';

/** How many hits the field asks for. The database clamps it to 100. */
const RESULT_LIMIT = 20;

/** How many Popular rows, and therefore how many skeletons stand in for them. */
const POPULAR_COUNT = 5;

export function SearchScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const debounced = useDebouncedQuery(trimmed);
  const searching = trimmed !== '';

  const { queries: recent, remember } = useRecentSearches();

  // The active medium (state/medium.ts; movies-build.md, PR 2, item 6): films
  // search the movie catalog, read "year · genre" and open the movie page.
  // The two intents are games' (Home's Playing card, Ranking's add-many).
  const { medium } = useActiveMedium();
  const film = medium === 'movie';

  const params = useLocalSearchParams<{ intent?: string }>();
  const navigation = useNavigation();
  const route = useRoute();
  const input = useRef<TextInput>(null);
  const [intent, setIntent] = useState<SearchIntent | null>(() => parseSearchIntent(params.intent));
  // The add-many intent's batch: what this visit has marked played so far.
  const [addMany, setAddMany] = useState<AddManyState>(EMPTY_ADD_MANY);
  const [adding, setAdding] = useState<ReadonlySet<string>>(() => new Set());
  const queryClient = useQueryClient();

  // An intent arrives as a param and is taken off the route at once, as the
  // Ranking tab does with `focus`: the tab stays mounted, and a param left on
  // it would put the next plain visit back in the intent. The visit starts
  // clean, with an empty field and the keyboard up, because typing the title
  // is the only thing left to do.
  useEffect(() => {
    const requested = parseSearchIntent(params.intent);
    if (requested === null) return;
    setIntent(requested);
    setAddMany(EMPTY_ADD_MANY);
    setQuery('');
    router.setParams({ intent: '' });
    input.current?.focus();
  }, [params.intent, router]);

  // The visit ends when another tab is selected, including Home after a pick.
  // The tab navigator's index rather than screen focus: a game page pushed
  // from a result also takes focus, and coming back from it is the same visit.
  useEffect(
    () =>
      navigation.addListener('state', (event) => {
        if (isSelectedTab(event.data.state, route.key)) return;
        setIntent(null);
        setAddMany(EMPTY_ADD_MANY);
      }),
    [navigation, route.key],
  );

  const startPlaying = useStartPlaying();

  const results = useQuery({
    queryKey: queryKeys.search(debounced, medium),
    queryFn: () => searchGames(supabase, debounced, { limit: RESULT_LIMIT, medium }),
    enabled: debounced !== '',
  });

  /**
   * Popular, for the session.
   *
   * Nothing about the most-rated games in the catalog changes while the app is
   * open, and the list is the first thing on an empty Search tab — refetching it
   * on every visit would be five rows of network for a list that cannot have
   * moved.
   *
   * The extra retries are the price of that: a query that never goes stale never
   * refetches, so a single failed attempt would leave the section showing its
   * skeleton for the rest of the session. Three attempts recover a blip; a
   * missing `popular_games` function fails all three and shows the skeleton,
   * which is what the spec asks for in that case anyway.
   */
  const popular = useQuery({
    queryKey: queryKeys.popular(POPULAR_COUNT, medium),
    queryFn: () => popularGames(supabase, POPULAR_COUNT, medium),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });

  /**
   * A query is remembered when it leads somewhere — a game opened, a game added
   * — and never on a keystroke (specs/search.md). `remember` ignores a blank
   * one, which is what keeps a tap on a Popular row out of the history.
   */
  const openGame = useCallback(
    (id: string) => {
      remember(trimmed);
      if (film) router.push({ pathname: '/movie/[id]', params: { id, from: 'Search' } });
      else router.push({ pathname: '/game/[id]', params: { id, from: 'Search' } });
    },
    [film, remember, router, trimmed],
  );

  const openAdd = useCallback(
    (id: string) => {
      remember(trimmed);
      router.push({ pathname: '/add/[id]', params: { id } });
    },
    [remember, router, trimmed],
  );

  // The Playing intent's pill: the write, then Home (use-start-playing.ts).
  // A pick is where a search led somewhere, so the query is remembered too.
  const markPlaying = useCallback(
    (id: string) => {
      remember(trimmed);
      startPlaying.mutate(id);
    },
    [remember, startPlaying.mutate, trimmed],
  );

  /**
   * The add-many intent's tap: mark the game played now and add it to the
   * batch. Several can be in flight at once, each row spinning on its own; a
   * failure is an alert and the row stays as it was, to tap again. A game that
   * turns out not to be out is not marked played: the add sheet opens instead
   * (`lib/when-released.ts`).
   */
  const addPlayed = useCallback(
    (row: OnboardingGameRow) => {
      remember(trimmed);
      setAdding((current) => new Set(current).add(row.mediaItemId));
      whenReleased(
        () => releaseDateOf(supabase, row.mediaItemId),
        () => markFinished(supabase, row.mediaItemId),
      )
        .then((outcome) => {
          if (!outcome.released) {
            openAdd(row.mediaItemId);
            return;
          }
          invalidateEntry(queryClient, row.mediaItemId);
          setAddMany((current) => afterMarked(current, row, outcome.value.alreadyRanked));
        })
        .catch(() => alert(t('browse.search.couldNotAdd'), t('browse.tryAgain')))
        .finally(() =>
          setAdding((current) => {
            const next = new Set(current);
            next.delete(row.mediaItemId);
            return next;
          }),
        );
    },
    [openAdd, queryClient, remember, t, trimmed],
  );

  const rankAdded = () => {
    startSession({
      source: 'add-many',
      items: addMany.added.map((row) => ({ mediaItemId: row.mediaItemId, tier: null, row })),
      onDone: 'back',
    });
    setAddMany(EMPTY_ADD_MANY);
    router.push(SESSION_HREF);
  };

  const control: GameRowControl = intent === 'playing' ? 'play' : intent === 'addmany' ? 'addmany' : 'add';
  const onControl = intent === 'playing' ? markPlaying : openAdd;
  // One write at a time: the row being written spins, the rest wait.
  const pendingId = startPlaying.isPending ? startPlaying.variables : null;
  const addManyControls: AddManyControls | null =
    intent === 'addmany' ? { state: addMany, adding, onAdd: addPlayed } : null;

  // The field is ahead of the query key while the debounce runs, and `isPending`
  // is a key with nothing behind it yet. A background refetch of a key that does
  // have rows is not loading: those rows stay on screen (`isFetching` here would
  // blink the whole list back to skeletons every thirty seconds).
  const settling = debounced !== trimmed;
  const loading = searching && (settling || results.isPending);
  const hits = results.data ?? [];

  /**
   * The ids on screen, for the tracked check.
   *
   * Both lists at once rather than only the visible one: the two states swap on
   * every keystroke and back again on a clear, and asking about five extra
   * Popular ids costs nothing next to re-asking each time the field empties.
   */
  const visibleIds = useMemo(
    // `search_games` names the catalog id `media_item_id` (it comes from a
    // join); `popular_games` calls it `id`. Same id, two spellings.
    () => [...hits.map((row) => row.media_item_id), ...(popular.data ?? []).map((row) => row.id)],
    [hits, popular.data],
  );
  const tracked = useTrackedIds(visibleIds);
  const releaseDates = useReleaseDates(visibleIds, intent !== null);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors['bg/canvas'], paddingTop: insets.top }]}>
      <ScreenHeader
        title={intent === 'addmany' ? t('browse.search.addManyTitle') : t('browse.search.title')}
        right={intent === 'addmany' ? <AddedChip count={addMany.added.length} /> : <MediumChip />}
      />

      {intent === 'playing' ? <IntentHint text={t('browse.search.playingHint')} /> : null}
      {intent === 'addmany' && addMany.alreadyRanked ? (
        <IntentHint text={sayWords(t, alreadyRankedLine(addMany.alreadyRanked))} />
      ) : null}

      <SearchField
        value={query}
        onChangeValue={setQuery}
        inputRef={input}
        placeholder={film ? t('browse.search.placeholderFilms') : t('browse.search.placeholderGames')}
      />

      {searching && !loading && !results.isError && hits.length === 0 ? (
        <NoResults query={trimmed} film={film} />
      ) : (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[
            styles.column,
            { paddingHorizontal: theme.space[4], gap: theme.space[5], paddingBottom: theme.space[6] },
          ]}
          // A tap on a row while the keyboard is up should open the game, not
          // just dismiss the keyboard and make the user tap again.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {searching ? (
            <Results
              film={film}
              loading={loading}
              error={results.isError}
              hits={hits}
              tracked={tracked}
              control={control}
              pendingId={pendingId}
              addMany={addManyControls}
              releaseDates={releaseDates}
              onRetry={() => void results.refetch()}
              onOpen={openGame}
              onAdd={openAdd}
              onControl={onControl}
            />
          ) : (
            <>
              {recent.length > 0 ? (
                <Section title={t('browse.search.recent')}>
                  {recent.slice(0, RECENT_SHOWN).map((entry) => (
                    <RecentRow key={entry} query={entry} onPress={() => setQuery(entry)} />
                  ))}
                </Section>
              ) : null}

              <Section title={t('browse.search.popular')}>
                <Popular
                  film={film}
                  rows={popular.data}
                  tracked={tracked}
                  control={control}
                  pendingId={pendingId}
                  addMany={addManyControls}
                  releaseDates={releaseDates}
                  onOpen={openGame}
                  onAdd={openAdd}
                  onControl={onControl}
                />
              </Section>
            </>
          )}

          {addManyControls && addMany.added.length > 0 ? <AddedList rows={addMany.added} /> : null}
        </ScrollView>
      )}

      {intent === 'addmany' && addMany.added.length > 0 ? (
        <View style={{ paddingHorizontal: theme.space[4], paddingVertical: theme.space[3] }}>
          <Button label={sayWords(t, rankAddedLabel(addMany.added.length))} onPress={rankAdded} />
        </View>
      ) : null}
    </View>
  );
}

/** What the add-many intent gives every list of game rows. */
interface AddManyControls {
  state: AddManyState;
  /** Rows whose `markFinished` is in flight. */
  adding: ReadonlySet<string>;
  onAdd: (row: OnboardingGameRow) => void;
}

/** The add-many header's counter: "{n} added" on the brand green. */
function AddedChip({ count }: { count: number }) {
  const t = useT();
  const theme = useTheme();
  const label = sayWords(t, addedChipLabel(count));

  return (
    <View
      accessibilityLabel={label}
      style={{
        backgroundColor: theme.colors['brand/primary'],
        borderRadius: theme.radius.pill,
        paddingHorizontal: theme.space[3],
        paddingVertical: 6,
      }}>
      <Text size={13} weight={600} color="brand/on-primary">
        {label}
      </Text>
    </View>
  );
}

/** ADDED, under the results: what "Rank {n} games" will take into the session. */
function AddedList({ rows }: { rows: readonly OnboardingGameRow[] }) {
  const t = useT();
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space[1] }}>
      <Text size={12} weight={600} color="text/secondary">
        {t('browse.search.added')}
      </Text>
      {rows.map((row) => (
        <ListRow
          key={row.mediaItemId}
          coverWidth={44}
          candidates={coverCandidates(row)}
          title={row.title}
          subtitle={row.year === null ? null : String(row.year)}
          trailing={
            <View style={[styles.addedCheck, { backgroundColor: theme.colors['brand/primary'] }]}>
              <Icon name="check" size={16} color="brand/on-primary" strokeWidth={2.5} />
            </View>
          }
        />
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space[1] }}>
      <Text size={13} weight={600} color="text/secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** One remembered query: the clock, the words, and a tap that runs it again. */
function RecentRow({ query, onPress }: { query: string; onPress: () => void }) {
  const t = useT();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('browse.search.searchFor', { query })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.recent,
        { paddingVertical: theme.space[3], gap: theme.space[3] },
        pressed && styles.pressed,
      ]}>
      <Icon name="clock" size={16} color="text/secondary" />
      <Text size={17} numberOfLines={1}>
        {query}
      </Text>
    </Pressable>
  );
}

/** What every list of game rows on this screen takes for its trailing pill. */
interface RowControls {
  tracked: Set<string>;
  control: GameRowControl;
  /** The game whose Playing write is in flight, if any. */
  pendingId: string | null;
  /** The add-many intent's batch, or null outside it. */
  addMany: AddManyControls | null;
  /** The intents' dates by id (`useReleaseDates`); empty in plain Search. */
  releaseDates: ReadonlyMap<string, string | null>;
  onOpen: (id: string) => void;
  /** The add sheet: what an unreleased game's pill opens in either intent. */
  onAdd: (id: string) => void;
  onControl: (id: string) => void;
}

/** The trailing control's state for one row, in whichever intent is on. */
function rowControl(
  { tracked, control, pendingId, addMany, releaseDates, onAdd, onControl }: Omit<RowControls, 'onOpen'>,
  row: OnboardingGameRow,
) {
  if (addMany) {
    // Nor does add-many mark a game played before it is out: the add pill,
    // and the add sheet's "Want to play", the same as the Playing intent.
    if (addManyPill(releaseDates.get(row.mediaItemId)) === 'add') {
      return {
        control: 'add' as const,
        tracked: tracked.has(row.mediaItemId),
        added: false,
        pending: false,
        disabled: false,
        onControl: () => onAdd(row.mediaItemId),
      };
    }
    return {
      control,
      tracked: tracked.has(row.mediaItemId),
      added: isAdded(addMany.state, row.mediaItemId),
      pending: addMany.adding.has(row.mediaItemId),
      disabled: false,
      onControl: () => addMany.onAdd(row),
    };
  }
  // The Playing intent never offers Playing for a game that is not out: that
  // row keeps the add pill, and the add sheet offers "Want to play" alone.
  const unreleased =
    control === 'play' && playingIntentControl(releaseDates.get(row.mediaItemId)) === 'add';
  return {
    control: unreleased ? ('add' as const) : control,
    tracked: tracked.has(row.mediaItemId),
    added: false,
    pending: pendingId === row.mediaItemId,
    disabled: pendingId !== null,
    onControl: () => (unreleased ? onAdd(row.mediaItemId) : onControl(row.mediaItemId)),
  };
}

/**
 * Popular, or the skeleton that stands in for it.
 *
 * The failure case is the reason this is not one line: until the
 * `popular_games` migration reaches the hosted project the call returns a
 * PostgREST error, and specs/search.md is explicit that the section shows its
 * skeleton and never an error. A section nobody asked for is not worth a
 * failure message on the screen someone came here to search with.
 */
function Popular({
  rows,
  film,
  onOpen,
  ...controls
}: RowControls & { rows: PopularGameRow[] | undefined; film: boolean }) {
  if (!rows) return <GameRowSkeletons count={POPULAR_COUNT} />;

  return (
    <View>
      {rows.map((row) => (
        <GameRow
          key={row.id}
          title={row.title}
          subtitle={film ? filmPopularSubtitle(row) : popularSubtitle(row)}
          candidates={coverCandidates(row)}
          film={film}
          {...rowControl(controls, fromPopularRow(row))}
          onPress={() => onOpen(row.id)}
        />
      ))}
    </View>
  );
}

function Results({
  film,
  loading,
  error,
  hits,
  onRetry,
  onOpen,
  ...controls
}: RowControls & {
  film: boolean;
  loading: boolean;
  error: boolean;
  hits: SearchGameRow[];
  onRetry: () => void;
}) {
  const t = useT();
  if (loading) return <GameRowSkeletons count={6} />;
  if (error) return <ErrorLine message={t('browse.search.loadError')} onRetry={onRetry} />;

  return (
    <View>
      {hits.map((row) => (
        <GameRow
          key={row.media_item_id}
          title={row.title}
          subtitle={film ? filmResultSubtitle(row) : searchSubtitle(row)}
          candidates={coverCandidates(row)}
          film={film}
          {...rowControl(controls, fromSearchRow(row))}
          onPress={() => onOpen(row.media_item_id)}
        />
      ))}
    </View>
  );
}

/**
 * The Playing intent's one line under the title (specs/search.md): what this
 * visit is for, so the `play` pills explain themselves. The add-many intent
 * uses the same line to say a tapped game was ranked already.
 */
function IntentHint({ text }: { text: string }) {
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[3] }}>
      <Text size={15} color="text/secondary" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Nothing matched.
 *
 * Bare and centred with 120pt below it, which is the placement specs/shell.md
 * gives an `EmptyState` that stands in for a whole list rather than for one
 * block. No action: the only useful next move is in the field the user is
 * already looking at.
 */
function NoResults({ query, film }: { query: string; film: boolean }) {
  const t = useT();
  return (
    <View style={[styles.fill, styles.centre, { paddingBottom: 120 }]}>
      <EmptyState
        icon="search"
        title={t(film ? 'browse.search.noFilms' : 'browse.search.noGames', { query })}
        body={t('browse.search.noResultsBody')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  column: { flexGrow: 1 },
  centre: { justifyContent: 'center' },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addedCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
