/**
 * The chrome a route-level form sheet draws: Cancel, a title, Save.
 *
 * The root layout registers those routes as native form sheets with no header,
 * so each one draws its own. This is the iOS convention for a modal that edits
 * something (rule 7): the destructive-free way out on the left, the commit on
 * the right, and nothing in between but the fields.
 *
 * Built on the game page's branch for its three sheets (hours, details,
 * platforms) and promoted here in Phase 3: it is the answer for every form
 * sheet the route map grows, not for three of them. Settings' Edit-profile
 * sheet is deliberately not this — it is an in-screen `Sheet` with a full-width
 * Save button rather than a route, which is a different control.
 *
 * `scroll` is off for a sheet whose detent is `fitToContents` (the hours
 * sheet): a `flex: 1` scroll view inside a sheet that sizes itself to its
 * content has no height to fill and collapses.
 */

import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextButton } from './button';
import { Text } from './text';
import { useTheme } from './theme';

export interface SheetFrameProps {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  /** A quiet destructive action under the fields, such as "Clear". */
  footer?: ReactNode;
  scroll?: boolean;
  children: ReactNode;
}

export function SheetFrame({
  title,
  onCancel,
  onSave,
  saveLabel = 'Save',
  saveDisabled = false,
  footer,
  scroll = true,
  children,
}: SheetFrameProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const body = (
    <View style={{ padding: theme.space[4], gap: theme.space[4] }}>
      {children}
      {footer}
    </View>
  );

  return (
    <KeyboardAvoidingView
      // Never flattened (phone feedback entry 11). When Fabric flattens this
      // view, the header's parts and the ScrollView become direct children of
      // the sheet's own container, and react-native-screens, which resizes a
      // form sheet's ScrollView by hand, finds more than "header + ScrollView"
      // there and leaves the ScrollView at y 0: the first row was drawn under
      // Cancel, the title and Save. Kept as one view, the sheet's container
      // holds no ScrollView of its own and Yoga's layout stands.
      collapsable={false}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        scroll ? styles.fill : undefined,
        { backgroundColor: theme.colors['bg/canvas'] },
      ]}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: theme.space[4],
            // Room for the native grabber the root layout turns on.
            paddingTop: theme.space[4],
            paddingBottom: theme.space[3],
          },
        ]}>
        <View style={styles.side}>
          <TextButton label="Cancel" size={17} weight={400} onPress={onCancel} />
        </View>
        <Text size={17} weight={600}>
          {title}
        </Text>
        <View style={[styles.side, styles.right]}>
          <TextButton label={saveLabel} size={17} weight={600} disabled={saveDisabled} onPress={onSave} />
        </View>
      </View>

      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom }}>
          {body}
        </ScrollView>
      ) : (
        <View style={{ paddingBottom: insets.bottom }}>{body}</View>
      )}
    </KeyboardAvoidingView>
  );
}

/** A label above a field or a control, in the sheets' one voice. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text size={13} weight={500} color="text/secondary">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: { flex: 1 },
  right: { alignItems: 'flex-end' },
});
