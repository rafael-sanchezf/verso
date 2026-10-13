/**
 * The personal facts, behind the plus.
 *
 * Rule 20: the game page has no "Started: add" rows, so this sheet is where a
 * missing one is filled in and the row appears afterwards. Rule 9's other half
 * applies here too — everything on this sheet is hand-entered by definition, so
 * nothing is pre-filled with a guess.
 *
 * Never drawn; it is the iOS convention (rule 7). The dates use the platform's
 * own compact date picker rather than three text fields, which is what makes
 * "when did I start this?" a two-tap answer.
 *
 * Purchased left the sheet with decision 26, which took ownership out of the
 * product (phone feedback entry 12). The `purchased_at` column and
 * `setPurchasedAt` stay in `@verso/api` until the `owned_platforms` clean-up.
 *
 * Two notes on what is missing:
 *
 * - Finished has no Clear. `entries.ts` can set a finished date
 *   (`markFinished`) and nothing can unset one, which is deliberate there: the
 *   day happened. Started clears, because it is a correction of something the
 *   app or the user wrote.
 * - Hours is here as well as in its own sheet, because ui-principles rule 20
 *   names it among the personal fields that live behind this plus. The separate
 *   sheet is the quick path Home's long press opens.
 */

import { logPlaytime, markFinished, setNotes, setStartedAt, todayLocal } from '@verso/api';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { ErrorLine, FieldLabel, fontFamilyFor, SheetFrame, Text, TextButton, useTheme } from '@/ui';

import { hoursFieldValue, minutesFromField } from './hours';
import { useGamePage, useSheetSave } from './use-game';

import type { GamePage } from '@verso/api';

/** What the sheet holds while it is open, in the shapes the writers take. */
interface Draft {
  /** ISO timestamp: `started_at` is a `timestamptz`. */
  startedAt: string | null;
  /** `YYYY-MM-DD`; nobody remembers the hour. */
  finishedAt: string | null;
  /** Hours as typed, converted to minutes on save. */
  hours: string;
  notes: string;
}

