/**
 * The movie page (frame `Movie page` 259:78; movies-brief.md, "Movie page",
 * and the third pass): pushed over the tabs, the back label the tab it came
 * from.
 *
 * Top to bottom: the poster at 120 beside the title, "year · runtime ·
 * certification", the genres and the director; the diary line (`diary-line.ts`)
 * with "Rank it ›" when watched and unranked; the theatrical line while it
 * applies; the two actions until the film is watched ("I watched this" opens
 * the log sheet, never the tier sheet, rule 35; "Want to watch" reads as the
 * state once the film is on the list); the score line with its caption; the
 * awards line when there is one; Where to watch as outlined chips with the
 * caller's own services checked and the JustWatch credit; Cast; About;
 * Details.
 *
 * Once a film is watched the page has no primary button (question 18's
 * default): the diary line's "Change" or "›" opens the diary, where "Log
 * another watch" is.
 *
 * The read is `moviePage` (PR 1's `movie_page` RPC) with the caller's entry
 * and ranking beside it (`reads.ts`); the release state comes in the same
 * row, and the diary is its own read. Rotten Tomatoes and the awards line
 * show when the catalog carries them.
 */

import {
  coverCandidates,
  diaryFor,
  moveToBacklog,
  removeEntry,
  removeMovieEntry,
  todayLocal,
  type MovieCastMember,
  type MoviePage,
} from '@verso/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alert, select, showDialog } from '@/lib/dialog';
import { filmFactsLine, filmGenreLabels, filmRuntime, tmdbScoreText } from '@/lib/film';
import { fullDate } from '@/lib/format';
import { invalidateEntry, invalidateMovieHome } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { GoingSheet, type GoingTarget } from '@/screens/watchlist/going-sheet';
import { useMyProfile } from '@/state/medium';
import { Button, Chip, Cover, ErrorLine, Icon, Skeleton, Text, TextButton, useTheme } from '@/ui';

import { diaryLine, streamingRow, theatricalLine } from './diary-line';
import { DiarySheet } from './diary-sheet';
import { readMoviePage } from './reads';
import { whereToWatch } from './where-to-watch';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TMDB_PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';

