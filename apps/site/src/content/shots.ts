/**
 * The screenshots in `public/shots/`, from two sources.
 *
 * The games strip's four (Home, Search, compare and Ranking, 2026-10-08) are
 * the app itself: the web build of `main` after #76 (`pnpm web:export`), shot
 * in Chromium at the iPhone 16 Pro's 402 × 874 pt and 3x (1206 × 2622),
 * light, with the phone's safe-area insets (62 top, 34 bottom) emulated so
 * the layout is the one an iPhone gets. The account is a throwaway on the
 * local stack, its demo library built through the app's own flows (Search's
 * add sheet, the log flow and its compare step, the game page's Played on).
 * Every game in them is a real catalog row seeded into the local stack from
 * IGDB with the mirror's own client and mapper: the IGDB id, title, release
 * date, genres, platforms, developer, cover, Steam app id and time to beat
 * are IGDB's. Encoded as WebP at quality 92.
 *
 * Home was shot again in the finalize round (2026-10-08) from the web build
 * of `main` at 53d5c45, after #82, so its header shows the active medium's
 * word alone where the first shot had the old green "V" tile. Same demo
 * library, same 402 × 874 pt at 3x, light, insets 62 and 34 (emulated with
 * Chromium's safe-area override), quality 92. Its stack was an isolated
 * local one on main's migrations (the shared one carried another branch's),
 * seeded with the three IGDB rows by the mirror's client and mapper, the
 * library written as a throwaway account through @verso/api. Search,
 * compare and Ranking were checked and kept: their medium chip with the
 * brand dot, tier chips and badges are the app's current ones.
 *
 * The other phone frames are exported from the Verso Figma file on
 * 2026-10-07 (the `Fidelity round` page, light,
 * real covers) as lossless WebP at 1x (402 × 874): Figma renders a node at its
 * own size and does not upscale. The desktop frames are from the `Web round`
 * page, grayscale structure drawings, so they are always captioned as design.
 *
 * `width` and `height` are the files' own pixels, which reserve the space
 * before the image loads; every phone file has the screen's 402:874 ratio.
 *
 * The alt text is a Fact (what the image shows). The strip's four captions
 * are Facts too, saying where each image comes from; the others are Slots
 * for Rafa's words. Since round two the page shows four phone shots (the hero's
 * compare, How it works' ranking, and the strip) and no desktop shot; the
 * other entries and their files stay for the brand round.
 */

export interface Shot {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
}

const PHONE = { width: 402, height: 874 } as const;
/** A shot of the app's web build at 402 × 874 pt and 3x. */
const APP_3X = { width: 1206, height: 2622 } as const;
const DESKTOP = { width: 1280, height: 832 } as const;

