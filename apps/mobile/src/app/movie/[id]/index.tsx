/**
 * `/movie/[id]` — the movie page, pushed over the tabs.
 *
 * Params: `id` is `media_items.id`; `from` is the tab that pushed it and
 * becomes the back title. The screen lives in `src/screens/movie/`.
 */

import { MoviePageScreen } from '@/screens/movie/movie-page-screen';

export default function MoviePageRoute() {
  return <MoviePageScreen />;
}
