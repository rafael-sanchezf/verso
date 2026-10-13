/**
 * `/home/row` — a movies Home row's own page, pushed over the tabs by its
 * "See all". Params: `index`, `kind`, `value`. The screen lives in
 * `src/screens/home/row-page-screen.tsx`.
 */

import { RowPageScreen } from '@/screens/home/row-page-screen';

export default function HomeRowRoute() {
  return <RowPageScreen />;
}
