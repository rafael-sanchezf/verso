/**
 * Every primitive, in both schemes, on one screen.
 *
 * Storybook would be the usual answer and is not worth its weight here: it is a
 * second bundler config, a second entry point and a native dependency, to show
 * a dozen components that fit on one scroll. This route is the whole of it —
 * `verso://preview` on a device, or the link at the bottom of Settings — and it
 * is outside the session gate so it can be opened without an account.
 *
 * It draws light and dark side by side rather than following the device,
 * because half the point is catching the primitive that only reads in one of
 * them. It is also where `react-native-sortables` is proved on this SDK: the
 * list at the bottom is draggable, and if it ever stops being draggable that is
 * the signal to swap the library before Ranking and Next depend on it.
 *
 * The web primitives of W1 have their sections near the end: the dialog and
 * its three button kinds, `select`, the dropdown `Menu`, `DateField`, the `/`
 * shortcut, and the hover and focus states. They are meant to be looked at in
 * a browser (`pnpm web`, then `/preview`), with a mouse and with Tab; on the
 * phone the alerts are the native ones and the menu is its trigger alone.
 */

import { igdbCoverUrl } from '@verso/api';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Sortable from 'react-native-sortables';

import {
  Button,
  Chip,
  Cover,
  coverHeight,
  DateField,
  Dialog,
  EmptyState,
  EmptyStateCard,
  ErrorLine,
  FieldLabel,
  FilterChip,
  GenreIcon,
  ICON_NAMES,
  Icon,
  ListRow,
  MediumChip,
  Menu,
  MenuChip,
  PlatformIcon,
  ScoreBadge,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  SheetFrame,
  Skeleton,
  TABS,
  TabBar,
  Text,
  TextButton,
  ThemeScope,
  TierChip,
  TIER_ORDER,
  useTheme,
  type ColorScheme,
} from '@/ui';
import { alert, select } from '@/lib/dialog';
import { GENRE_ICONS, genreLabel, platformShortName } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useLayout } from '@/lib/use-layout';
import { useShortcut } from '@/lib/use-shortcut';
import { dateOnly } from '@/ui/date-field-value';
import { COLOR_TOKENS, FONT_STYLES, fontFamilyFor } from '@/ui/theme';
import { GoogleMark, VersoMark } from '@/ui/marks';

/** A real cover, so the fallback walk is exercised against the live CDN. */
const PREVIEW_COVERS = [igdbCoverUrl('co4jni', 't_cover_big')];

export default function PreviewScreen() {
  useDocumentTitle('Primitives');
  return (
    <ScrollView contentContainerStyle={styles.page}>
      {(['light', 'dark'] as const).map((scheme) => (
        <ThemeScope key={scheme} scheme={scheme}>
          <SchemePanel scheme={scheme} />
        </ThemeScope>
      ))}
    </ScrollView>
  );
}

function SchemePanel({ scheme }: { scheme: ColorScheme }) {
  const theme = useTheme();

  return (
    <View style={{ backgroundColor: theme.colors['bg/canvas'], paddingVertical: theme.space[6] }}>
      <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[4] }}>
        <Text style="title-2">{scheme === 'dark' ? 'Dark' : 'Light'}</Text>
      </View>
      <Gallery scheme={scheme} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[6], gap: theme.space[3] }}>
      <Text size={13} weight={600} color="text/secondary">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.row, { gap: theme.space[2] }]}>{children}</View>;
}

