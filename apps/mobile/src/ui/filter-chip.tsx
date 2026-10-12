/**
 * A chip with a caret, and the sheet of values behind it.
 *
 * `Chip` takes a leading icon only and the frames draw the caret after the word
 * ("Genre ▾"), so `FilterChip` is its own control. `MenuChip` is the chip plus
 * the list: `SegmentedControl` is the wrong shape for values that only exist at
 * runtime.
 *
 * The list was the native iOS action sheet until 2026-09-23 (rule 7 asks for
 * the native control). It is now the app's own `Sheet`, because the Ranking
 * filter's values carry icons, a genre's Lucide icon and a platform's brand
 * mark (docs/private/phone-feedback.md, entries 3 and 5), and a native menu
 * can draw neither: an action sheet takes strings, and `@expo/ui`'s menus and
 * `Link.Menu` take SF Symbols, which is why Home's long-press menu still draws
 * system icons. Recorded in docs/design/specs/ranking.md (batch 1).
 *
 * Both were built inside `screens/ranking/` on the Ranking screen's branch,
 * which is where they had to go while the screens were built in parallel, one
 * branch each; promoted here in Phase 3 because a filter chip is not a Ranking
 * idea — the Backlog's "Sort ▾" is the same shape, and the next screen that
 * filters a list should not write a third one.
 *
 * The chip gets the web's hover dim and focus ring (`interaction.ts`); the
 * sheet's rows are left as they are until the web round decides whether this
 * list becomes a `Menu` at wide.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Icon } from './icon';
import { interactionStyle, type InteractionState } from './interaction';
import { Sheet } from './sheet';
import { Text } from './text';
import { useTheme, type ColorToken } from './theme';

export interface FilterChipProps {
  label: string;
  /** Filled while it carries a value, surface while it says its own name. */
  active: boolean;
  onPress: () => void;
  /**
   * An icon before the label: the chosen genre's icon, the chosen platform's
   * mark. A function of the color because a filled chip inverts its label, and
   * the icon has to invert with it.
   */
  icon?: (color: ColorToken) => ReactNode;
}

/** `Chip` with the caret after the label, and filled once it carries a value. */
export function FilterChip({ label, active, onPress, icon }: FilterChipProps) {
  const theme = useTheme();
  const labelColor: ColorToken = active ? 'bg/canvas' : 'text/primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens a list to choose from"
      onPress={onPress}
      style={(state: InteractionState) => [
        styles.chip,
        {
          backgroundColor: theme.colors[active ? 'text/primary' : 'bg/surface'],
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space[3],
          paddingVertical: 6,
          gap: 6,
        },
        interactionStyle(state, theme),
      ]}>
      {icon ? icon(labelColor) : null}
      <Text size={14} weight={500} color={labelColor} numberOfLines={1} layout={styles.chipLabel}>
        {label}
      </Text>
      <Icon name="chevron-down" size={14} color={labelColor} />
    </Pressable>
  );
}

/** "Any" is how the list says "no filter"; it is not a value any row can have. */
const ANY = 'Any';

export interface MenuChipProps {
  /** The word on the chip while nothing is chosen, and the sheet's title. */
  name: string;
  value: string | null;
  options: readonly string[];
  onChange: (value: string | null) => void;
  /** How each option reads on screen. The value passed back is always the raw one. */
  formatOption?: (option: string) => string;
  /**
   * An icon before an option's label, drawn at 16: on its row in the sheet, and
   * on the chip while it is the value. `color` is the label's.
   */
  renderIcon?: (option: string, color: ColorToken) => ReactNode;
}

/**
 * A filter chip and the sheet behind it.
 *
 * The sheet is a title, then "Any", then one row per value: its icon when there
 * is one, its label, and a check on the value in force. A tap chooses and
 * closes, the way a menu does; the backdrop closes without choosing.
 */
export function MenuChip({ name, value, options, onChange, formatOption, renderIcon }: MenuChipProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const choices = [ANY, ...options];

  // `Any` is the list's own word and never goes through the caller's formatter.
  const label = (choice: string) =>
    choice === ANY || !formatOption ? choice : formatOption(choice);

  const choose = (choice: string) => {
    setOpen(false);
    onChange(choice === ANY ? null : choice);
  };

  const current = value ?? ANY;

  return (
    <>
      <FilterChip
        label={value === null ? name : label(value)}
        active={value !== null}
        onPress={() => setOpen(true)}
        icon={value !== null && renderIcon ? (color) => renderIcon(value, color) : undefined}
      />
      <Sheet visible={open} onDismiss={() => setOpen(false)}>
        <View style={{ gap: theme.space[2], paddingBottom: theme.space[2] }}>
          <Text style="title-3" align="center">
            {name}
          </Text>
          {/*
            Capped rather than sized to the list: a ranking can hold every one
            of the 22 genres, and a sheet taller than the screen would push its
            own title off the top.
          */}
          <ScrollView style={{ maxHeight: height * 0.6 }}>
            {choices.map((choice, index) => (
              <MenuRow
                key={choice}
                label={label(choice)}
                selected={choice === current}
                first={index === 0}
                // "Any" has no icon but keeps the slot, so every label starts
                // at the same x.
                iconSlot={renderIcon !== undefined}
                icon={renderIcon && choice !== ANY ? renderIcon(choice, 'text/primary') : null}
                onPress={() => choose(choice)}
              />
            ))}
          </ScrollView>
        </View>
      </Sheet>
    </>
  );
}

/** One value in the sheet. */
function MenuRow({
  label,
  selected,
  first,
  iconSlot,
  icon,
  onPress,
}: {
  label: string;
  selected: boolean;
  /** The first row has no separator above it. */
  first: boolean;
  /** Whether this list draws icons at all; a row without one keeps the space. */
  iconSlot: boolean;
  icon: ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: theme.space[3],
          paddingVertical: theme.space[3],
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: theme.colors['border/separator'],
        },
        pressed && styles.pressed,
      ]}>
      {iconSlot ? <View style={styles.iconSlot}>{icon}</View> : null}
      <Text size={17} numberOfLines={1} layout={styles.rowLabel}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={16} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
  },
  // A long genre ("Turn-based strategy game") ellipsizes rather than pushing
  // the caret out of the chip.
  chipLabel: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // The iOS minimum for a tap target.
    minHeight: 44,
  },
  // 16 is the icons' size. Nintendo's wordmark is wider than it is tall and
  // takes the room it needs, so those rows' labels start a little later.
  iconSlot: { minWidth: 16, alignItems: 'center' },
  rowLabel: { flex: 1 },
  pressed: { opacity: 0.7 },
});
