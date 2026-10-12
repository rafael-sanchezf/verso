/**
 * Which platforms the game is on, and which of them you played it on.
 *
 * Where a game was played is its own fact (decision 19): a ranked game was
 * played, on these platforms. It is settable from here because this is where
 * you are looking when you remember it. A chip is a toggle, so the common case
 * — "I played it on PS5" — is one tap and never opens a sheet.
 *
 * This is the played-on step of item 32 as decision 26 (2026-10-06) placed
 * it: the glyph row, the line and the sheet keep the drawing they had, and
 * ask where you played the game.
 *
 * The chips are brand marks rather than words (rule 31, Rafa 2026-09-16):
 * "Nintendo Switch 2" spelled out took three quarters of the row for one chip,
 * and nobody has to read the letters to know a PlayStation from a Switch. The
 * full name is every chip's accessibility label, and the words themselves are
 * still the whole of the platforms sheet, which is where you are reading a list
 * rather than recognising one.
 *
 * The line underneath is the summary and the way into that sheet, for the cases
 * the chip row cannot serve: a game on eleven platforms, or clearing the list
 * altogether.
 */

import { ScrollView, StyleSheet, View } from 'react-native';

import { platformGlyphs } from '@/lib/format';
import { Icon, PlatformChip, PlatformIcon, Pressed, Text, useTheme } from '@/ui';

import type { PlatformPlayed } from '@verso/api';

/**
 * 16pt: the brand green with a white check when a platform is recorded, an empty
 * square when none is. Empty means not recorded, never "not played", which is
 * why the line beside an empty box says so in words.
 */
export function PlayedBox({ played }: { played: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.box,
        played
          ? { backgroundColor: theme.colors['brand/primary'] }
          : { borderWidth: 1.5, borderColor: theme.colors['border/separator'] },
      ]}>
      {played ? <Icon name="check" size={11} color="brand/on-primary" strokeWidth={3} /> : null}
    </View>
  );
}

/** Past this many played-on platforms the line says nothing and the sheet says it all. */
const GLYPHS_IN_LINE = 3;

export function PlatformsSection({
  platforms,
  onToggle,
  onOpenPicker,
}: {
  platforms: PlatformPlayed[];
  onToggle: (name: string) => void;
  onOpenPicker: () => void;
}) {
  const theme = useTheme();

  if (platforms.length === 0) return null;

  // Suffixes are a fact about the list, not about one platform: `4` and `5`
  // only earn their space on a game that is on both PlayStations. Keyed by name
  // rather than zipped by index because `platformGlyphs` drops blank entries.
  const suffixes = new Map(
    platformGlyphs(platforms.map((platform) => platform.name)).map((glyph) => [
      glyph.name,
      glyph.suffix,
    ]),
  );

  const played = platforms.filter((platform) => platform.played).map((platform) => platform.name);
  // The line is its own list, so it gets its own suffixes: two marks in it need
  // telling apart only if both of them are in it.
  const playedGlyphs = platformGlyphs(played);

  return (
    <View style={{ gap: theme.space[3] }}>
      <Text size={18} weight={700}>
        Platforms
      </Text>

      {/*
        The row bleeds off the right edge rather than stopping at the 16pt
        gutter, which is how every horizontal list in the frames says "there is
        more this way" (specs/README.md).
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -theme.space[4] }}
        contentContainerStyle={{ paddingHorizontal: theme.space[4], gap: theme.space[2] }}>
        {platforms.map((platform) => (
          // The chip draws a mark; the value stays the catalog's own name,
          // because that is what `setPlayedPlatforms` validates against.
          <PlatformChip
            key={platform.name}
            name={platform.name}
            suffix={suffixes.get(platform.name.trim()) ?? ''}
            played={platform.played}
            onPress={() => onToggle(platform.name)}
          />
        ))}
      </ScrollView>

      <Pressed onPress={onOpenPicker} style={[styles.line, { gap: theme.space[2] }]}>
        <PlayedBox played={played.length > 0} />
        {/*
          No platform names in the words (rule 31): the marks to the right
          already say which, and on a game played on four of them the words
          would be a promise the line does not keep.
        */}
        <Text size={14} color="text/secondary">
          Played on
        </Text>

        <View style={styles.spacer} />

        {/*
          One to three marks in line; past three the chevron is the answer,
          because four marks and a chevron is a row nobody reads.
        */}
        {playedGlyphs.length > 0 && playedGlyphs.length <= GLYPHS_IN_LINE ? (
          <View style={[styles.glyphs, { gap: theme.space[2] }]}>
            {playedGlyphs.map((glyph) => (
              <PlatformIcon key={glyph.name} name={glyph.name} suffix={glyph.suffix} />
            ))}
          </View>
        ) : null}

        {/*
          An empty list is "not recorded", not "not played" (decision 19): most
          entries predate the question, and a ranked game was played. Said in
          words because an empty box beside "Played on" alone reads as "no".
        */}
        <Text size={14} weight={500}>
          {played.length === 0 ? 'Not recorded ›' : '›'}
        </Text>
      </Pressed>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { flexDirection: 'row', alignItems: 'center' },
  glyphs: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1, minWidth: 8 },
});