export function MoviePageScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const id = firstParam(params.id) ?? '';
  const from = firstParam(params.from);

  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = todayLocal();

  const profile = useMyProfile();
  const region = profile.data?.watchRegion ?? 'US';
  const myProviders = profile.data?.watchProviderIds ?? [];

  const page = useQuery({
    queryKey: queryKeys.moviePage(id, region),
    queryFn: () => readMoviePage(supabase, id, { region, today }),
    enabled: id !== '',
  });
  const diary = useQuery({
    queryKey: queryKeys.diaryFor(id),
    queryFn: () => diaryFor(supabase, id),
    enabled: id !== '',
  });

  const [going, setGoing] = useState<GoingTarget | null>(null);
  const [diaryOpen, setDiaryOpen] = useState(false);

  const watchlist = useMutation({
    mutationFn: async (onList: boolean): Promise<void> => {
      if (onList) await removeEntry(supabase, id);
      else await moveToBacklog(supabase, id);
    },
    onSuccess: () => {
      invalidateEntry(queryClient, id);
      invalidateMovieHome(queryClient);
    },
    onError: () => alert('Could not save', 'Check your connection and try again.'),
  });

  // "Remove from library": the diary goes with the entry (removeMovieEntry), so
  // the page does not go on saying "Watched". invalidateEntry clears the
  // `['movies']` keys, the diary among them.
  const removal = useMutation({
    mutationFn: () => removeMovieEntry(supabase, id),
    onSuccess: () => {
      invalidateEntry(queryClient, id);
      invalidateMovieHome(queryClient);
    },
    onError: () => alert('Could not remove it', 'Check your connection and try again.'),
  });

  const openLog = (rank = false) =>
    router.push({ pathname: '/log/[id]', params: rank ? { id, rank: '1' } : { id } });

  const data = page.data?.page ?? null;
  const entry = page.data?.entry ?? null;
  const ranking = page.data?.ranking ?? null;

  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerBackTitle: from,
        headerBackButtonDisplayMode: from ? 'default' : 'minimal',
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            hitSlop={10}
            onPress={() =>
              select({
                choices: [
                  ...(data?.tmdbId
                    ? [
                        {
                          label: 'Open on TMDB',
                          onPress: () => void Linking.openURL(`https://www.themoviedb.org/movie/${data.tmdbId}`),
                        },
                      ]
                    : []),
                  ...(entry
                    ? [
                        {
                          label: 'Remove from library',
                          destructive: true,
                          onPress: () =>
                            showDialog({
                              title: 'Remove from library',
                              message: 'This stops tracking the film and deletes its diary. Your ranking is not affected.',
                              buttons: [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Remove', style: 'destructive', onPress: () => removal.mutate() },
                              ],
                            }),
                        },
                      ]
                    : []),
                ],
              })
            }
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
            <Icon name="ellipsis" size={20} />
          </Pressable>
        ),
      }}
    />
  );

  if (page.isPending) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'], padding: theme.space[4], gap: 18 }]}>
        {header}
        <View style={[styles.row, { gap: 14 }]}>
          <Skeleton width={120} height={180} radius={10} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={30} />
            <Skeleton height={18} width={160} />
          </View>
        </View>
        <Skeleton height={50} />
      </View>
    );
  }

  if (page.isError || !data) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}>
        {header}
        <ErrorLine
          message={page.isError ? "We couldn't load this film." : 'This film is not in the catalog.'}
          onRetry={page.isError ? () => void page.refetch() : undefined}
        />
      </View>
    );
  }

  const rows = diary.data ?? [];
  const release = data.releaseState;
  const line = diaryLine(entry, rows, ranking !== null);
  const theatrical = theatricalLine(release.placement, release.placementOn, entry?.plannedOn ?? null, today);
  const onList = entry?.status === 'backlog';
  const inTheaters = release.placement === 'in_theaters';
  // The RPC's offers are already in JustWatch's display order; that order is
  // the priority the chips sort by after "mine" and the offer kind.
  const chips = whereToWatch(
    data.availability.map((offer, index) => ({ ...offer, priority: index })),
    myProviders,
    inTheaters,
  );
  const genres = filmGenreLabels(data.genres);
  const tmdb = tmdbScoreText(data.scores['tmdb']?.score);
  const rottenTomatoes = rottenTomatoesText(data.scores['rotten_tomatoes']?.score);
  const streaming = streamingRow(release.digitalOn, today);
  // TMDB's cast as the catalog stores it; a member with no name is not drawn.
  const cast = data.topCast.filter((member) => typeof member.name === 'string' && member.name.trim() !== '');

  const askGoing = () =>
    setGoing({
      mediaItemId: id,
      title: data.title,
      plannedOn: entry?.plannedOn ?? null,
      suggested: release.placement === 'opening' ? release.placementOn : null,
    });

  const toggleWatchlist = () => {
    if (!onList) {
      watchlist.mutate(false);
      return;
    }
    showDialog({
      title: 'Remove from your watchlist?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => watchlist.mutate(true) },
      ],
    });
  };

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
        <View style={[styles.row, styles.top, { gap: 14 }]}>
          <Cover width={120} radius={10} aspect="poster" candidates={coverCandidates(data)} accessibilityLabel={data.title} />
          <View style={[styles.fill, { gap: 6 }]}>
            <Text size={28} weight={700}>
              {data.title}
            </Text>
            <MaybeLine text={filmFactsLine(data.year, data.runtimeMinutes, data.certification)} />
            <MaybeLine text={genres.length > 0 ? genres.slice(0, 2).join(' · ') : null} />
            <MaybeLine text={data.directors.length > 0 ? data.directors.slice(0, 2).join(', ') : null} />
          </View>
        </View>

        {line.text || line.rankIt ? (
          <View style={[styles.row, styles.wrap, { gap: theme.space[3] }]}>
            {line.text ? (
              <Pressable
                accessibilityRole={line.action ? 'button' : 'text'}
                disabled={line.action === null}
                onPress={() => setDiaryOpen(true)}
                style={[styles.row, { gap: 6 }]}>
                <Text size={15}>{line.action === 'open' ? `${line.text} ›` : line.text}</Text>
                {line.action === 'change' ? (
                  <Text size={15} color="brand/text">
                    · Change
                  </Text>
                ) : null}
              </Pressable>
            ) : null}
            {line.rankIt ? <TextButton label="Rank it ›" size={15} color="brand/text" onPress={() => openLog(true)} /> : null}
            {/*
              Once watched the page has no primary button (question 18), so
              this is the way back to the log sheet for a rewatch, whatever
              the diary holds: a film with no dated row (its only watch
              removed, or marked seen by the deck) has nothing else to tap.
            */}
            {line.watched ? (
              <TextButton label="Log another watch" size={15} color="brand/text" onPress={() => openLog()} />
            ) : null}
          </View>
        ) : null}

        {theatrical ? (
          <View style={[styles.row, { gap: 6 }]}>
            <Text size={15}>{theatrical.text} ·</Text>
            <TextButton
              label={theatrical.action === 'change' ? 'Change' : 'Going? ›'}
              size={15}
              weight={400}
              color="brand/text"
              onPress={askGoing}
            />
          </View>
        ) : null}

        {!line.watched ? (
          <View style={[styles.row, { gap: 10 }]}>
            <Button label="I watched this" style={[styles.fill, styles.action]} onPress={() => openLog()} />
            <Button
              label="Want to watch"
              variant="secondary"
              style={[styles.fill, styles.action]}
              disabled={watchlist.isPending}
              onPress={toggleWatchlist}
              {...(onList
                ? {
                    leading: <Icon name="check" size={16} color="brand/text" />,
                    labelColor: 'brand/text' as const,
                  }
                : {})}
            />
          </View>
        ) : null}

        {tmdb ? (
          <View style={{ gap: 4 }}>
            <View style={[styles.row, { gap: 16 }]}>
              <Score value={tmdb} source="TMDB" />
              {rottenTomatoes !== null ? <Score value={rottenTomatoes} source="Tomatometer" /> : null}
            </View>
            <Text size={12} color="text/secondary">
              {rottenTomatoes !== null ? 'Scores from TMDB and Wikidata' : 'Score from TMDB'}
            </Text>
          </View>
        ) : null}

        {data.awards ? <Text size={15}>{data.awards}</Text> : null}

        <View style={{ gap: theme.space[2] }}>
          <BlockTitle title="Where to watch" />
          {chips.length > 0 ? (
            <View style={[styles.row, styles.wrap, { gap: theme.space[2] }]}>
              {chips.map((chip) => (
                <Chip key={chip.key} label={chip.label} size={14} variant={chip.mine ? 'played' : 'surface'} />
              ))}
            </View>
          ) : (
            <Text size={15} color="text/secondary">
              Not streaming where you are
            </Text>
          )}
          <Text size={12} color="text/secondary">
            Streaming data by JustWatch
          </Text>
        </View>

        {cast.length > 0 ? (
          <View style={{ gap: theme.space[2] }}>
            <BlockTitle title="Cast" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {cast.map((member, index) => (
                <CastColumn key={`${index}:${member.name}`} member={member} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {data.overview ? (
          <View style={{ gap: theme.space[2] }}>
            <BlockTitle title="About" />
            <Text size={15}>{data.overview}</Text>
          </View>
        ) : null}

        <Details data={data} streaming={streaming} />
      </ScrollView>

      <GoingSheet target={going} onDismiss={() => setGoing(null)} />
      <DiarySheet
        visible={diaryOpen}
        mediaItemId={id}
        title={data.title}
        rows={rows}
        onLogAnother={() => {
          setDiaryOpen(false);
          openLog();
        }}
        onDismiss={() => setDiaryOpen(false)}
      />
    </View>
  );
}

function MaybeLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Text size={15} color="text/secondary">
      {text}
    </Text>
  );
}

function BlockTitle({ title }: { title: string }) {
  return (
    <Text size={20} weight={600} accessibilityRole="header">
      {title}
    </Text>
  );
}

function Score({ value, source }: { value: string; source: string }) {
  return (
    <View style={[styles.row, { gap: 4, alignItems: 'baseline' }]}>
      <Text size={15} weight={700}>
        {value}
      </Text>
      <Text size={12} color="text/secondary">
        {source}
      </Text>
    </View>
  );
}

/** Rotten Tomatoes as the page prints it, `94%`; null when the catalog has none. */
function rottenTomatoesText(score: number | null | undefined): string | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  return `${Math.round(score)}%`;
}

