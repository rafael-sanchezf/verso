/**
 * Which medium you are in, and the tap that changes it.
 *
 * Rule 4 says the app is always in exactly one medium and rule 6 says you tap
 * to change it, never swipe. So this is the whole mechanism: the active medium
 * is named on the left in the brand text color, the other media you track sit
 * on the right as icons in `text/secondary`, and a tap swaps them. No medium
 * has a color of its own (decision 29): the word says which one you are in,
 * and the one brand green says which is active.
 *
 * The active medium is its word alone, with no mark and no icon beside it
 * (brand-build.md, default 5, 2026-10-08): Rafa does not want Verso's mark at
 * the top of Home, Apple's guidance is not to repeat the logo inside the app,
 * and the header is to be redesigned. The icon, the splash and the signed-out
 * lockup carry the mark.
 *
 * Since the movies build (movies-build.md, PR 2, item 1) the choice is real
 * and kept: it is the app's active medium (`state/medium.ts`), every tab reads
 * it, it no longer resets when Home is left, and it survives a relaunch. The
 * icons are the media in `profile.media` (decision 25: the switcher shows only
 * the chosen media), and where the untracked ones used to sit is one "add a
 * medium" control, which offers the live media the profile does not track and
 * adds the one picked. TV and books are held (decision 23) and never offered.
 * The pick switches at once and writes behind it (`add-medium.ts`, VER-203).
 */

import { setProfileMedia, type Profile } from '@verso/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';

import { alert, select } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { invalidateProfileSettings } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { addableMedia, MEDIUM_WORDS, otherMedia, useActiveMedium, useMyProfile } from '@/state/medium';
import { Icon, Text, useTheme } from '@/ui';

import { addMediumHandlers } from './add-medium';

export function MediaSwitcher() {
  const t = useT();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { medium, setMedium } = useActiveMedium();
  const profile = useMyProfile();
  const media = profile.data?.media;

  const others = otherMedia(medium, media);
  // Only once the profile has answered: before it, every medium looks untracked.
  const addable = profile.isSuccess ? addableMedia(media) : [];

  // The choice shows the moment it is made and the write follows (add-medium.ts
  // says why: waiting on the write and a refetch read as a tap that missed).
  const add = useMutation(
    addMediumHandlers({
      readProfile: () => queryClient.getQueryData<Profile>(queryKeys.profileMe()),
      writeProfile: (next) => queryClient.setQueryData(queryKeys.profileMe(), next),
      cancelProfileReads: () => queryClient.cancelQueries({ queryKey: queryKeys.profileMe() }),
      currentMedium: () => medium,
      setMedium,
      save: (next) => setProfileMedia(supabase, next),
      invalidate: () => invalidateProfileSettings(queryClient),
      reportFailure: () => alert(t('shell.mediaSwitcher.couldNotAdd'), t('shell.mediaSwitcher.checkConnection')),
    }),
  );

  const offerToAdd = () =>
    select({
      title: t('shell.mediaSwitcher.addMedium'),
      message: t('shell.mediaSwitcher.addMessage'),
      choices: addable.map((next) => ({
        label: t(MEDIUM_WORDS[next].plural),
        onPress: () => add.mutate(next),
      })),
    });

  const word = MEDIUM_WORDS[medium];

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: theme.space[4], paddingBottom: theme.space[3] },
      ]}>
      {/*
        Keyed by the medium so the name re-enters on every switch: the word
        arriving is what makes the change read as "you are somewhere else now"
        rather than as a label quietly rewriting itself.
      */}
      <Animated.View key={medium} entering={FadeInLeft.duration(220)} style={styles.active}>
        <Text size={30} weight={700} color="brand/text" numberOfLines={1}>
          {t(word.plural)}
        </Text>
      </Animated.View>

      <View style={[styles.others, { gap: 10 }]}>
        {others.map((other) => (
          <Pressable
            key={other}
            accessibilityRole="button"
            accessibilityLabel={t(MEDIUM_WORDS[other].plural)}
            accessibilityHint={t('shell.mediaSwitcher.switchTo', { medium: t(MEDIUM_WORDS[other].plural) })}
            // A 28pt icon is under the 44pt target iOS asks for, and these sit
            // 10pt apart; the slop makes them reachable without spacing them out.
            hitSlop={8}
            onPress={() => setMedium(other)}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
            <Icon name={MEDIUM_WORDS[other].icon} size={28} color="text/secondary" />
          </Pressable>
        ))}
        {addable.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('shell.mediaSwitcher.addMedium')}
            hitSlop={8}
            disabled={add.isPending}
            onPress={offerToAdd}
            style={({ pressed }) => [
              styles.add,
              { borderColor: theme.colors['border/separator'] },
              pressed ? styles.pressed : undefined,
            ]}>
            <Icon name="plus" size={18} color="text/secondary" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  others: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // A dashed circle the size of the medium icons: a place for one more.
  add: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
