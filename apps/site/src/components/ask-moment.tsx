import { font, radius } from '@verso/tokens';
import { ArrowUp, Check, Film, Gamepad2 } from 'lucide-react';
import type { CSSProperties } from 'react';

import { art } from '@/content/art';
import { copy, type Medium } from '@/content/copy';

import { AngledPhone } from './angled-phone';
import { pt } from './phone';

/**
 * The hero's AI moment: an illustration of the vision's ask in plain words,
 * on the angled phone (the motion note's A and B3; the site brief's "Two
 * more directions", 2).
 *
 * The sequence plays once on load, in CSS (globals.css, "The ask"): the
 * question rises, the answer types itself with a caret, a short trace names
 * what the engine reads ("Reading your ranked list") under a shimmer that
 * passes once, then the label and the three picks rise in, each with its
 * art and its reason. About four seconds in all. The server HTML is the
 * finished screen, so without JavaScript or under reduced motion it is
 * simply there.
 *
 * Round four: the switch moved to the top of the page and drives every
 * section, so the phone holds both screens and CSS shows the one for the
 * page's medium (globals.css, "The medium the page shows"). A switch shows
 * the other screen, whose animations the browser starts afresh, so it
 * replays from the question after a 240 ms fade. Each screen is one image
 * to a screen reader, with its own label. No medium color: the chip's icon,
 * the caret and the pick numbers are the brand's mark color and the send
 * button its fill (decision 29). The picks carry their real art (art.ts).
 *
 * It is a picture of what Verso is built to do, not the app's design: the
 * finder (wave C) is designed in Figma later. Nothing on it says it ships
 * today. A server component: nothing in it needs React state any more.
 */

const MEDIA: Medium[] = ['games', 'movies'];

const MEDIUM_ICON = { games: Gamepad2, movies: Film } as const;

const type = (style: keyof typeof font, weight?: 400 | 600 | 700): CSSProperties => ({
  fontSize: pt(font[style].fontSize),
  lineHeight: pt(font[style].lineHeight),
  fontWeight: weight ?? font[style].fontWeight,
});

const vars = (values: Record<string, string | number>) => values as CSSProperties;

export function AskMoment() {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center lg:mx-0 lg:w-[420px]">
      <AngledPhone width="min(300px, 72vw)">
        {MEDIA.map((medium) => (
          <AskScreen key={medium} medium={medium} />
        ))}
      </AngledPhone>
    </div>
  );
}

/** The phone's screen for one medium, shown when the page shows that medium. */
function AskScreen({ medium }: { medium: Medium }) {
  const ask = copy.ask[medium];
  const characters = Array.from(ask.answer);
  const MediumIcon = MEDIUM_ICON[medium];

  return (
    <div
      data-medium-only={medium}
      role="img"
      aria-label={ask.label}
      className="ask-run absolute inset-0 flex flex-col"
      style={{
        paddingTop: pt(59 + 10),
        paddingInline: pt(16),
        ...vars({ '--n': characters.length }),
      }}
    >
      <div className="flex justify-end">
        <span
          className="flex items-center rounded-pill bg-bg-surface"
          style={{ ...type('caption', 600), gap: pt(5), paddingInline: pt(10), paddingBlock: pt(5) }}
        >
          <MediumIcon aria-hidden="true" className="text-accent-text" style={{ width: pt(14), height: pt(14) }} strokeWidth={2.25} />
          {ask.chip}
        </span>
      </div>

      <p className="ask-in text-balance tracking-[-0.021em]" style={{ ...type('large-title'), marginTop: pt(14) }}>
        {ask.question}
      </p>

      <div
        className="ask-in flex items-center bg-bg-surface"
        style={{
          marginTop: pt(18),
          borderRadius: pt(radius.lg),
          padding: `${pt(8)} ${pt(8)} ${pt(8)} ${pt(16)}`,
          gap: pt(10),
          ...vars({ '--d': '180ms' }),
        }}
      >
        <span className="relative min-w-0 flex-1 whitespace-nowrap" style={type('body')}>
          <span className="ask-caret-start" />
          {characters.map((character, index) => (
            <span
              key={index}
              className={index === characters.length - 1 ? 'ask-ch ask-ch-last' : 'ask-ch'}
              style={vars({ '--c': index })}
            >
              {character}
            </span>
          ))}
        </span>
        <span
          className="ask-send flex shrink-0 items-center justify-center rounded-pill bg-accent text-accent-label"
          style={{ width: pt(36), height: pt(36) }}
        >
          <ArrowUp aria-hidden="true" style={{ width: pt(20), height: pt(20) }} strokeWidth={2.5} />
        </span>
      </div>

      <ol className="ask-trace flex flex-col" style={{ marginTop: pt(18), gap: pt(8), paddingInline: pt(4) }}>
        {ask.trace.map((line, index) => (
          <li key={line} className="flex items-center" style={{ gap: pt(8), ...vars({ '--i': index }) }}>
            <Check
              aria-hidden="true"
              className="ask-check shrink-0 text-text-secondary"
              style={{ width: pt(16), height: pt(16) }}
              strokeWidth={2.5}
            />
            <span className="ask-trace-text" style={type('subheadline', 400)}>
              {line}
            </span>
          </li>
        ))}
      </ol>

      <p className="ask-from text-text-secondary" style={{ ...type('subheadline', 600), marginTop: pt(24) }}>
        {ask.from}
      </p>

      <ol className="flex flex-col" style={{ marginTop: pt(10), gap: pt(10) }}>
        {ask.picks.map((pick, index) => {
          const cover = art[pick.art];
          return (
            <li
              key={pick.title}
              className="ask-pick flex items-start bg-bg-surface"
              style={{
                borderRadius: pt(radius.lg),
                padding: pt(12),
                gap: pt(12),
                ...vars({ '--i': index }),
              }}
            >
              {/* The art whole, at its own 2:3, never cropped (rule 29). */}
              <img
                src={cover.src}
                width={cover.width}
                height={cover.height}
                alt=""
                decoding="async"
                className="block shrink-0 bg-bg-placeholder object-cover"
                style={{ width: pt(52), aspectRatio: '2 / 3', borderRadius: pt(6) }}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline" style={{ ...type('headline'), gap: pt(8) }}>
                  <span className="text-accent-text tabular-nums">{index + 1}</span>
                  <span className="min-w-0">{pick.title}</span>
                </p>
                <p className="text-pretty text-text-secondary" style={{ ...type('subheadline'), marginTop: pt(3) }}>
                  {pick.reason}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