function Gallery({ scheme }: { scheme: ColorScheme }) {
  const theme = useTheme();
  const [segment, setSegment] = useState<'backlog' | 'upcoming'>('backlog');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);

  return (
    <View>
      <Section title="Type ramp">
        {FONT_STYLES.map((style) => (
          <Text key={style} style={style} numberOfLines={1}>
            {style} · {theme.font[style].fontSize}/{theme.font[style].fontWeight}
          </Text>
        ))}
        <Text size={14} weight={500} color="text/secondary">
          off-ramp: 14 medium secondary
        </Text>
      </Section>

      <Section title="Colors">
        <View style={[styles.wrap, { gap: theme.space[2] }]}>
          {COLOR_TOKENS.map((token) => (
            <View key={token} style={{ gap: 2, width: 72 }}>
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: theme.colors[token],
                    borderRadius: theme.radius.sm,
                    // Two tokens are the canvas itself in one scheme or the
                    // other; without a rule they would be invisible here.
                    borderWidth: 1,
                    borderColor: theme.colors['border/separator'],
                  },
                ]}
              />
              <Text size={10} color="text/secondary" numberOfLines={1}>
                {token}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Buttons">
        <Button label="Primary, regular" />
        <Button label="Secondary, compact" variant="secondary" size="compact" />
        <Button label="Contrast, regular" variant="contrast" />
        <Row>
          <Button label="Too close to call" variant="secondary" size="small" style={styles.grow} />
          <Button label="Can't compare these" variant="secondary" size="small" style={styles.grow} />
        </Row>
        <Button label="Ranked · 8.4" disabled />
        <Button label="Continue with Google" variant="secondary" leading={<GoogleMark size={18} />} />
        <Row>
          <TextButton label="Change" />
          <TextButton label="See all" color="text/secondary" />
        </Row>
      </Section>

      <Section title="Chips">
        <Row>
          <Chip label="Surface" />
          <Chip label="Filled" variant="filled" />
          <Chip label="Outlined" variant="outlined" />
          <Chip label="PC" variant="played" />
          <Chip label="Sort" icon="chevron-down" />
        </Row>
        <Row>
          <MediumChip />
          {TIER_ORDER.map((tier) => (
            <TierChip key={tier} tier={tier} />
          ))}
        </Row>
      </Section>

      <Section title="Score badges">
        <Row>
          {[9.6, 8.4, 8.2, 8.0, 6.1, 5.4, 3.2, 1.1].map((score) => (
            <ScoreBadge key={score} score={score} />
          ))}
        </Row>
        <Row>
          {[9.6, 8.4, 6.1, 1.1].map((score) => (
            <ScoreBadge key={score} score={score} size="small" />
          ))}
        </Row>
      </Section>

      <Section title="Icons">
        <View style={[styles.wrap, { gap: theme.space[4] }]}>
          {ICON_NAMES.map((name) => (
            <Icon key={name} name={name} size={24} color="text/secondary" />
          ))}
        </View>
        <Row>
          <VersoMark size={28} />
          <GoogleMark size={28} />
        </Row>
      </Section>

      <Section title="Covers">
        <Row>
          <Cover width={96} radius={8} candidates={PREVIEW_COVERS} />
          <Cover width={44} radius={6} candidates={PREVIEW_COVERS} />
          <Cover width={44} radius={6} candidates={['https://example.invalid/missing.jpg']} />
          <Cover width={44} radius={6} candidates={[]} />
        </Row>
        <Text size={12} color="text/secondary">
          Third walks past a dead URL to the placeholder; fourth has no candidates.
        </Text>
      </Section>

      <Section title="List rows">
        <ListRow
          coverWidth={44}
          candidates={PREVIEW_COVERS}
          title="Hollow Knight: Silksong"
          subtitle="2025 · Switch 2, PC"
          trailing={<ScoreBadge score={9.2} />}
        />
        <ListRow
          coverWidth={44}
          candidates={PREVIEW_COVERS}
          title="Hades"
          subtitle="PC · Steam Deck · ~22 h"
          detail="14 h played"
          trailing={<Icon name="grip-vertical" size={18} color="text/secondary" />}
        />
        <ListRow
          coverWidth={40}
          candidates={[]}
          title="A game with no cover at all, whose title runs on"
          subtitle="2019"
          trailing={<Icon name="chevron-right" size={16} color="text/secondary" />}
        />
      </Section>

      <Section title="Headers and segments">
        <ScreenHeader title="Ranking" right={<MediumChip />} />
        <ScreenHeader title="Profile" right={<Icon name="settings" size={24} />} />
        <SegmentedControl
          segments={[
            { value: 'backlog', label: 'Backlog', icon: 'layers' },
            { value: 'upcoming', label: 'Upcoming', icon: 'calendar' },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </Section>

      <Section title="Empty states">
        <EmptyStateCard>
          <EmptyState
            icon="play"
            title="Nothing playing"
            body="Start something from Next and it shows up here."
            action={{ label: 'Go to Next', onPress: () => {} }}
            secondaryAction={{ label: 'Search a new game', onPress: () => {} }}
          />
        </EmptyStateCard>
        <EmptyState
          icon="search"
          title="No games match"
          body="Try a shorter title, or check the spelling."
        />
      </Section>

      <Section title="Sheet">
        <Button label="Open the in-screen sheet" variant="secondary" onPress={() => setSheetOpen(true)} />
        <Sheet visible={sheetOpen} onDismiss={() => setSheetOpen(false)}>
          <View style={{ gap: theme.space[3], paddingBottom: theme.space[4] }}>
            <Text size={17} weight={600}>
              Add to…
            </Text>
            <Button label="Close" variant="secondary" onPress={() => setSheetOpen(false)} />
          </View>
        </Sheet>
      </Section>

      {/*
        The two states specs/README.md defines for every screen and the frames
        never drew. Five copies of each before Phase 3 promoted one of each into
        `src/ui`; here so the next screen finds them instead of writing a sixth.
      */}
      <Section title="Loading and error">
        <Skeleton height={20} width="70%" />
        <Row>
          <Skeleton width={44} height={coverHeight(44)} radius={6} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={13} width="62%" radius={4} />
            <Skeleton height={11} width="32%" radius={4} />
          </View>
        </Row>
        <Skeleton height={46} radius={theme.radius.md} />
        <ErrorLine message="Couldn't load your backlog." onRetry={() => {}} />
        <ErrorLine message="Couldn't load your ranking." align="center" onRetry={() => {}} />
        <ErrorLine message="Nothing to retry into." />
      </Section>

      <Section title="Filters">
        <Row>
          <FilterChip label="Genre" active={false} onPress={() => {}} />
          <FilterChip label="RPG" active onPress={() => {}} />
        </Row>
        <Row>
          <MenuChip
            name="Genre"
            value={genre}
            // Every genre the app names, so the whole icon set can be seen in
            // the sheet it is drawn in.
            options={Object.keys(GENRE_ICONS)}
            formatOption={(option) => genreLabel(option) ?? option}
            renderIcon={(option, color) => <GenreIcon genre={option} color={color} />}
            onChange={setGenre}
          />
          <MenuChip
            name="Platform"
            value={platform}
            options={['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch 2', 'Nintendo 3DS', 'Dreamcast']}
            formatOption={platformShortName}
            renderIcon={(option, color) => <PlatformIcon name={option} color={color} markOnly />}
            onChange={setPlatform}
          />
        </Row>
      </Section>

      {/*
        The chrome every route-level form sheet draws. Shown in a box rather
        than in a real sheet, because this route is a card and not a form sheet
        — the metrics are the same either way.
      */}
      <Section title="Form sheet chrome">
        <View
          style={{
            borderRadius: theme.radius.xl,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors['border/separator'],
          }}>
          <SheetFrame title="Hours played" onCancel={() => {}} onSave={() => {}} scroll={false}>
            <FieldLabel>Hours</FieldLabel>
            <Text size={15} color="text/secondary">
              The fields go here.
            </Text>
          </SheetFrame>
        </View>
      </Section>

      <WebPrimitives scheme={scheme} />

      <Section title="Drag to reorder">
        <SortableProof />
      </Section>
    </View>
  );
}

/** A caption under a demo, in the gallery's one voice. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text size={12} color="text/secondary">
      {children}
    </Text>
  );
}

/**
 * The web primitives of W1, each with the cases a screen will use.
 *
 * `alert` and `select` go through the root layout's `DialogHost`, which draws
 * in the device's scheme whichever panel opened it; the controlled `Dialog`
 * below is rendered by the panel itself, so it shows in that panel's scheme.
 */
function WebPrimitives({ scheme }: { scheme: ColorScheme }) {
  const theme = useTheme();
  const layout = useLayout();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<string | null>('2026-09-24');
  const [finished, setFinished] = useState<string | null>(null);
  const today = dateOnly(new Date());

  const menuItems = [
    { label: 'Change status…', icon: 'layers' as const, onPress: () => setPicked('Change status…') },
    { label: 'Log hours', icon: 'clock' as const, onPress: () => setPicked('Log hours') },
    { label: 'Share', icon: 'share' as const, onPress: () => setPicked('Share') },
    { label: 'Remove from library', icon: 'x' as const, destructive: true, onPress: () => setPicked('Remove from library') },
  ];

  return (
    <>
      <Section title="Dialog">
        <Note>
          {`Layout now: ${layout.width}, bar ${layout.bar}. Centered at 1024 and wider, anchored to the bottom below that. Escape cancels, Enter presses the default button, a click on the dim cancels.`}
        </Note>
        <Button
          label="One button: alert(title, message)"
          variant="secondary"
          size="small"
          onPress={() => alert('Export failed', 'Check your connection and try again.')}
        />
        <Button
          label="Cancel and destructive"
          variant="secondary"
          size="small"
          onPress={() =>
            alert('Delete your account?', 'Your rankings, backlog, and profile are removed. This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => setPicked('Delete') },
            ])
          }
        />
        <Button
          label="Three buttons: default, cancel, default"
          variant="secondary"
          size="small"
          onPress={() =>
            alert('Import from a file', 'This adds or overwrites entries in your library.', [
              { text: 'Later', onPress: () => setPicked('Later') },
              { text: 'Cancel', style: 'cancel' },
              { text: 'Import', onPress: () => setPicked('Import') },
            ])
          }
        />
        <Button
          label="select: an action sheet"
          variant="secondary"
          size="small"
          onPress={() => select({ title: 'Hades', choices: menuItems })}
        />
        <Button
          label="The Dialog component, in this panel's scheme"
          variant="secondary"
          size="small"
          onPress={() => setDialogOpen(true)}
        />
        <Dialog
          visible={dialogOpen}
          title="Already ranked"
          message="This game is already in your ranking."
          buttons={[
            { text: 'Cancel', style: 'cancel' },
            { text: 'Rank again', onPress: () => setPicked('Rank again') },
          ]}
          onClose={() => setDialogOpen(false)}
        />
        <Note>{`Last choice: ${picked ?? 'none yet'}`}</Note>
      </Section>

      <Section title="Menu">
        <Row>
          <Menu items={menuItems} accessibilityLabel="More" align="start">
            <View style={[styles.menuTrigger, { padding: theme.space[2], borderRadius: theme.radius.sm }]}>
              <Icon name="ellipsis" size={22} />
            </View>
          </Menu>
          <Menu
            items={[
              { label: 'Your order', onPress: () => setPicked('Sort: your order') },
              { label: 'Release date', onPress: () => setPicked('Sort: release date') },
              { label: 'Recently added', onPress: () => setPicked('Sort: recently added') },
            ]}
            accessibilityLabel="Sort"
            align="end">
            <Chip label="Sort" icon="chevron-down" />
          </Menu>
        </Row>
        <Note>
          Web only. Arrow keys move, Enter picks, Escape closes, a click outside closes. On the phone the trigger renders alone.
        </Note>
      </Section>

      <Section title="Date field">
        <DateField label="Purchased" value={purchased} max={today} clearable onChange={setPurchased} />
        <DateField label="Finished" value={finished} max={today} onChange={setFinished} />
        <Note>{`Purchased: ${purchased ?? 'null'} · Finished: ${finished ?? 'null'}`}</Note>
      </Section>

      <Section title="Keyboard shortcut">
        <ShortcutProof active={scheme === 'light'} />
      </Section>

      <Section title="Hover and focus">
        <Note>
          Web only: hover with a mouse for the dim, Tab for the focus ring (a click draws no ring). Nothing here changes on the phone.
        </Note>
        <Row>
          <Button label="Button" size="small" fullWidth={false} onPress={() => {}} />
          <Button label="Secondary" variant="secondary" size="small" fullWidth={false} onPress={() => {}} />
          <Button label="Delete" variant="destructive" size="small" fullWidth={false} onPress={() => {}} />
          <TextButton label="Text button" onPress={() => {}} />
        </Row>
        <Row>
          <Chip label="Chip" onPress={() => {}} />
          <FilterChip label="Filter chip" active={false} onPress={() => {}} />
        </Row>
        <ListRow
          coverWidth={44}
          candidates={PREVIEW_COVERS}
          title="A row that opens something"
          subtitle="Pressed, so it hovers and focuses"
          onPress={() => {}}
          trailing={<Icon name="chevron-right" size={16} color="text/secondary" />}
        />
        <TabBarProof />
      </Section>
    </>
  );
}

