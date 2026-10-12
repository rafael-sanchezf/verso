/**
 * `/game/[id]` — the game page, pushed over the tabs.
 *
 * Params: `id` is `media_items.id`; `from` is the tab that pushed it and
 * becomes the back title; `log=1` opens the log flow as soon as the page has
 * loaded (Home and Search arrive already marked finished).
 *
 * The screen lives in `src/screens/game/` so this file stays what the route map
 * says it is.
 */

import { GamePageScreen } from '@/screens/game/game-page-screen';

export default function GamePageRoute() {
  return <GamePageScreen />;
}
