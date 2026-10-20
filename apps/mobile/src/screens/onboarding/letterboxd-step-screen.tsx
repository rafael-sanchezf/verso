/**
 * The Letterboxd door (movies-build.md, PR 6, item 5; frame 288:25, "fine as
 * drawn"): the movies analog of Link Steam, at the end of the movies path,
 * offered once to everyone who picked movies. An import never ranks (rule
 * 35), so it comes after the deck has done the ranking.
 *
 * "Import from Letterboxd" ends the path (Home in movies, flow.ts) and opens
 * the import #99 shipped under Settings → Data (`/import/letterboxd`) over
 * Home, so its own back and Done come home. "Not now" ends the path. The two
 * buttons are the same size, one filled and one surface, as the copy rules
 * ask of an import screen. No header and no `x`.
 */

import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { Button, Icon, Text, useTheme } from '@/ui';

import { LETTERBOXD_IMPORT_HREF } from './session/routes';
import { useFinishPath } from './use-flow';

export function LetterboxdStepScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const finishPath = useFinishPath();

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: theme.colors['bg/canvas'] }]}
      contentContainerStyle={[
        styles.centre,
        {
          paddingTop: insets.top + theme.space[4],
          paddingBottom: insets.bottom + theme.space[4],
          paddingHorizontal: theme.space[4],
        },
      ]}>
      <View style={[styles.column, { gap: 14 }]}>
        {/* The Letterboxd logo's slot, as drawn: the repo has no Letterboxd mark. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.mark, { backgroundColor: theme.colors['bg/placeholder'], borderRadius: theme.radius.md }]}
        />
        <Text size={28} weight={700} align="center" accessibilityRole="header">
          {t('onboarding.letterboxd.title')}
        </Text>
        <Text size={15} color="text/secondary" align="center" layout={styles.body}>
          {t('onboarding.letterboxd.body')}
        </Text>

        <View style={[styles.lines, { gap: 6 }]}>
          <Line icon="file-text">{t('onboarding.letterboxd.weRead')}</Line>
          <Line icon="undo-2">{t('onboarding.letterboxd.undo')}</Line>
        </View>

        <View style={{ gap: theme.space[3], alignSelf: 'stretch', paddingTop: theme.space[2] }}>
          <Button label={t('onboarding.letterboxd.import')} onPress={() => finishPath('movie', LETTERBOXD_IMPORT_HREF)} />
          <Button label={t('onboarding.letterboxd.notNow')} variant="secondary" onPress={() => finishPath('movie')} />
        </View>
      </View>
    </ScrollView>
  );
}

function Line({ icon, children }: { icon: 'file-text' | 'undo-2'; children: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.line, { gap: theme.space[2] }]}>
      <View style={styles.lineIcon}>
        <Icon name={icon} size={14} color="text/secondary" />
      </View>
      <Text size={13} color="text/secondary" layout={styles.fill}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  column: { width: '100%', maxWidth: 370, alignItems: 'center' },
  mark: { width: 56, height: 56 },
  body: { maxWidth: 330 },
  lines: { width: '100%', maxWidth: 330 },
  line: { flexDirection: 'row', alignItems: 'flex-start' },
  lineIcon: { paddingTop: 2 },
});
