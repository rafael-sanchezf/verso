import type { Tier } from '@verso/core';
import { font, radius } from '@verso/tokens';
import { Check, ChevronDown, Gamepad2, Grid2x2, House, Layers, List, Plus, Search, Sparkles, Trophy, User, X } from 'lucide-react';
import type { CSSProperties } from 'react';

import { art, type ArtKey } from '@/content/art';
import { copy } from '@/content/copy';

import { Phone, pt } from './phone';
import { ScoreBadge, TierChip, TierDivider } from './tier';

/**
 * Two movie screens drawn live in the strip (round five; Rafa's reaction to
 * round four, 3: "Inside the app is still raw", and on the movies Home it
 * must be clear the rows are recommendations). No movie screen is built yet
 * (wave B), so these are drawn on the tokens from their approved designs,
 * in the 402 pt screen's own points (`pt`), and the strip says so.
 *
 * `MoviesHomePhone` is decision 28 and rule 36 as frame 143:173 draws them
 * (the movies Home, "Rows by reason"): the medium chip, one filled button
 * that opens the question, then rows of picks where every row's title is
 * its reason: the first row as the larger carousel (the app's watchlist,
 * "Our recommendations" on the site since round six), a genre row titled
 * by the genre word alone, a "Because you loved" row with the film in
 * italics. Each card is the poster alone, with four facts on its foot
 * (service, genre, year, duration) and no title; services never title a
 * row. The rows bleed off the right edge and the page runs on under the tab
 * bar, as a scrolled screen does. Three departures from the frame, for the
 * size it is drawn at: the rows are three of the five, the carousel's dots
 * are left out, and the small cards carry all four facts (the frame's carry
 * the service alone; decision 28 and rule 36 say four).
 *
 * `MoviesComparePhone` is the compare frame (26:385) with scene 1's films,
 * its tier shown as the app's chip since decision 29's option A (the tier's
 * solid, its icon and white words) in place of the frame's dot on gray.
 *
 * `MoviesSearchPhone` and `MoviesRankingPhone` (finalize round, 2026-10-08)
 * replace round four's two "Coming with the beta" slots. They are the app's
 * own Search and Ranking screens (apps/mobile/src/screens/search and
 * ranking, and the games shots in public/shots) with films in place of
 * games, in the app's points: the large title with the medium chip, the
 * search field or the tools row, then the rows (`ListRow`'s metrics, the
 * Ranking divider and score badge from tier.tsx). Row titles are Semi Bold,
 * where the app sets 500: the site keeps to the brand's three weights, as
 * scene 2's rows do. Rafa has not seen these two frames; they illustrate
 * screens already approved for games, as the compare phone does.
 *
 * The tab bar's active tab is the brand green, as the app draws it since
 * decision 29 (the games shots), where frame 143:173 drew it black.
 *
 * Both are one image to a screen reader (`Phone`'s label); the art is
 * TMDB's, served from the site and lazy (art.ts), and the posters are
 * whole at 2:3.
 */

/** A type style from the tokens, in points. The brand's three weights only: 400, 600 and 700. */
const type = (style: keyof typeof font, weight?: 400 | 600 | 700): CSSProperties => ({
  fontSize: pt(font[style].fontSize),
  lineHeight: pt(font[style].lineHeight),
  fontWeight: weight ?? font[style].fontWeight,
});

function Poster({ cover, className = '', style }: { cover: ArtKey; className?: string; style?: CSSProperties }) {
  const image = art[cover];
  return (
    <img
      src={image.src}
      width={image.width}
      height={image.height}
      alt=""
      loading="lazy"
      decoding="async"
      className={`block aspect-[2/3] w-full bg-bg-placeholder object-cover ${className}`}
      style={style}
    />
  );
}

type Row = (typeof copy.product.moviesHome.rows)[number];

/** The two card sizes: the first row's carousel and the rows under it. */
const CARD = {
  large: { width: 190, radius: 12, inset: 7, fact: 9.5, factLine: 14.5, factPad: 5 },
  small: { width: 104, radius: 8, inset: 5, fact: 8.5, factLine: 12.5, factPad: 4.5 },
} as const;

