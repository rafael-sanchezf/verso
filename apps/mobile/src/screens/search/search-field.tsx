/**
 * The search field, drawn inline under the large title.
 *
 * Not a navigation-bar search bar: the frames put the field in the content, on
 * `bg/surface`, below a title that does not collapse, and specs/search.md says
 * so in as many words. iOS's `headerSearchBarOptions` would take the title with
 * it on scroll and is the thing to revisit if the header ever starts collapsing.
 *
 * Two conventions that the frames do not draw (rule 7, both listed in the PR):
 *
 * - The clear `x` is ours rather than `clearButtonMode`. The frame draws a plain
 *   16pt `x` in `text/secondary`, iOS draws a filled grey circle, and ours also
 *   survives the field losing focus — which is exactly the state the no-results
 *   frame is in.
 * - "Cancel" appears beside a focused field, as it does in every iOS search
 *   screen, and gets the user out of a search in one tap (rule 12).
 */

import { useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { Icon, TextButton } from '@/ui';
import { fontFamilyFor, useTheme } from '@/ui/theme';

export interface SearchFieldProps {
  value: string;
  onChangeValue: (value: string) => void;
  /**
   * The input, for a screen that focuses it itself: the Playing intent opens
   * with the keyboard up, because typing the title is the only next step.
   */
  inputRef?: RefObject<TextInput | null>;
  /** "Search games" by default; "Search films" in the movie medium. */
  placeholder?: string;
}

export function SearchField({ value, onChangeValue, inputRef, placeholder: given }: SearchFieldProps) {
  const t = useT();
  const theme = useTheme();
  const placeholder = given ?? t('browse.search.placeholderGames');
  const ownRef = useRef<TextInput>(null);
  const input = inputRef ?? ownRef;
  const [focused, setFocused] = useState(false);

  // Cancel stays while there is a query to cancel, not only while the field has
  // focus: the no-results frame is exactly the state where the keyboard is down
  // and the search is still on.
  const showCancel = focused || value !== '';

  return (
    <View style={[styles.row, { paddingHorizontal: theme.space[4], paddingBottom: theme.space[4], gap: theme.space[3] }]}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors['bg/surface'],
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.space[3],
            paddingVertical: 10,
            gap: theme.space[2],
          },
        ]}>
        <Icon name="search" size={18} color="text/secondary" />

        <TextInput
          ref={input}
          value={value}
          onChangeText={onChangeValue}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors['text/secondary']}
          // A game title is not a word: autocorrect turns "Silksong" into
          // "Silkson" and the capitaliser fights every lowercase title.
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          returnKeyType="search"
          // Ours instead, below: the frame's is a plain x and outlives the focus.
          clearButtonMode="never"
          accessibilityLabel={placeholder}
          style={[
            styles.input,
            { color: theme.colors['text/primary'], fontFamily: fontFamilyFor(400) },
          ]}
        />

        {value === '' ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('browse.search.clearSearch')}
            hitSlop={10}
            onPress={() => onChangeValue('')}
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <Icon name="x" size={16} color="text/secondary" />
          </Pressable>
        )}
      </View>

      {showCancel ? (
        <TextButton
          label={t('common.cancel')}
          size={17}
          weight={400}
          onPress={() => {
            onChangeValue('');
            input.current?.blur();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 17,
    // Without this the input is taller than its text on Android and the 10pt
    // vertical padding stops being 10.
    padding: 0,
  },
  pressed: { opacity: 0.7 },
});
