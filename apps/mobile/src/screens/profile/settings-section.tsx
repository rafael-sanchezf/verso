import { View } from 'react-native';

import { Text } from '@/ui';
import { useTheme } from '@/ui/theme';

import { Separator, SettingsRow, type SettingsRowSpec } from './settings-row';

export function SettingsSection({ title, rows }: { title: string; rows: readonly SettingsRowSpec[] }) {
  const theme = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text size={13} weight={600} color="text/secondary">
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.md,
          overflow: 'hidden',
        }}>
        {rows.map((row, index) => (
          <View key={row.key}>
            {index > 0 ? <Separator /> : null}
            <SettingsRow {...row} />
          </View>
        ))}
      </View>
    </View>
  );
}
