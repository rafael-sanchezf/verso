/**
 * The one colored control on Home: the question, behind one button
 * (decision 28), on both media.
 *
 * The site's numbers (movie-screens.tsx, `MoviesHomePhone`): 54 tall, the
 * brand fill, radius 14, 18 side padding, Lucide's sparkles at 22 then the
 * question in 17 semibold white, gap 12, inside Home's 16 side margins. The
 * icon is the sparkles, never the mark (decision 31, amended).
 */

import { Pressable, StyleSheet } from 'react-native';

import { Icon, Text, useTheme } from '@/ui';

export function AskButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          marginHorizontal: theme.space[4],
          backgroundColor: theme.colors['brand/primary'],
          borderRadius: theme.radius.md + 2,
        },
        pressed && styles.pressed,
      ]}>
      <Icon name="sparkles" size={22} color="brand/on-primary" strokeWidth={2.25} />
      <Text style="headline" color="brand/on-primary" numberOfLines={1} layout={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
    // The switcher row's 12 under it plus this is the site's 14.
    marginTop: 2,
  },
  label: { flexShrink: 1 },
  pressed: { opacity: 0.85 },
});
