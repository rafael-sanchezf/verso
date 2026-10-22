/**
 * The game page: everything the app knows about one game, and every way to act
 * on it.
 *
 * Pushed at the root rather than inside the tabs, so the tab bar is gone and
 * the back button says where you came from (the `from` param). It is reachable
 * from every list in the app and from `verso://game/<id>`, which is why nothing
 * here assumes an entry, a `game_details` row, a score, or a cover: each block
 * decides for itself whether it has anything to say.
 *
 * The one write that leaves the page is "Rank this" — `startRanking` and then
 * the log flow, which is the core loop (rule 10). Everything else is a single
 * call from `entries.ts` followed by `invalidateEntry`.
 */

import {
  moveToBacklog,
  removeEntry,
  releaseState,
  removeRankingEntry,
  setStatus,
  startRanking,
} from '@verso/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t as translateNow, useT } from '@/lib/i18n';
import { invalidateEntry, invalidateRanking } from '@/lib/invalidate';
import { supabase } from '@/lib/supabase';
import { ErrorLine, Icon, useTheme } from '@/ui';
import { ColumnButton, useSideColumn } from '@/ui/side-column';
import { GamePageSkeleton } from './states';

import { detailRows, timeToBeatBreakdown } from './details-rows';
import { ActionsRow, StatusRow } from './game-actions';
import { AboutSection, DetailsSection } from './game-details';
import { GameHeader, ScoreLine } from './game-header';
import { PlatformsSection } from './game-platforms';
import { backTitle } from './back-title';
import { confirmDestructive, showActionSheet, showInfo, type SheetChoice } from './native-menus';
import { say } from './phrase';
import { scoreLineItems } from './score-line';
import { primaryAction, secondaryAction, statusChoices, statusLine } from './status';
import { useEntryWrite, useGamePage, usePlayedPlatforms, usePlayerCount } from './use-game';

/** A router param is a string or a list of them; the first one is the value. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Everything that fails the same way says so the same way. */
function writeFailed() {
  Alert.alert(translateNow('browse.game.couldNotSave'), translateNow('browse.tryAgain'));
}