function CastColumn({ member }: { member: MovieCastMember }) {
  const theme = useTheme();
  return (
    <View style={{ width: 64, alignItems: 'center', gap: 6 }}>
      <View style={[styles.face, { backgroundColor: theme.colors['bg/placeholder'] }]}>
        {member.profilePath?.startsWith('/') ? (
          <Image
            source={{ uri: `${TMDB_PROFILE_BASE}${member.profilePath}` }}
            style={styles.faceImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <Text size={12} align="center" numberOfLines={2}>
        {member.name}
      </Text>
    </View>
  );
}

function Details({ data, streaming }: { data: MoviePage; streaming: { label: string; value: string } | null }) {
  const theme = useTheme();
  const rows = useMemo(
    () =>
      [
        { label: 'Released', value: fullDate(data.releaseDate) },
        streaming ? { label: streaming.label, value: streaming.value } : null,
        { label: 'Runtime', value: filmRuntime(data.runtimeMinutes) },
        { label: 'Part of', value: data.collectionName },
      ].filter((row): row is { label: string; value: string } => row !== null && row.value !== null && row.value !== ''),
    [data, streaming],
  );
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: theme.space[1] }}>
      <BlockTitle title="Details" />
      {rows.map((row) => (
        <View key={row.label} style={[styles.row, styles.between, { paddingVertical: 8 }]}>
          <Text size={15} color="text/secondary">
            {row.label}
          </Text>
          <Text size={15}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  top: { alignItems: 'flex-start' },
  // Two buttons side by side at 402: the shared row is narrower than a full
  // button, so the side padding gives way before "Want to watch" wraps.
  action: { paddingHorizontal: 8, gap: 6 },
  between: { justifyContent: 'space-between' },
  face: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden' },
  faceImage: { width: '100%', height: '100%' },
  pressed: { opacity: 0.7 },
});
