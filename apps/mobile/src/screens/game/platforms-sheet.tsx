/**
 * "Played on": which platforms did you play it on?
 *
 * The same chips as the game page, with room to breathe: the page's row is a
 * quick toggle for the one platform you played it on, and this is the picker
 * for a game that is on eleven of them, or for clearing the list.
 *
 * Words here, marks there (rule 31, Rafa 2026-09-16). The game page's chips are
 * brand glyphs because the row is recognised at a glance; this is a list being
 * read and chosen from, so it keeps the names — `platformShortName`, the way
 * the app writes a platform as a word everywhere else, not IGDB's own `PC
 * (Microsoft Windows)`.
 *
 * Where a game was played is its own fact (decision 19), so nothing here
 * touches status. The names come from `game_details.platforms`, which is also
 * what `setPlayedPlatforms` validates against — so `UnknownPlatformError`
 * cannot happen from this sheet.
 *
 * It works from nothing but an id, so any screen can open it.
 */

import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { platforms as formatPlatforms, platformShortName } from '@/lib/format';
import { Chip, ErrorLine, SheetFrame, Text, TextButton, useTheme } from '@/ui';

import { PlayedBox } from './game-platforms';
import { useGamePage, usePlayedPlatforms, useSheetSave } from './use-game';

export function PlatformsSheet({ id }: { id: string }) {
  const theme = useTheme();
  const query = useGamePage(id);
  const { dismiss } = useSheetSave(id);
  const playedOn = usePlayedPlatforms(id);

  const page = query.data ?? null;
  const catalog = page?.game?.platforms ?? [];
  const stored = catalog.filter((platform) => platform.played).map((platform) => platform.name);

  // Null until the first tap: the sheet shows what is stored, then what has
  // been chosen. Seeding with an effect would fight a background refetch.
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? stored;

  const toggle = (name: string) =>
    setPicked(
      selected.includes(name) ? selected.filter((other) => other !== name) : [...selected, name],
    );

  // Dismiss only once the write has landed: the optimistic update rolls back on
  // failure, and a sheet that closed over a rollback would have thrown the
  // choice away without saying so.
  const onSave = () => {
    playedOn.mutate(selected, {
      onSuccess: dismiss,
      onError: () => Alert.alert('Could not save', 'Check your connection and try again.'),
    });
  };

  // Empty is "not recorded", never "not played" (decision 19).
  const summary = formatPlatforms(selected, ', ') ?? 'Not recorded';

  return (
    <SheetFrame title="Played on" onCancel={dismiss} onSave={onSave} saveDisabled={playedOn.isPending}>
      {query.isError ? (
        <ErrorLine message="We couldn't load this game." onRetry={() => void query.refetch()} />
      ) : null}

      {catalog.length === 0 && !query.isPending && !query.isError ? (
        <Text size={15} color="text/secondary">
          The catalog does not list any platforms for this game yet.
        </Text>
      ) : null}

      <View style={[styles.chips, { gap: theme.space[2] }]}>
        {catalog.map((platform) => {
          const played = selected.includes(platform.name);
          return (
            <Chip
              key={platform.name}
              label={platformShortName(platform.name)}
              size={14}
              variant={played ? 'played' : 'surface'}
              onPress={() => toggle(platform.name)}
            />
          );
        })}
      </View>

      <View style={[styles.summary, { gap: theme.space[2] }]}>
        <PlayedBox played={selected.length > 0} />
        <Text size={14} color="text/secondary">
          {summary}
        </Text>
      </View>

      {selected.length > 0 ? (
        <View style={styles.footer}>
          <TextButton label="Clear" color="text/secondary" onPress={() => setPicked([])} />
        </View>
      ) : null}
    </SheetFrame>
  );
}

export function PlatformsSheetRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return <PlatformsSheet id={id ?? ''} />;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  summary: { flexDirection: 'row', alignItems: 'center' },
  footer: { alignItems: 'center' },
});
