/**
 * The games an import found that the user has no entry for: an offer, one row
 * at a time.
 *
 * `steamCandidates` is a read, never a write (steam.ts, point 3): the import
 * adds nothing to the user's lists, so this screen shows what Steam has and the
 * user takes what they want through the ordinary path -- the plus opens the
 * existing add sheet (`/add/[id]`), the row opens the game page. Each row is
 * Search's `GameRow`, because it already is this row: the cover, the title,
 * one line under it ("14 h on Steam · 2017"), and a plus whose tap target is
 * separate from the row's.
 *
 * The list stays put while the user works through it. A game added from here
 * turns its plus into a check through the same `['tracked', ids]` read Search
 * uses, which `invalidateEntry` already clears after the sheet writes; the row
 * does not vanish under the user's thumb, and the next visit's fresh read
 * leaves it out.
 *
 * Order is the API's, least played first: the interesting end of a large
 * library is the pile of things bought and never started. The header says so,
 * and says where the list comes from (guidelines, principle 13). Up to 200 rows,
 * the function's ceiling, in a `FlatList` -- the app's other lists are short
 * enough for a `ScrollView`, a Steam library is not.
 *
 * "Done" at the end goes back. `hidden=1` (set when the import reported every
 * game at zero minutes) adds one line about Steam's playtime privacy box above
 * the list, because "No hours on Steam" on every row is otherwise a puzzle.
 */

import { coverCandidates, steamCandidates, type SteamCandidate } from '@verso/api';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { GameRow } from '@/screens/search/game-row';
import { GameRowSkeletons } from '@/screens/search/placeholders';
import { useTrackedIds } from '@/screens/search/use-tracked';
import { Button, EmptyState, ErrorLine, Text, useTheme } from '@/ui';

import { SteamAttribution } from './attribution';
import { candidateCover, candidateSubtitle, STEAM_PRIVACY_SETTINGS_URL } from './import-outcome';
import { LinkText } from './link-text';

/** `steam_backlog_candidates` caps at 200; ask for all of them. */
const LIMIT = 200;

export interface SteamCandidatesScreenProps {
  /**
   * "Done". Defaults to back, or to `/settings/steam` with nothing to go back
   * to; the onboarding (onboarding.md, Link Steam) goes on to the tabs instead.
   */
  onDone?: () => void;
}

export function SteamCandidatesScreen({ onDone }: SteamCandidatesScreenProps = {}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ hidden?: string }>();
  const playtimeHidden = params.hidden === '1';

  const query = useQuery({
    queryKey: queryKeys.steamCandidates(),
    queryFn: () => steamCandidates(supabase, LIMIT),
  });
  const candidates = query.data ?? [];
  const tracked = useTrackedIds(candidates.map((candidate) => candidate.mediaItemId));

  const done = onDone ?? (() => (router.canGoBack() ? router.back() : router.replace('/settings/steam')));
  const openGame = (id: string) => router.push({ pathname: '/game/[id]', params: { id, from: 'Steam' } });
  const openAdd = (id: string) => router.push({ pathname: '/add/[id]', params: { id } });

  const padding = { paddingHorizontal: theme.space[4] };

  if (query.isPending) {
    return (
      <View accessibilityLabel="Loading" style={[padding, { paddingTop: theme.space[3] }]}>
        <GameRowSkeletons count={8} />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={[padding, { paddingTop: theme.space[4] }]}>
        <ErrorLine message="Couldn't load your Steam games." onRetry={() => void query.refetch()} />
      </View>
    );
  }

  if (candidates.length === 0) {
    return (
      <View style={[padding, { flex: 1, justifyContent: 'center', paddingBottom: 120 }]}>
        <EmptyState
          icon="check"
          title="Nothing to add"
          body="Every game from your Steam library that we could match is already in your lists."
          action={{ label: 'Done', onPress: done }}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={candidates}
      keyExtractor={(candidate) => candidate.mediaItemId}
      contentContainerStyle={[padding, { paddingTop: theme.space[3], paddingBottom: insets.bottom + theme.space[4] }]}
      ListHeaderComponent={
        <Header count={candidates.length} capped={candidates.length >= LIMIT} playtimeHidden={playtimeHidden} />
      }
      renderItem={({ item }) => (
        <CandidateRow
          candidate={item}
          tracked={tracked.has(item.mediaItemId)}
          onOpen={() => openGame(item.mediaItemId)}
          onAdd={() => openAdd(item.mediaItemId)}
        />
      )}
      ListFooterComponent={
        <View style={{ paddingTop: theme.space[5], gap: theme.space[6] }}>
          <Button label="Done" variant="contrast" onPress={done} />
          <SteamAttribution />
        </View>
      }
    />
  );
}

function Header({ count, capped, playtimeHidden }: { count: number; capped: boolean; playtimeHidden: boolean }) {
  const theme = useTheme();
  const games = count === 1 ? '1 game' : `${count} games`;

  return (
    <View style={{ gap: theme.space[3], paddingBottom: theme.space[2] }}>
      <Text size={15} color="text/secondary">
        {capped ? `The first ${games}` : games} in your Steam library that aren't in your lists yet,
        least played first. Tap + to add one.
      </Text>
      {playtimeHidden ? (
        <View style={{ gap: theme.space[1] }}>
          <Text size={15} color="text/secondary">
            Steam reported no hours for any game. If “Always keep my total playtime private” is ticked
            on Steam, untick it and import again.
          </Text>
          <LinkText
            label="Open Privacy Settings on Steam"
            url={STEAM_PRIVACY_SETTINGS_URL}
            accessibilityLabel="Open Privacy Settings on Steam. Opens Steam."
            weight={600}
          />
        </View>
      ) : null}
    </View>
  );
}

function CandidateRow({
  candidate,
  tracked,
  onOpen,
  onAdd,
}: {
  candidate: SteamCandidate;
  tracked: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <GameRow
      title={candidate.title}
      subtitle={candidateSubtitle(candidate)}
      candidates={coverCandidates(candidateCover(candidate))}
      tracked={tracked}
      onPress={onOpen}
      onControl={onAdd}
    />
  );
}
