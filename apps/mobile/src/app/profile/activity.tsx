/**
 * `/profile/activity` — Recent expanded into a month calendar, pushed from
 * Profile's "See all ›". Params: `medium` (optional), the view Profile was
 * showing. The screen lives in `src/screens/profile/activity-screen.tsx`.
 */

import { useDocumentTitle } from '@/lib/use-document-title';
import { ActivityScreen } from '@/screens/profile/activity-screen';

export default function ActivityRoute() {
  useDocumentTitle('Activity');
  return <ActivityScreen />;
}