function draftOf(page: GamePage | null | undefined): Draft {
  const entry = page?.entry ?? null;
  return {
    startedAt: entry?.startedAt ?? null,
    finishedAt: entry?.finishedAt ?? null,
    hours: hoursFieldValue(entry?.playtimeMinutes),
    notes: entry?.notes ?? '',
  };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A stored date as a local `Date`, for the picker.
 *
 * The same care `format.ts` takes: `new Date('2026-09-24')` is UTC midnight,
 * which is the evening of the 23rd in New York, and a picker that opens on the
 * day before the one on screen is worse than no picker.
 */
function dateOf(value: string | null): Date | null {
  if (!value) return null;

  const parts = DATE_ONLY.exec(value);
  if (parts) {
    const [, year, month, day] = parts;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function DateField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string | null;
  onChange: (date: Date) => void;
  onClear?: () => void;
}) {
  const t = useT();
  const theme = useTheme();
  const date = dateOf(value);

  return (
    <View style={[styles.row, { paddingVertical: theme.space[2], gap: theme.space[3] }]}>
      <Text size={15} color="text/secondary">
        {label}
      </Text>

      {date ? (
        <View style={[styles.row, { gap: theme.space[3] }]}>
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            // Nobody started or finished a game tomorrow.
            maximumDate={new Date()}
            accessibilityLabel={label}
            onChange={(_event: DateTimePickerEvent, picked?: Date) => {
              if (picked) onChange(picked);
            }}
          />
          {onClear ? (
            <TextButton label={t('browse.game.detailsSheet.clear')} size={14} color="text/secondary" onPress={onClear} />
          ) : null}
        </View>
      ) : (
        <TextButton label={t('browse.game.detailsSheet.add')} size={15} onPress={() => onChange(new Date())} />
      )}
    </View>
  );
}

export function DetailsSheet({ id }: { id: string }) {
  const t = useT();
  const theme = useTheme();
  const query = useGamePage(id);
  const { save, pending, dismiss } = useSheetSave(id);

  const page = query.data ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);

  // Seeded once, when the page arrives. After that the sheet owns its state:
  // a background refetch must not overwrite what is being typed.
  useEffect(() => {
    if (draft === null && query.data !== undefined) setDraft(draftOf(query.data));
  }, [draft, query.data]);

  const patch = (change: Partial<Draft>) =>
    setDraft((current) => (current === null ? current : { ...current, ...change }));

  if (query.isError) {
    return (
      <SheetFrame
        title={t('browse.game.detailsSheet.title')}
        onCancel={dismiss}
        onSave={dismiss}
        saveLabel={t('browse.game.done')}>
        <ErrorLine message={t('browse.game.loadError')} onRetry={() => void query.refetch()} />
      </SheetFrame>
    );
  }

  if (!draft) {
    return (
      <SheetFrame
        title={t('browse.game.detailsSheet.title')}
        onCancel={dismiss}
        onSave={dismiss}
        saveLabel={t('browse.game.done')}
        saveDisabled>
        <Text size={15} color="text/secondary">
          {t('browse.game.detailsSheet.loading')}
        </Text>
      </SheetFrame>
    );
  }

  const original = draftOf(page);
  // Finished appears for a game that is already played, which is the only case
  // `markFinished` is a correction rather than a state change.
  const played = page?.entry?.status === 'played' || original.finishedAt !== null;

  const onSave = () => {
    const tasks: (() => Promise<unknown>)[] = [];

    if (draft.startedAt !== original.startedAt) {
      tasks.push(() => setStartedAt(supabase, id, draft.startedAt));
    }
    if (draft.finishedAt !== original.finishedAt && draft.finishedAt !== null) {
      const finishedAt = draft.finishedAt;
      tasks.push(() => markFinished(supabase, id, { finishedAt }));
    }
    if (draft.hours !== original.hours) {
      tasks.push(() => logPlaytime(supabase, id, minutesFromField(draft.hours), 'manual'));
    }
    if (draft.notes.trim() !== original.notes.trim()) {
      tasks.push(() => setNotes(supabase, id, draft.notes));
    }

    save(tasks);
  };

  return (
    <SheetFrame
      title={t('browse.game.detailsSheet.title')}
      onCancel={dismiss}
      onSave={onSave}
      saveLabel={t('common.save')}
      saveDisabled={pending}>
      <View>
        <DateField
          label={t('browse.game.detailsSheet.started')}
          value={draft.startedAt}
          onChange={(date) => patch({ startedAt: date.toISOString() })}
          onClear={() => patch({ startedAt: null })}
        />
        {played ? (
          <DateField
            label={t('browse.game.detailsSheet.finished')}
            value={draft.finishedAt}
            onChange={(date) => patch({ finishedAt: todayLocal(date) })}
          />
        ) : null}
      </View>

      <View style={{ gap: theme.space[2] }}>
        <FieldLabel>{t('browse.game.detailsSheet.hoursPlayed')}</FieldLabel>
        <TextInput
          value={draft.hours}
          onChangeText={(hours) => patch({ hours })}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0"
          placeholderTextColor={theme.colors['text/secondary']}
          accessibilityLabel={t('browse.game.detailsSheet.hoursPlayed')}
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
      </View>

      <View style={{ gap: theme.space[2] }}>
        <FieldLabel>{t('browse.game.detailsSheet.notes')}</FieldLabel>
        <TextInput
          value={draft.notes}
          onChangeText={(notes) => patch({ notes })}
          multiline
          placeholder={t('browse.game.detailsSheet.notesPlaceholder')}
          placeholderTextColor={theme.colors['text/secondary']}
          accessibilityLabel={t('browse.game.detailsSheet.notes')}
          style={[
            styles.input,
            styles.notes,
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
      </View>
    </SheetFrame>
  );
}

export function DetailsSheetRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return <DetailsSheet id={id ?? ''} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: { fontSize: 17 },
  notes: { minHeight: 96, textAlignVertical: 'top' },
});
