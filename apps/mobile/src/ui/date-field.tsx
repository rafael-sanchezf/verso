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

import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, StyleSheet, View } from 'react-native';

import { fullDate } from '@/lib/format';

import { TextButton } from './button';
import { dateOnly, localDateOf, type DateFieldProps } from './date-field-value';
import { Text } from './text';
import { useTheme } from './theme';

export type { DateFieldProps } from './date-field-value';

export function DateField({ label, value, onChange, max, min, clearable = false }: DateFieldProps) {
  const theme = useTheme();
  const date = localDateOf(value);
  const maximumDate = localDateOf(max) ?? undefined;
  const minimumDate = localDateOf(min) ?? undefined;

  const pick = (_event: DateTimePickerEvent, picked?: Date) => {
    if (picked) onChange(dateOnly(picked));
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
              onChange={pick}
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
                  // `dismissed` arrives with the old date; only `set` is a pick.
                  onChange: (event, picked) => {
                    if (event.type === 'set') pick(event, picked);
                  },
                })
              }
            />
          )}
          {clearable ? <TextButton label="Clear" size={14} color="text/secondary" onPress={() => onChange(null)} /> : null}
        </View>
      ) : (
        <TextButton label="Add" size={15} onPress={() => onChange(dateOnly(new Date()))} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
