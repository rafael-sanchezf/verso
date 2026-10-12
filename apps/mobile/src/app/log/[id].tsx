/**
 * The log flow, as a route: a form sheet over the game page.
 *
 * The root layout registers it at detents 0.45 and 1 — the tier sheet opens at
 * the small one and the flow grows to full height when a tier is tapped. The
 * screen itself lives in `src/screens/log/`.
 */

import { useLocalSearchParams } from 'expo-router';

import { LogFlowScreen } from '@/screens/log/log-flow-screen';

export default function LogFlowSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <LogFlowScreen id={id ?? ''} />;
}
