/**
 * A labelled date row: the platform's own date picker.
 *
 * The details sheet's Started and Purchased rows are the reason (rule 7: a
 * date is the platform's picker, which makes "when did I buy this?" a two-tap
 * answer). On iOS that is the compact `DateTimePicker`, inline in the row. On
 * Android the component form is a dialog that opens the moment it mounts, so
 * the row shows the day as a text button and opens the dialog through
 * `DateTimePickerAndroid.open`, which is the library's documented path there.
 *
 * Web has its own file, `date-field.web.tsx`: the community picker is "not
 * supported on web" (W0 finding 5), and a browser has a date picker of its own
 * in `<input type="date">`. Both files take `DateFieldProps` and give back a
 * local `YYYY-MM-DD`, so a screen renders one `DateField` everywhere.
 *
 * An unset day shows "Add", which sets today; nothing is pre-filled with a
 * guess (rule 9).
 */

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, StyleSheet, View } from 'react-native';

import { fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';

import { TextButton } from './button';
import { dateOnly, localDateOf, type DateFieldProps } from './date-field-value';
import { Text } from './text';
import { useTheme } from './theme';

export type { DateFieldProps } from './date-field-value';

export function DateField({ label, value, onChange, max, min, clearable = false }: DateFieldProps) {
  const t = useT();
  const theme = useTheme();
  const date = localDateOf(value);
  const maximumDate = localDateOf(max) ?? undefined;
  const minimumDate = localDateOf(min) ?? undefined;

  // `onValueChange` rather than the deprecated `onChange` (datetimepicker 9.1):
  // it fires only for a pick, never for a dismiss, so the date it carries is
  // always the one chosen. A dismiss needs nothing here; the value stays.
  const pick = (_event: unknown, picked: Date) => {
    onChange(dateOnly(picked));
  };

  return (
    <View style={[styles.row, { paddingVertical: theme.space[2], gap: theme.space[3] }]}>
      <Text size={15} color="text/secondary">
        {label}
      </Text>

      {date ? (
        <View style={[styles.row, { gap: theme.space[3] }]}>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="compact"
              maximumDate={maximumDate}
              minimumDate={minimumDate}
              accessibilityLabel={label}
              onValueChange={pick}
            />
          ) : (
            <TextButton
              label={fullDate(dateOnly(date)) ?? dateOnly(date)}
              size={15}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: date,
                  mode: 'date',
                  maximumDate,
                  minimumDate,
                  // Only a pick calls this; a dismiss goes to `onDismiss`,
                  // which there is no need for.
                  onValueChange: pick,
                })
              }
            />
          )}
          {clearable ? (
            <TextButton label={t('shell.dateField.clear')} size={14} color="text/secondary" onPress={() => onChange(null)} />
          ) : null}
        </View>
      ) : (
        <TextButton label={t('shell.dateField.add')} size={15} onPress={() => onChange(dateOnly(new Date()))} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