export const shots = {
  compare: {
    src: '/shots/phone-compare.webp',
    ...APP_3X,
    // Fact: the app's web build, 2026-10-08: the log flow ranking Celeste
    // into Loved, its first question of two.
    alt: 'The compare step in the app: "Which platformer did you enjoy more?" over Celeste, just finished, and Hollow Knight, ranked #1 at 10.0, with "Too close to call" and "Can\'t compare these" under them.',
    // Fact: what the image is.
    caption: "Compare, from the app's web build at phone size: real games, a demo library",
  },
  ranking: {
    src: '/shots/phone-ranking.webp',
    ...APP_3X,
    // Fact: the app's web build, 2026-10-08, after the compare above.
    alt: 'The Ranking screen in the app: Hollow Knight, Celeste and Outer Wilds under the Loved it divider, Disco Elysium, Portal 2 and Cuphead under Liked it, and Terraria under It was fine, each with its year, its genre and its score in a badge.',
    // Fact: what the image is.
    caption: "Ranking, from the app's web build at phone size: real games, a demo library",
  },
  home: {
    src: '/shots/phone-home.webp',
    ...APP_3X,
    // Fact: the app's web build of main after #82, shot again 2026-10-08.
    alt: "The games Home screen in the app: \"Games\" at the top in the brand green, with icons for books, movies and TV beside it, Baldur's Gate III on the Playing card, on PC since Oct 8, and Elden Ring and Slay the Spire in Up next with the hours each takes.",
    // Fact: what the image is.
    caption: "Home, from the app's web build at phone size: real games, a demo library",
  },
  search: {
    src: '/shots/phone-search.webp',
    ...APP_3X,
    // Fact: the app's web build, 2026-10-08, the keyboard down.
    alt: 'The Search screen in the app: "Elden" typed in the field and one result, Elden Ring, 2022, with its platforms and an add button.',
    // Fact: what the image is.
    caption: "Search, from the app's web build at phone size: real games, a demo library",
  },
  game: {
    src: '/shots/phone-game.webp',
    ...PHONE,
    // Fact: Figma node 26:249.
    alt: 'The Hades game page on iPhone: the cover, a Metacritic score and a Steam rating each labeled with its source, and the "I finished this" button.',
    // Slot: caption.
    caption: 'A game page: every score names its source',
  },
  backlog: {
    src: '/shots/phone-backlog.webp',
    ...PHONE,
    // Fact: Figma node 26:670.
    alt: 'The Up next screen on iPhone: the backlog in the order its owner set, with platforms and hours for each game.',
    // Slot: caption.
    caption: 'Up next: the backlog, in your order',
  },
  moviesHome: {
    src: '/shots/phone-movies-home.webp',
    // The export's own pixels: Figma renders the 402 × 2080 frame with its
    // longer edge capped, so the first screen comes out at 338 × 735.
    width: 338,
    height: 735,
    // Fact: Figma node 143:173 ("Home · Movies H · Rows by reason", page
    // `Structure round · movies`), exported 2026-10-07: the first screen
    // above the frame's fold line with its tab bar, the designer's "fold"
    // note painted out, and the movie blue swapped for the brand green by
    // value, as the Brand color round did in Figma (189:190). See DESIGN.md,
    // "Round four".
    alt: 'A design of the movies Home on iPhone: "Movies" at the top, a "What do you want to watch?" field, and "You wanted to watch these" with a large poster card, drawn as gray placeholders.',
    // Fact: it is a drawing, not a built screen.
    caption: 'In design',
  },
  webHome: {
    src: '/shots/web-home.webp',
    ...DESKTOP,
    // Fact: Figma node 160:93.
    alt: 'A grayscale design of the web app\'s Home: a sidebar with Games, Movies and "Add a medium" at the top, and Playing, Up next and Coming up beside it.',
    // Fact: grayscale structure, so it is labeled as design.
    caption: 'The web app, in design.',
  },
  webRanking: {
    src: '/shots/web-ranking.webp',
    ...DESKTOP,
    // Fact: Figma node 161:142.
    alt: "A grayscale design of the web app's Ranking: the sidebar, and the ranked list under Loved and Liked dividers with move up and move down controls on a row.",
    // Fact: grayscale structure, so it is labeled as design.
    caption: 'The web app, in design.',
  },
  webCompare: {
    src: '/shots/web-compare.webp',
    ...DESKTOP,
    // Fact: Figma node 162:128.
    alt: 'A grayscale design of the web app\'s compare dialog: "Which platformer did you enjoy more?" over two cards, with keyboard hints for each choice.',
    // Fact: grayscale structure, so it is labeled as design.
    caption: 'The web app, in design.',
  },
} satisfies Record<string, Shot>;

/**
 * The strip in "Inside the app" on the games side, in the order a new user
 * meets the screens; since the finalize round these four are the whole row
 * (the movies slot that followed them is gone). The movies side draws all
 * four of its screens live (movie-screens.tsx), so `moviesHome` is off the
 * page; its file stays, like the desktop frames.
 */
export const productRow: Shot[] = [shots.home, shots.search, shots.compare, shots.ranking];
