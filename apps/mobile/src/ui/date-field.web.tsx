/**
 * `DateField` in a browser: a native `<input type="date">`, styled from tokens.
 *
 * The community picker the phone uses is "not supported on web" (W0 finding
 * 5); the details sheet's Started and Purchased rows set a default day there
 * with no way to change it. Every browser has a date picker of its own behind
 * a date input, with the keyboard, the locale's order and a screen reader's
 * support built in, so that is the web convention (rule 7 read for the web).
 *
 * Same props and same `YYYY-MM-DD` out as `date-field.tsx`. One difference, a
 * convention rather than a choice: an unset day is the empty input, which
 * already says "pick a day", rather than an "Add" button in front of it.
 * Clearing it in the browser's own control gives null only when the row is
 * `clearable`; otherwise the previous day stays.
 *
 * `color-scheme` follows the theme, so the calendar the browser opens is dark
 * in dark mode. The ring is the app's focus ring, drawn on any focus: a text
 * field shows focus after a click too, as `:focus-visible` does for inputs.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/lib/i18n';

import { TextButton } from './button';
import { dateOnlyOf, type DateFieldProps } from './date-field-value';
import { Text } from './text';
import { fontFamilyFor, useTheme } from './theme';

export type { DateFieldProps } from './date-field-value';

export function DateField({ label, value, onChange, max, min, clearable = false }: DateFieldProps) {
  const t = useT();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const current = dateOnlyOf(value) ?? '';

  return (
    <View style={[styles.row, { paddingVertical: theme.space[2], gap: theme.space[3] }]}>
      <Text size={15} color="text/secondary">
        {label}
      </Text>

      <View style={[styles.row, { gap: theme.space[3] }]}>
        <input
          type="date"
          aria-label={label}
          value={current}
          max={max}
          min={min}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (next) onChange(next);
            else if (clearable) onChange(null);
          }}
          style={{
            fontFamily: fontFamilyFor(400),
            fontSize: 15,
            lineHeight: '20px',
            color: theme.colors['text/primary'],
            backgroundColor: theme.colors['bg/surface'],
            colorScheme: theme.scheme,
            border: 'none',
            borderRadius: theme.radius.sm,
            padding: `${theme.space[1]}px ${theme.space[2]}px`,
            outlineColor: theme.colors['brand/text'],
            outlineStyle: focused ? 'solid' : 'none',
            outlineWidth: 2,
            outlineOffset: 2,
          }}
        />
        {clearable && current ? (
          <TextButton label={t('shell.dateField.clear')} size={14} color="text/secondary" onPress={() => onChange(null)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
