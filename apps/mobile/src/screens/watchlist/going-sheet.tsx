/**
 * "Going? ›" and "Change": the day you are going to see a film in theaters
 * (movies-brief.md, "The states of a film": Going is a date, not a status).
 *
 * The platform's own date picker in a small sheet (rule 7; `DateField` is
 * the compact iOS picker, Android's dialog, the browser's date input), then
 * Save, which writes `setPlannedOn` and puts the film under GOING on the
 * Calendar with its date in the brand green. A planned day already set can be
 * taken back with "Not going". The database clears the day by itself when a
 * diary row lands on or after it, so "I watched this" never has to.
 *
 * Shared by the Calendar and the movie page's theatrical line.
 */

import { setPlannedOn } from '@verso/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { alert } from '@/lib/dialog';
import { useT } from '@/lib/i18n';
import { invalidateEntry } from '@/lib/invalidate';
import { supabase } from '@/lib/supabase';
import { Button, DateField, Sheet, Text, useTheme } from '@/ui';
import { dateOnly } from '@/ui/date-field-value';

export interface GoingTarget {
  mediaItemId: string;
  title: string;
  /** The day already planned, or null. */
  plannedOn: string | null;
  /** The day to start the picker on when none is planned: the opening day, or today. */
  suggested: string | null;
}

export function GoingSheet({ target, onDismiss }: { target: GoingTarget | null; onDismiss: () => void }) {
  const t = useT();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const today = dateOnly(new Date());
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const start = target.plannedOn ?? target.suggested;
    setDay(start !== null && start >= today ? start : today);
  }, [target, today]);

  // Going is a day still to come; a past one is a diary row, not a plan.
  const past = day !== null && day < today;

  const save = useMutation({
    mutationFn: (plannedOn: string | null) => setPlannedOn(supabase, target!.mediaItemId, plannedOn),
    onSuccess: () => {
      invalidateEntry(queryClient, target!.mediaItemId);
      onDismiss();
    },
    onError: () => alert(t('lists.going.couldNotSave'), t('lists.checkConnection')),
  });

  return (
    <Sheet visible={target !== null} onDismiss={onDismiss}>
      <View style={{ gap: theme.space[3], paddingTop: theme.space[3] }}>
        <View style={{ gap: 2 }}>
          <Text size={20} weight={600}>
            {t('lists.going.title')}
          </Text>
          <Text size={15} color="text/secondary" numberOfLines={1}>
            {target?.title ?? ''}
          </Text>
        </View>
        <DateField label={t('lists.going.day')} value={day} min={today} onChange={(next) => next !== null && setDay(next)} />
        {/* The picker stops at today; a browser's typed date can still be earlier. */}
        {past ? (
          <Text size={13} color="text/destructive">
            {t('lists.going.pickTodayOrAhead')}
          </Text>
        ) : null}
        <Button
          label={t('common.save')}
          disabled={day === null || past || save.isPending}
          onPress={() => day !== null && save.mutate(day)}
        />
        {target?.plannedOn ? (
          <Button
            label={t('lists.going.notGoing')}
            variant="secondary"
            disabled={save.isPending}
            onPress={() => save.mutate(null)}
          />
        ) : null}
      </View>
    </Sheet>
  );
}
