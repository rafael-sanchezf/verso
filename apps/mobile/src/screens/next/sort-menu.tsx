/**
 * The Backlog sub row's "Sort ▾": a native menu.
 *
 * `docs/design/specs/next.md` calls for "a native menu"; there is no
 * dropdown-menu primitive in `@/ui` yet, so this uses `@expo/ui`'s
 * `MenuView` (already a dependency of `apps/mobile`), a cross-platform
 * drop-in for `@react-native-menu/menu` that opens the system menu on iOS
 * and a Material dropdown on Android from the same `actions` list.
 *
 * Not on web, where `MenuView` renders its trigger and fires nothing (the
 * library says so itself in a console warning). Backlog sorting is therefore
 * unreachable in a browser: "Sort" is drawn and does nothing. That is a known
 * gap rather than a bug to work around here -- V0 ships to phones, and the
 * fix is a real dropdown primitive in `@/ui`, not a branch in this file.
 */

import { MenuView, type NativeActionEvent } from '@expo/ui/community/menu';

import { useT } from '@/lib/i18n';
import { Text } from '@/ui';

import { BACKLOG_SORT_MENU, type BacklogSort } from './backlog-sort';

export interface SortMenuProps {
  value: BacklogSort;
  onChange: (sort: BacklogSort) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  const t = useT();
  const handlePressAction = ({ nativeEvent: { event } }: NativeActionEvent) => {
    onChange(event as BacklogSort);
  };

  return (
    <MenuView
      onPressAction={handlePressAction}
      actions={BACKLOG_SORT_MENU.map(({ value: sortValue, title }) => ({
        id: sortValue,
        title: t(title),
        state: sortValue === value ? 'on' : 'off',
      }))}>
      <Text size={13} weight={500}>
        {t('lists.next.sort')}
      </Text>
    </MenuView>
  );
}
