/**
 * The sign-in sheet's text field.
 *
 * Its own component rather than a shared primitive: this is the only place in
 * the app with a form field so far, and the screens that get one next (the
 * hours sheet, the notes sheet, edit profile) will want different things from
 * it. When two of them agree it moves to `src/ui`.
 */

import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { fontFamilyFor, useTheme } from '@/ui/theme';

export interface FieldProps extends TextInputProps {
  invalid?: boolean;
}

export function Field({ invalid = false, style, ...rest }: FieldProps) {
  const theme = useTheme();

  return (
    <TextInput
      {...rest}
      placeholderTextColor={theme.colors['text/secondary']}
      // The sheet is `bg/canvas`, so a `bg/canvas` field would be invisible —
      // the frame draws exactly that. `bg/surface` is what separates it.
      style={[
        styles.field,
        {
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.space[4],
          paddingVertical: 14,
          color: theme.colors['text/primary'],
          fontFamily: fontFamilyFor(400),
          borderColor: invalid ? theme.colors['text/destructive'] : 'transparent',
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    fontSize: 17,
    // Always present so the field does not resize when an error appears.
    borderWidth: 1,
  },
});
