/**
 * Bottom-sheet chrome for a sheet that is not a route.
 *
 * Most sheets in this app are routes and get the native iOS form sheet the root
 * layout registers — that is the convention (rule 7) and it brings the drag, the
 * detents and the dismiss for free. This is for the ones that are not: a sheet
 * that appears inside a screen's own state, over that screen, like the add-to
 * sheet before it became a route or the long-press menu's fallback.
 *
 * It draws only the surface. What goes in it, and when it is open, is the
 * caller's.
 */

import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './theme';

/**
 * The dim behind a sheet or a dialog: 35% black, as the frames draw it, enough
 * to push the screen behind into the background without hiding which screen it
 * is. Black rather than a token on purpose: it is a shade, not a color, and it
 * is the same in light and dark. `Dialog` uses it too.
 */
export const DIM_COLOR = 'rgba(0, 0, 0, 0.35)';

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  /** Off by default: a sheet the user must answer (a confirm) sets this true. */
  dismissOnBackdropPress?: boolean;
}

export function Sheet({ visible, onDismiss, children, dismissOnBackdropPress = true }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.fill}>
        <Pressable
          accessibilityLabel="Close"
          style={styles.dim}
          onPress={dismissOnBackdropPress ? onDismiss : undefined}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors['bg/canvas'],
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingTop: theme.space[3],
              paddingHorizontal: theme.space[4],
              // The home indicator sits over the last row otherwise.
              paddingBottom: insets.bottom + theme.space[2],
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: theme.colors['border/separator'] }]} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  dim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: DIM_COLOR,
  },
  sheet: { width: '100%' },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
});
