import { ArrowUp } from 'lucide-react';
import type { CSSProperties } from 'react';

import { art, type ArtKey } from '@/content/art';
import { copy, type Medium } from '@/content/copy';

import { ScoreBadge, TierDivider } from './tier';

/**
 * How it works' three scenes, drawn on the tokens (round three: "animated,
 * show how it works, not just say it"; Rafa on round three: "magnifique").
 * Each is the finished state in the HTML; `PlayOnView` plays it once when it
 * scrolls into view, and the animations live in globals.css ("How it works'
 * scenes"), under `[data-play]` and `prefers-reduced-motion: no-preference`
 * only.
 *
 * One story per medium (copy.ts, `how.scenes`). Games: Baldur's Gate 3 beats
 * Elden Ring, slides into the Loved tier at 2, and the rows under it move
 * down as their ranks and scores re-spread; then six games on the list
 * narrow to three numbered picks and the first one's reason appears.
 * Movies, since round four, with films a stranger knows since round six:
 * Dune: Part Two against Interstellar, the same slot, and six films on the
 * watchlist narrowing to the three under two hours. Scene 3's question is
 * asked of the engine on both sides since round six.
 *
 * The art is Steam's and TMDB's, served from the site (art.ts), whole at
 * its own 2:3 (rule 29: never crop box art), loaded lazily. Every scene is
 * decorative markup under one label (the `role="img"` page.tsx puts on each
 * medium's scene), so nothing in it is read twice.
 */

function CoverImage({ cover, className = '', style }: { cover: ArtKey; className?: string; style?: CSSProperties }) {
  const image = art[cover];
  return (
    <img
      src={image.src}
      width={image.width}
      height={image.height}
      alt=""
      loading="lazy"
      decoding="async"
      className={`block aspect-[2/3] bg-bg-placeholder object-cover ${className}`}
      style={style}
    />
  );
}

/** Scene 1: two covers side by side, a tap on one, a ring on it, and the other steps back. */
export function PickScene({ medium }: { medium: Medium }) {
  const scene = copy.how.scenes[medium].pick;
  const cards = [
    { ...scene.chosen, chosen: true },
    { ...scene.other, chosen: false },
  ];
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-center text-subheadline font-semibold">{scene.prompt}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div
            key={card.title}
            data-chosen={card.chosen ? '' : undefined}
            className="pick-card relative flex flex-col items-center rounded-lg bg-bg-canvas px-3 pt-3 pb-2.5 text-center"
          >
            <CoverImage cover={card.cover} className="w-[min(84px,64%)] rounded-[6px]" />
            <p className="mt-2 w-full truncate text-footnote font-semibold">{card.title}</p>
            <p className="text-caption text-text-secondary">{card.note}</p>
            {card.chosen ? <span className="tap-ring" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Scene 2: the pick slides into the Loved tier between its neighbors, and the
 * rows under it renumber. The divider and the badges are the app's since
 * decision 29's option A (tier.tsx): the tier's rule with its chip in the
 * gap, and each score on the `scoreColor` ramp in white. A badge whose score
 * changes keeps the new score's fill while the numerals crossfade.
 */
export function SlotScene({ medium }: { medium: Medium }) {
  const scene = copy.how.scenes[medium].slot;
  return (
    <div className="flex h-full flex-col">
      <TierDivider tier={scene.tier} />
      <ol className="slot-list mt-3 flex flex-col gap-1">
        {scene.rows.map((row, index) => {
          const isNew = 'isNew' in row;
          const was = 'was' in row ? row.was : undefined;
          return (
            <li
              key={row.title}
              data-new={isNew ? '' : undefined}
              data-moves={was ? '' : undefined}
              className="slot-row flex h-11 items-center gap-2.5 rounded-md px-2"
            >
              <span className="relative w-4 shrink-0 text-center text-subheadline font-semibold text-text-secondary tabular-nums">
                {was ? <span className="slot-was absolute inset-0">{was.rank}</span> : null}
                <span className={was ? 'slot-now block' : 'block'}>{index + 1}</span>
              </span>
              <CoverImage cover={row.cover} className="w-[26px] shrink-0 rounded-[4px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-subheadline font-semibold">{row.title}</span>
                <span className="block truncate text-caption text-text-secondary">{row.meta}</span>
              </span>
              <ScoreBadge score={row.score} size="small" className="relative">
                {was ? <span className="slot-was absolute inset-0 flex items-center justify-center">{was.score}</span> : null}
                <span className={was ? 'slot-now block' : 'block'}>{row.score}</span>
              </ScoreBadge>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Scene 3: a typed question, six titles on the list narrowing to three numbered picks, and the first one's reason. */
export function AskScene({ medium }: { medium: Medium }) {
  const scene = copy.how.scenes[medium].ask;
  const characters = Array.from(scene.question);
  return (
    <div className="scene-ask flex h-full flex-col justify-center" style={{ '--n': characters.length } as CSSProperties}>
      {/* The field grows to a second line rather than cutting the question (round six: the asks to the engine are longer). */}
      <div className="flex min-h-11 items-center gap-2 rounded-lg bg-bg-canvas py-1.5 pr-1.5 pl-3.5">
        <span className="relative min-w-0 flex-1 text-subheadline">
          <span className="ask-caret-start" />
          {characters.map((character, index) => (
            <span
              key={index}
              className={index === characters.length - 1 ? 'ask-ch ask-ch-last' : 'ask-ch'}
              style={{ '--c': index } as CSSProperties}
            >
              {character}
            </span>
          ))}
        </span>
        <span className="ask-send flex size-8 shrink-0 items-center justify-center rounded-pill bg-accent text-accent-label">
          <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </span>
      </div>
      <p className="mt-4 text-caption font-semibold text-text-secondary">{scene.from}</p>
      <ul className="mt-2 grid grid-cols-6 gap-2">
        {scene.covers.map((item) => {
          const pick = 'pick' in item ? item.pick : undefined;
          return (
            <li
              key={item.title}
              data-pick={pick ?? undefined}
              className="list-cover relative"
              style={pick ? ({ '--k': pick - 1 } as CSSProperties) : undefined}
            >
              <CoverImage cover={item.cover} className="w-full rounded-[5px]" />
              {pick ? <span className="pick-badge">{pick}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="scene-reason mt-4 text-footnote text-pretty text-text-secondary">
        <span className="font-semibold text-text-primary">{scene.reasonTitle}</span> {scene.reason}
      </p>
    </div>
  );
}