/** A pick: the poster, a scrim at its foot, and the four facts as small white pills over it. */
function PickCard({ cover, facts, size }: { cover: ArtKey; facts: readonly string[]; size: keyof typeof CARD }) {
  const card = CARD[size];
  return (
    <li className="relative shrink-0 overflow-hidden" style={{ width: pt(card.width), borderRadius: pt(card.radius) }}>
      <Poster cover={cover} />
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[38%] bg-linear-to-t from-black/55 to-transparent" />
      <span
        className="absolute flex flex-wrap"
        style={{ left: pt(card.inset), right: pt(card.inset), bottom: pt(card.inset), gap: pt(3) }}
      >
        {facts.map((fact) => (
          <span
            key={fact}
            className="rounded-pill bg-bg-canvas font-semibold whitespace-nowrap text-text-primary"
            style={{ fontSize: pt(card.fact), lineHeight: pt(card.factLine), paddingInline: pt(card.factPad) }}
          >
            {fact}
          </span>
        ))}
      </span>
    </li>
  );
}

/** A row: its title, which is its reason, then the cards, bleeding off the right edge. */
function PickRow({ row }: { row: Row }) {
  const home = copy.product.moviesHome;
  return (
    <section>
      <div className="flex items-baseline justify-between" style={{ paddingInline: pt(16), gap: pt(8) }}>
        <p className="min-w-0 truncate tracking-[-0.02em]" style={type('title-3', 700)}>
          {row.title}
          {'film' in row ? (
            <>
              {' '}
              <i>{row.film}</i>
            </>
          ) : null}
        </p>
        <p className="shrink-0 text-text-secondary" style={type('subheadline')}>
          {home.seeAll}
        </p>
      </div>
      <ul className="flex overflow-hidden" style={{ marginTop: pt(10), gap: pt(10), paddingLeft: pt(16) }}>
        {row.films.map((film) => (
          <PickCard key={film.art} cover={film.art} facts={film.facts} size={row.size} />
        ))}
      </ul>
    </section>
  );
}

const TAB_ICONS = [House, Search, Trophy, Layers, User] as const;

/**
 * The movies tab bar over the page, as the system's material is, with the
 * screen's own tab active in the brand green (`brand/text` on the light
 * screen), as the app draws its tab bar since decision 29.
 */