export function GamePageScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string; log?: string }>();
  const id = firstParam(params.id) ?? '';
  const t = useT();
  const from = backTitle(firstParam(params.from), t);
  const opensLog = firstParam(params.log) === '1';

  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useGamePage(id);
  const page = query.data ?? null;
  const playerCount = usePlayerCount(id, page).data ?? null;
  // Out or not decides which actions exist (status.ts): a game that is not out
  // is only ever backlogged or removed, on the buttons and in Change alike.
  const release = releaseState(page?.releaseDate);

  /** Every simple write: hand it the call, it invalidates and reports failure. */
  const write = useEntryWrite<() => Promise<unknown>>(id, (run) => run());
  const run = (task: () => Promise<unknown>) => write.mutate(task, { onError: writeFailed });

  const playedOn = usePlayedPlatforms(id);

  const openLog = () => router.push({ pathname: '/log/[id]', params: { id } });
  const openHours = () => router.push({ pathname: '/game/[id]/hours', params: { id } });
  const openDetailsSheet = () => router.push({ pathname: '/game/[id]/details', params: { id } });
  const openPlatforms = () => router.push({ pathname: '/game/[id]/platforms', params: { id } });

  /**
   * A game already in the ranked list cannot be placed a second time, so the
   * way into the log flow for one is "Re-rank", which takes the old place out
   * first.
   */
  const offerReRank = () =>
    Alert.alert(t('browse.game.alreadyRankedTitle'), t('browse.game.alreadyRankedMessage'), [
      { text: t('browse.game.keep'), style: 'cancel' },
      {
        text: t('browse.game.reRank'),
        onPress: () => {
          void removeRankingEntry(supabase, id)
            .then(() => {
              invalidateRanking(queryClient, id);
              openLog();
            })
            .catch(writeFailed);
        },
      },
    ]);

  /**
   * "Rank this" (VER-224). Never a finish: `startRanking` makes an untracked
   * or backlogged game played with no finished date and leaves Playing,
   * Dropped and Played alone, so a game ranked from Playing stays on Home and
   * Profile reads "Ranked X", not "Finished X". What happens next depends on
   * whether it is already in the ranked list, the one thing the entry cannot
   * say.
   */
  const rankThis = useMutation({
    mutationFn: () => startRanking(supabase, id),
    onSuccess: (result) => {
      if (result.alreadyRanked) offerReRank();
      else openLog();
    },
    onError: writeFailed,
    onSettled: () => invalidateEntry(queryClient, id),
  });

  /**
   * Home's "Rank this" and Search's add-to sheet push here with `log=1`, so the
   * page loads and then hands straight over to the log flow, or to "Re-rank"
   * for a game already ranked (a Playing game stays on Home after it is
   * ranked, so its long press can reach one). Once, however many times this
   * component renders.
   */
  const handedOver = useRef(false);
  useEffect(() => {
    if (!opensLog || handedOver.current || !page) return;
    handedOver.current = true;
    if (page.ranking !== null) offerReRank();
    else openLog();
    // `openLog`, `offerReRank` and `page` are stable enough for this: the ref is what makes it
    // happen once, not the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opensLog, page]);

  const removeChoice = (): SheetChoice[] =>
    page?.entry
      ? [
          {
            label: t('browse.game.removeFromLibrary'),
            destructive: true,
            onPress: () =>
              confirmDestructive({
                title: t('browse.game.removeFromLibrary'),
                message: t('browse.game.removeMessage'),
                confirmLabel: t('browse.game.remove'),
                onConfirm: () => run(() => removeEntry(supabase, id)),
              }),
          },
        ]
      : [];

  const openStatusMenu = () =>
    showActionSheet({
      title: page?.title,
      choices: [
        ...statusChoices(release).map(({ status, label }) => ({
          label: t(label),
          onPress: () => run(() => setStatus(supabase, id, status)),
        })),
        ...removeChoice(),
      ],
    });

  const openEllipsisMenu = () =>
    showActionSheet({
      choices: [
        { label: t('browse.game.changeStatus'), onPress: openStatusMenu },
        ...removeChoice(),
        ...(page
          ? [
              {
                label: t('browse.game.openOnIgdb'),
                onPress: () => {
                  void Linking.openURL(
                    `https://www.igdb.com/search?type=1&q=${encodeURIComponent(page.title)}`,
                  );
                },
              },
            ]
          : []),
      ],
    });

  // On the Duo's outer display UIKit moves the native Back into the column on
  // the right; the overflow goes under it (ui/side-column.tsx), and the header
  // keeps only the Back.
  const moreInColumn = useSideColumn(
    () => <ColumnButton icon="ellipsis" label={t('browse.game.more')} onPress={openEllipsisMenu} />,
    [t, openEllipsisMenu],
    { belowNativeBack: true },
  );

  const header = (
    <Stack.Screen
      options={{
        title: '',
        // The frame draws a 20pt `arrow-left` and the `from` label; the native
        // stack's own back button is the convention and carries the swipe.
        headerBackTitle: from,
        headerBackButtonDisplayMode: from ? 'default' : 'minimal',
        // With the Back in the Duo's column the bar is empty, and an empty bar
        // with a hairline reads as a stripe across the page.
        headerShadowVisible: !moreInColumn,
        headerRight: moreInColumn
          ? undefined
          : () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('browse.game.more')}
                hitSlop={10}
                onPress={openEllipsisMenu}
                style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
                <Icon name="ellipsis" size={20} />
              </Pressable>
            ),
      }}
    />
  );

  if (query.isPending) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
        {header}
        <GamePageSkeleton />
      </View>
    );
  }

  if (query.isError || !page) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
        {header}
        <ErrorLine
          message={query.isError ? t('browse.game.loadError') : t('browse.game.notInCatalog')}
          onRetry={query.isError ? () => void query.refetch() : undefined}
        />
      </View>
    );
  }

  const ranked = page.ranking !== null;
  const primary = primaryAction(page.ranking, release);
  const secondary = secondaryAction(page.entry, ranked, release);
  const status = statusLine(page.entry);
  const rows = detailRows(page, playerCount);

  const onSecondary = () => {
    switch (secondary?.kind) {
      case 'backlog':
        run(() => moveToBacklog(supabase, id));
        return;
      case 'play':
        run(() => setStatus(supabase, id, 'playing'));
        return;
      case 'move':
        // Moving a game means dragging it in the ranked list, and the Ranking
        // tab is the only screen that can do that (specs/game-page.md). The id
        // rides along as `focus`: the tab reads it once, scrolls that row into
        // view and tints it, then clears the param. Landing at rank 1 and
        // leaving the user to find their own game was the Phase 3 follow-up
        // this closes.
        router.navigate({ pathname: '/ranking', params: { focus: id } });
    }
  };

  const togglePlatform = (name: string) => {
    const played = (page.game?.platforms ?? [])
      .filter((platform) => platform.played)
      .map((platform) => platform.name);
    const next = played.includes(name) ? played.filter((other) => other !== name) : [...played, name];
    playedOn.mutate(next, { onError: writeFailed });
  };

  const breakdown = timeToBeatBreakdown(page);

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
      {header}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space[4],
          paddingTop: theme.space[2],
          paddingBottom: insets.bottom + theme.space[8],
          gap: 18,
        }}>
        <GameHeader page={page} />

        <ScoreLine items={scoreLineItems(page.scores, page.ranking)} />

        <ActionsRow
          primary={primary}
          secondary={secondary}
          busy={rankThis.isPending || write.isPending}
          onPrimary={() => rankThis.mutate()}
          onSecondary={onSecondary}
        />

        {status ? <StatusRow line={status} onChange={openStatusMenu} /> : null}

        <PlatformsSection
          platforms={page.game?.platforms ?? []}
          onToggle={togglePlatform}
          onOpenPicker={openPlatforms}
        />

        {/*
          Rule 20 hides an empty block, but the plus is the only way to add a
          personal fact, so Details also stands for a game the caller tracks and
          has told the app nothing about yet.
        */}
        {rows.length > 0 || page.entry ? (
          <DetailsSection
            rows={rows}
            onAdd={openDetailsSheet}
            onTimeToBeat={() =>
              showInfo(t('browse.game.timeToBeat.title'), breakdown.map((line) => say(t, line)).join('\n'))
            }
            onHours={openHours}
          />
        ) : null}

        {page.game?.summary ? <AboutSection summary={page.game.summary} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { opacity: 0.7 },
});
