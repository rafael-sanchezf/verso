/**
 * The Edit profile sheet's text field.
 *
 * Its own component rather than a shared primitive, the same call
 * `src/screens/sign-in/field.tsx` makes for the sign-in sheet: this is the
 * second place in the app with a form field, and the two are not yet worth
 * unifying into `src/ui` on their own (that folder belongs to the shell).
 * When a third screen wants one, that is the moment to move it there.
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
    borderWidth: 1,
  },
});