function TabBar({ active }: { active: number }) {
  const { tabs } = copy.product.moviesHome;
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex border-t border-border-separator bg-bg-canvas/92 backdrop-blur-md"
      style={{ paddingTop: pt(7), paddingBottom: pt(34), paddingInline: pt(8) }}
    >
      {tabs.map((tab, index) => {
        const Icon = TAB_ICONS[index] ?? House;
        const isActive = index === active;
        return (
          <span
            key={tab}
            className={`flex flex-1 flex-col items-center ${isActive ? 'text-accent-text' : 'text-text-secondary'}`}
            style={{ gap: pt(3) }}
          >
            <Icon aria-hidden="true" style={{ width: pt(24), height: pt(24) }} strokeWidth={isActive ? 2.5 : 2} />
            <span style={{ fontSize: pt(10), lineHeight: pt(12), fontWeight: isActive ? 600 : 400 }}>{tab}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * The movies Home, live. The caption that says what its rows are is the
 * strip's since the interactive strip (feature-strip.tsx), under whichever
 * phone is the large one.
 */
export function MoviesHomePhone({ width }: { width: string }) {
  const home = copy.product.moviesHome;
  return (
    <figure className="mx-auto" style={{ width }}>
      <Phone width="100%" label={home.label}>
        {/* Block layout, not a column: the page runs past the screen's foot, and a column would squeeze its rows to fit. */}
        <div className="absolute inset-0" style={{ paddingTop: pt(59) }}>
          <div className="flex items-center justify-between" style={{ padding: `${pt(4)} ${pt(16)} 0` }}>
            {/*
              The medium chip, the app's MediumChip; the dot is the brand's, since no medium has a color. No mark here:
              Rafa does not want his mark beside the medium's name (docs/design/brand-build.md, default 5).
            */}
            <span
              className="flex items-center rounded-pill bg-bg-surface"
              style={{ ...type('subheadline', 600), gap: pt(7), paddingBlock: pt(6), paddingLeft: pt(11), paddingRight: pt(13) }}
            >
              <span className="rounded-pill bg-accent-text" style={{ width: pt(9), height: pt(9) }} />
              {home.chip}
            </span>
            {/* The other medium, one tap away, in gray. */}
            <span
              className="flex items-center justify-center rounded-pill bg-bg-surface text-text-secondary"
              style={{ width: pt(32), height: pt(32) }}
            >
              <Gamepad2 aria-hidden="true" style={{ width: pt(17), height: pt(17) }} strokeWidth={2} />
            </span>
          </div>

          {/* The one colored control on the page: the question, behind one button (decision 28). Its icon is Lucide's sparkles, never the mark (brand-build.md, rule 5). */}
          <div
            className="flex items-center bg-accent text-accent-label"
            style={{
              margin: `${pt(14)} ${pt(16)} 0`,
              height: pt(54),
              borderRadius: pt(radius.md + 2),
              paddingInline: pt(18),
              gap: pt(12),
              ...type('headline'),
            }}
          >
            <Sparkles aria-hidden="true" className="shrink-0" style={{ width: pt(22), height: pt(22) }} strokeWidth={2.25} />
            {home.ask}
          </div>

          <div className="flex flex-col" style={{ marginTop: pt(20), gap: pt(18) }}>
            {home.rows.map((row) => (
              <PickRow key={row.id} row={row} />
            ))}
          </div>
        </div>
        <TabBar active={0} />
      </Phone>
    </figure>
  );
}

/** The compare step for movies: scene 1's two films, as the compare frame lays them out. */
export function MoviesComparePhone({ width }: { width: string }) {
  const compare = copy.product.moviesCompare;
  const scene = copy.how.scenes.movies.pick;
  const cards = [scene.chosen, scene.other];
  return (
    <figure className="mx-auto" style={{ width }}>
      <Phone width="100%" label={compare.label}>
        <div className="absolute inset-0 flex flex-col" style={{ paddingTop: pt(59) }}>
          <div className="flex items-center justify-between" style={{ padding: `${pt(4)} ${pt(16)} 0`, height: pt(44) }}>
            <X aria-hidden="true" style={{ width: pt(22), height: pt(22) }} strokeWidth={2} />
            <span className="flex items-center" style={{ gap: pt(10) }}>
              {/* The tier being placed into, as the app's compare step shows it: its chip (tier.tsx). */}
              <TierChip tier={compare.tier} unit={pt} />
              <span className="text-text-secondary" style={type('footnote')}>
                {compare.progress}
              </span>
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-center" style={{ paddingInline: pt(16), paddingBottom: pt(120) }}>
            <p className="text-center tracking-[-0.02em]" style={type('title-2')}>
              {scene.prompt}
            </p>
            <div className="grid grid-cols-2" style={{ marginTop: pt(14), gap: pt(12) }}>
              {cards.map((card) => (
                <div
                  key={card.title}
                  className="flex flex-col items-center bg-bg-surface text-center"
                  style={{ borderRadius: pt(radius.lg), padding: `${pt(14)} ${pt(12)} ${pt(14)}` }}
                >
                  <Poster cover={card.cover} style={{ width: pt(124), borderRadius: pt(8) }} />
                  <p className="w-full truncate" style={{ ...type('headline'), marginTop: pt(12) }}>
                    {card.title}
                  </p>
                  <p className="text-text-secondary" style={{ ...type('subheadline'), marginTop: pt(2) }}>
                    {card.note}
                  </p>
                  <span
                    className="rounded-pill bg-bg-placeholder text-text-secondary"
                    style={{ ...type('caption', 600), marginTop: pt(8), paddingInline: pt(9), paddingBlock: pt(2) }}
                  >
                    {compare.genre}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2" style={{ marginTop: pt(14), gap: pt(12) }}>
              {[compare.tooClose, compare.cantCompare].map((label) => (
                <span
                  key={label}
                  className="flex items-center justify-center bg-bg-surface"
                  style={{ ...type('subheadline', 400), height: pt(44), borderRadius: pt(radius.md) }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Phone>
    </figure>
  );
}

/** A poster in a list row, as the app's `Cover`: whole at 2:3, rounded, with the soft shadow rule 30 gives covers on light. */
function RowCover({ cover, width }: { cover: ArtKey; width: number }) {
  return (
    <Poster
      cover={cover}
      className="shrink-0"
      style={{ width: pt(width), borderRadius: pt(6), boxShadow: '0 1px 3px rgb(0 0 0 / 0.18)' }}
    />
  );
}

/** The large title the app's tabs share, with the medium chip on its baseline (the app's `ScreenHeader` and `MediumChip`). */
function ScreenHeader({ title, chip, paddingBottom }: { title: string; chip: string; paddingBottom: number }) {
  return (
    <div className="flex items-end justify-between" style={{ paddingInline: pt(16), paddingBottom: pt(paddingBottom), gap: pt(12) }}>
      <p className="min-w-0 truncate tracking-[-0.021em]" style={type('large-title')}>
        {title}
      </p>
      <span
        className="flex shrink-0 items-center rounded-pill bg-bg-surface"
        style={{ paddingLeft: pt(8), paddingRight: pt(10), paddingBlock: pt(4), gap: pt(6), marginBottom: pt(6) }}
      >
        {/* The dot is the brand's, the same for every medium (decision 29). */}
        <span className="rounded-pill bg-accent-text" style={{ width: pt(14), height: pt(14) }} />
        <span style={{ fontSize: pt(13), lineHeight: pt(17), fontWeight: 600 }}>{chip}</span>
      </span>
    </div>
  );
}

/** A row's title and the line under it, `ListRow`'s text column. */
function RowText({ title, meta }: { title: string; meta: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col" style={{ gap: pt(2) }}>
      <span className="truncate" style={{ fontSize: pt(16), lineHeight: pt(21), fontWeight: 600 }}>
        {title}
      </span>
      <span className="truncate text-text-secondary" style={{ fontSize: pt(13), lineHeight: pt(18) }}>
        {meta}
      </span>
    </span>
  );
}

/** Search for movies: the app's Search screen with a typed query and films in its rows. */
export function MoviesSearchPhone({ width }: { width: string }) {
  const search = copy.product.moviesSearch;
  return (
    <figure className="mx-auto" style={{ width }}>
      <Phone width="100%" label={search.label}>
        <div className="absolute inset-0" style={{ paddingTop: pt(62) }}>
          <ScreenHeader title={search.title} chip={search.chip} paddingBottom={12} />

          {/* The field with the query typed, the keyboard down, and Cancel beside it (search-field.tsx). */}
          <div className="flex items-center" style={{ paddingInline: pt(16), paddingBottom: pt(16), gap: pt(12) }}>
            <span
              className="flex min-w-0 flex-1 items-center bg-bg-surface"
              style={{ borderRadius: pt(radius.md), paddingInline: pt(12), paddingBlock: pt(10), gap: pt(8) }}
            >
              <Search aria-hidden="true" className="shrink-0 text-text-secondary" style={{ width: pt(18), height: pt(18) }} strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate" style={type('body', 400)}>
                {search.query}
              </span>
              <X aria-hidden="true" className="shrink-0 text-text-secondary" style={{ width: pt(16), height: pt(16) }} strokeWidth={2} />
            </span>
            <span style={type('body', 400)}>{search.cancel}</span>
          </div>

          <ul style={{ paddingInline: pt(16) }}>
            {search.results.map((result) => (
              <li key={`${result.title} ${result.meta}`} className="flex items-center" style={{ paddingBlock: pt(10), gap: pt(12) }}>
                <RowCover cover={result.cover} width={44} />
                <RowText title={result.title} meta={result.meta} />
                {/* The add pill: a plus, or the check in brand text once the title is on the person's list (game-row.tsx). */}
                <span
                  className="flex shrink-0 items-center justify-center rounded-pill bg-bg-surface"
                  style={{ paddingInline: pt(8), paddingBlock: pt(4) }}
                >
                  {result.tracked ? (
                    <Check aria-hidden="true" className="text-accent-text" style={{ width: pt(18), height: pt(18) }} strokeWidth={2} />
                  ) : (
                    <Plus aria-hidden="true" style={{ width: pt(18), height: pt(18) }} strokeWidth={2} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <TabBar active={1} />
      </Phone>
    </figure>
  );
}

type RankedRow = { title: string; meta: string; cover: ArtKey; score: string };

/** One ranked row: the rank, the poster, the title over "year · genre", and the score badge (ranking-list.tsx). */
function RankedRowItem({ row, rank }: { row: RankedRow; rank: number }) {
  return (
    <li className="flex items-center" style={{ paddingBlock: pt(9), gap: pt(12) }}>
      <span
        className="shrink-0 text-right text-text-secondary tabular-nums"
        style={{ width: pt(22), fontSize: pt(17), lineHeight: pt(22), fontWeight: 700 }}
      >
        {rank}
      </span>
      <RowCover cover={row.cover} width={40} />
      <RowText title={row.title} meta={row.meta} />
      <ScoreBadge score={row.score} unit={pt} />
    </li>
  );
}

/** Ranking for movies: the app's ranked list with its tier dividers, films in its rows. */
export function MoviesRankingPhone({ width }: { width: string }) {
  const ranking = copy.product.moviesRanking;
  // The Loved tier is scene 2's after Dune: Part Two slots in: the page's one story.
  const loved = copy.how.scenes.movies.slot;
  const tiers: { tier: Tier; rows: readonly RankedRow[] }[] = [{ tier: loved.tier, rows: loved.rows }, ...ranking.tiers];
  let rank = 0;
  return (
    <figure className="mx-auto" style={{ width }}>
      <Phone width="100%" label={ranking.label}>
        <div className="absolute inset-0" style={{ paddingTop: pt(62) }}>
          <ScreenHeader title={ranking.title} chip={ranking.chip} paddingBottom={10} />

          {/* The tools row: the filters, and the list or grid toggle with the list chosen (tools-row.tsx). */}
          <div className="flex items-center justify-between" style={{ paddingInline: pt(16), paddingBottom: pt(8), gap: pt(12) }}>
            <span className="flex items-center" style={{ gap: pt(8) }}>
              {ranking.filters.map((filter, index) => (
                <span
                  key={filter}
                  className={`flex items-center rounded-pill ${index === 0 ? 'bg-text-primary text-bg-canvas' : 'bg-bg-surface'}`}
                  style={{ paddingInline: pt(12), paddingBlock: pt(6), gap: pt(6), fontSize: pt(14), lineHeight: pt(18), fontWeight: 600 }}
                >
                  {filter}
                  {index === 0 ? null : <ChevronDown aria-hidden="true" style={{ width: pt(14), height: pt(14) }} strokeWidth={2} />}
                </span>
              ))}
            </span>
            <span className="flex items-center bg-bg-surface" style={{ borderRadius: pt(radius.sm), padding: pt(2), gap: pt(2) }}>
              <span className="flex bg-bg-canvas" style={{ paddingInline: pt(10), paddingBlock: pt(4), borderRadius: pt(6) }}>
                <List aria-hidden="true" style={{ width: pt(16), height: pt(16) }} strokeWidth={2} />
              </span>
              <span className="flex text-text-secondary" style={{ paddingInline: pt(10), paddingBlock: pt(4) }}>
                <Grid2x2 aria-hidden="true" style={{ width: pt(16), height: pt(16) }} strokeWidth={2} />
              </span>
            </span>
          </div>

          <div style={{ paddingInline: pt(16) }}>
            {tiers.map(({ tier, rows }) => (
              <section key={tier}>
                <div style={{ paddingBlock: pt(8) }}>
                  <TierDivider tier={tier} unit={pt} />
                </div>
                <ol>
                  {rows.map((row) => {
                    rank += 1;
                    return <RankedRowItem key={row.title} row={row} rank={rank} />;
                  })}
                </ol>
              </section>
            ))}
          </div>
        </div>
        <TabBar active={2} />
      </Phone>
    </figure>
  );
}