/**
 * `/` focuses the field, as it will focus Search. Active in the light panel
 * only: both panels mount this, and one key should not focus two fields.
 */
function ShortcutProof({ active }: { active: boolean }) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [count, setCount] = useState(0);

  useShortcut(
    '/',
    () => {
      setCount((current) => current + 1);
      inputRef.current?.focus();
    },
    active,
  );

  return (
    <>
      <TextInput
        ref={inputRef}
        placeholder={active ? 'Press / anywhere to focus this' : 'The light panel owns the shortcut'}
        placeholderTextColor={theme.colors['text/secondary']}
        style={{
          fontFamily: fontFamilyFor(400),
          fontSize: 16,
          color: theme.colors['text/primary'],
          backgroundColor: theme.colors['bg/surface'],
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2],
        }}
      />
      <Note>{`Typing / inside the field types it. Fired ${count} times. Web only.`}</Note>
    </>
  );
}

/**
 * The real tab bar, outside a navigator: a stand-in for the navigation state
 * that knows only which tab is selected, so its hover and focus can be seen.
 */
function TabBarProof() {
  const [index, setIndex] = useState(0);
  const routes = TABS.map((tab) => ({ key: tab.name, name: tab.name }));

  const props = {
    state: { index, routes },
    descriptors: {},
    navigation: {
      emit: () => ({ defaultPrevented: false }),
      navigate: (name: string) => setIndex(Math.max(0, routes.findIndex((route) => route.name === name))),
    },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as BottomTabBarProps;

  return <TabBar {...props} />;
}

/**
 * Proof that `react-native-sortables` drags on this SDK.
 *
 * Ranking and Next both depend on it (rule 11: order belongs to the user), and
 * the library's own README warns about a stuck item on iOS with the New
 * Architecture and gesture-handler 2.x. Long-press a row and move it; if it
 * does not lift, that warning has arrived and the library needs replacing
 * before those two screens are built on it.
 */
function SortableProof() {
  const theme = useTheme();
  const [order, setOrder] = useState(['Silksong', 'Hades', 'Celeste', 'Outer Wilds']);

  return (
    <Sortable.Grid
      columns={1}
      data={order}
      rowGap={theme.space[2]}
      keyExtractor={(item) => item}
      onDragEnd={({ data }) => setOrder(data)}
      renderItem={({ item, index }) => (
        <View
          style={[
            styles.dragRow,
            {
              backgroundColor: theme.colors['bg/surface'],
              borderRadius: theme.radius.md,
              padding: theme.space[3],
              gap: theme.space[3],
            },
          ]}>
          <Text size={17} weight={700} color="text/secondary">
            {index + 1}
          </Text>
          <Text size={16} weight={500} layout={styles.grow}>
            {item}
          </Text>
          <Icon name="grip-vertical" size={18} color="text/secondary" />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  grow: { flex: 1 },
  swatch: { width: 72, height: 28 },
  dragRow: { flexDirection: 'row', alignItems: 'center' },
  menuTrigger: { alignItems: 'center', justifyContent: 'center' },
});
