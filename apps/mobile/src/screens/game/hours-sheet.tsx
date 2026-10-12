/**
 * "How long have you played this?"
 *
 * One field, because that is the whole question. Never drawn, so it is the iOS
 * convention: a form sheet that sizes itself to its content, a decimal keypad,
 * Cancel and Save, and a quiet Clear underneath for a figure that was wrong.
 *
 * Hours in, minutes stored. The column is minutes because Steam reports minutes
 * and an import must not lose precision; a person thinks in hours and says
 * "about 14" or "14.5", which is why the field takes a decimal and rounds on
 * the way in.
 */

import { logPlaytime } from '@verso/api';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { ErrorLine, FieldLabel, fontFamilyFor, SheetFrame, Text, TextButton, useTheme } from '@/ui';

import { hoursFieldValue, minutesFromField } from './hours';
import { useGamePage, useSheetSave } from './use-game';

export function HoursSheet({ id }: { id: string }) {
  const theme = useTheme();
  const query = useGamePage(id);
  const { save, pending, dismiss } = useSheetSave(id);

  const stored = query.data?.entry?.playtimeMinutes ?? null;
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? hoursFieldValue(stored);
  const minutes = minutesFromField(text);

  return (
    <SheetFrame
      title="Hours played"
      scroll={false}
      onCancel={dismiss}
      onSave={() => save([() => logPlaytime(supabase, id, minutes, 'manual')])}
      saveDisabled={pending || minutes === null}
      footer={
        stored === null ? null : (
          <View style={styles.footer}>
            <TextButton
              label="Clear"
              color="text/destructive"
              onPress={() => save([() => logPlaytime(supabase, id, null)])}
            />
          </View>
        )
      }>
      {query.isError ? (
        <ErrorLine message="We couldn't load this game." onRetry={() => void query.refetch()} />
      ) : null}

      <View style={{ gap: theme.space[2] }}>
        <FieldLabel>Hours</FieldLabel>
        <View style={[styles.field, { gap: theme.space[2] }]}>
          <TextInput
            value={text}
            onChangeText={setTyped}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            placeholderTextColor={theme.colors['text/secondary']}
            autoFocus
            selectTextOnFocus
            accessibilityLabel="Hours played"
            style={[
              styles.input,
              {
                backgroundColor: theme.colors['bg/surface'],
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.space[4],
                paddingVertical: 14,
                color: theme.colors['text/primary'],
                fontFamily: fontFamilyFor(400),
              },
            ]}
          />
          <Text size={15} color="text/secondary">
            h
          </Text>
        </View>
        <Text size={13} color="text/secondary">
          Entered by hand. A figure imported from Steam says so instead.
        </Text>
      </View>
    </SheetFrame>
  );
}

/** The route component: the id comes off the URL, the sheet does the rest. */
export function HoursSheetRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return <HoursSheet id={id ?? ''} />;
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: 17 },
  footer: { alignItems: 'center' },
});
