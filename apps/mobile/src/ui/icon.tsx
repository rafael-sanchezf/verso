/**
 * Lucide icons, by the names the specs use.
 *
 * The specs name icons the way lucide.dev does — `chevron-right`,
 * `grip-vertical`, `grid-2x2` — so that is the prop, and the map below is the
 * only place those turn into components. Each icon is imported from its own
 * module rather than from the package root: the root re-exports about fifteen
 * hundred of them, and Metro has no tree shaking to undo that.
 *
 * Adding an icon is two lines here. Deliberately closed rather than open: a
 * fixed set is what makes "did we already have an icon for this?" answerable.
 */

import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import BookOpen from 'lucide-react-native/icons/book-open';
import Calendar from 'lucide-react-native/icons/calendar';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Film from 'lucide-react-native/icons/film';
import Gamepad2 from 'lucide-react-native/icons/gamepad-2';
import Grid2x2 from 'lucide-react-native/icons/grid-2x2';
import GripVertical from 'lucide-react-native/icons/grip-vertical';
import House from 'lucide-react-native/icons/house';
import Layers from 'lucide-react-native/icons/layers';
import List from 'lucide-react-native/icons/list';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Share from 'lucide-react-native/icons/share';
import Star from 'lucide-react-native/icons/star';
import Trophy from 'lucide-react-native/icons/trophy';
import Tv from 'lucide-react-native/icons/tv';
import User from 'lucide-react-native/icons/user';
import X from 'lucide-react-native/icons/x';

// The genres, one each (`GENRE_ICONS` in `src/lib/format.ts`).
import Axe from 'lucide-react-native/icons/axe';
import BrickWall from 'lucide-react-native/icons/brick-wall';
import Car from 'lucide-react-native/icons/car';
import Castle from 'lucide-react-native/icons/castle';
import ChessKnight from 'lucide-react-native/icons/chess-knight';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import Compass from 'lucide-react-native/icons/compass';
import Crosshair from 'lucide-react-native/icons/crosshair';
import Hourglass from 'lucide-react-native/icons/hourglass';
import Joystick from 'lucide-react-native/icons/joystick';
import MessageSquareText from 'lucide-react-native/icons/message-square-text';
import MousePointerClick from 'lucide-react-native/icons/mouse-pointer-click';
import Music from 'lucide-react-native/icons/music';
import Plane from 'lucide-react-native/icons/plane';
import PlayingCards from 'lucide-react-native/icons/playing-cards';
import Puzzle from 'lucide-react-native/icons/puzzle';
import Shield from 'lucide-react-native/icons/shield';
import Swords from 'lucide-react-native/icons/swords';
import Timer from 'lucide-react-native/icons/timer';
import Volleyball from 'lucide-react-native/icons/volleyball';
import WandSparkles from 'lucide-react-native/icons/wand-sparkles';

// The onboarding (specs/onboarding.md): the held media's bell, the slider's
// thumb glyphs. Lucide's `meh` is an alias of `face-neutral`, the module name.
import Bell from 'lucide-react-native/icons/bell';
import BellRing from 'lucide-react-native/icons/bell-ring';
import Meh from 'lucide-react-native/icons/face-neutral';
import Heart from 'lucide-react-native/icons/heart';
import ThumbsDown from 'lucide-react-native/icons/thumbs-down';
import ThumbsUp from 'lucide-react-native/icons/thumbs-up';

// The ask (movies-build.md, PR 3): Home's button and the sheet's send.
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Sparkles from 'lucide-react-native/icons/sparkles';

// The movie screens (movies-build.md, PR 2): the Watchlist's Filters chip.
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';

// The joint Profile (movies-build.md, PR 5): Find friends, the Activity month's chevrons.
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import UserPlus from 'lucide-react-native/icons/user-plus';

import { useTheme, type ColorToken } from './theme';

/** The set the frames use, in the order shell.md lists them. */
const ICONS = {
  house: House,
  search: Search,
  trophy: Trophy,
  layers: Layers,
  user: User,
  'gamepad-2': Gamepad2,
  'book-open': BookOpen,
  film: Film,
  tv: Tv,
  'arrow-left': ArrowLeft,
  ellipsis: Ellipsis,
  plus: Plus,
  check: Check,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'grip-vertical': GripVertical,
  play: Play,
  clock: Clock,
  calendar: Calendar,
  x: X,
  star: Star,
  share: Share,
  'grid-2x2': Grid2x2,
  list: List,
  settings: Settings,

  // The genres, in `GENRE_ICONS` order: the Ranking filter's sheet and chip.
  compass: Compass,
  joystick: Joystick,
  'playing-cards': PlayingCards,
  swords: Swords,
  axe: Axe,
  castle: Castle,
  music: Music,
  'circle-dot': CircleDot,
  'brick-wall': BrickWall,
  'mouse-pointer-click': MousePointerClick,
  puzzle: Puzzle,
  'circle-question-mark': CircleQuestionMark,
  car: Car,
  timer: Timer,
  'wand-sparkles': WandSparkles,
  crosshair: Crosshair,
  plane: Plane,
  volleyball: Volleyball,
  'chess-knight': ChessKnight,
  shield: Shield,
  hourglass: Hourglass,
  'message-square-text': MessageSquareText,

  // The onboarding: Media's held tiles, and the deck slider's thumb, one per
  // stop from "Didn't like" to "Loved".
  bell: Bell,
  'bell-ring': BellRing,
  'thumbs-down': ThumbsDown,
  meh: Meh,
  'thumbs-up': ThumbsUp,
  heart: Heart,

  // The ask: Home's button (Lucide's sparkles, never the mark; decision 31) and the send.
  sparkles: Sparkles,
  'arrow-up': ArrowUp,

  // The movie screens: the Watchlist's Filters chip.
  'sliders-horizontal': SlidersHorizontal,

  // The joint Profile: Find friends, and the Activity month's chevrons.
  'user-plus': UserPlus,
  'chevron-left': ChevronLeft,
} as const;

export type IconName = keyof typeof ICONS;

/** Every icon name, for the preview gallery. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  name: IconName;
  /** Points. 24 unless a spec says otherwise. */
  size?: number;
  /** A color token name. */
  color?: ColorToken;
  /** Lucide's default is 2 and every frame uses it; thinner reads as disabled. */
  strokeWidth?: number;
  /** For an icon that fills a shape rather than outlining one (the tier dots). */
  fill?: ColorToken;
}

export function Icon({ name, size = 24, color = 'text/primary', strokeWidth = 2, fill }: IconProps) {
  const theme = useTheme();
  const Glyph = ICONS[name];

  return (
    <Glyph
      size={size}
      color={theme.colors[color]}
      strokeWidth={strokeWidth}
      fill={fill ? theme.colors[fill] : 'none'}
    />
  );
}
