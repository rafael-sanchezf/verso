import { ArrowDown, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { AskMoment } from '@/components/ask-moment';
import { ButtonLink } from '@/components/button';
import { Container } from '@/components/container';
import { FeatureStrip } from '@/components/feature-strip';
import { AskScene, PickScene, SlotScene } from '@/components/how-scenes';
import { MediumSwitch } from '@/components/medium-switch';
import { MoviesComparePhone, MoviesHomePhone, MoviesRankingPhone, MoviesSearchPhone } from '@/components/movie-screens';
import { PhoneShot } from '@/components/phone';
import { PlayOnView } from '@/components/play-on-view';
import { SectionHeading } from '@/components/section-heading';
import { ACCESS_HREF, copy, type Medium } from '@/content/copy';
import { productRow } from '@/content/shots';

/**
 * The home page, round four (site brief, "Rafa's reaction to round three"):
 * the medium switch at the top drives the whole page (the hero's ask, How it
 * works, the strip, and every sentence that names the medium); the hero
 * naming the engine, with the AI moment on one angled 3D phone; the thesis
 * strip, opening on the problem statement; How it works as three live scenes
 * that play once in view; the strip of phones; the questions; the call to
 * action again. The nav and the footer are the layout's. The page's scroll
 * height at 1440 stays under Unisound's, which is the ceiling (DESIGN.md).
 *
 * Round five (site brief, "Rafa's reaction to round four"): the switch shows
 * TV and Books as coming, the FAQ opens on "Is it just games and movies?"
 * with his draft, the nav carries the logo slot, and the movies strip draws
 * the movies Home live, rows of reasons as decision 28 decided it.
 *
 * Whatever names the medium is in the HTML once per medium, under
 * `data-medium-only`, and CSS shows the side `<html data-medium>` names
 * (globals.css, "The medium the page shows"), so the page needs no state
 * of its own and a `?medium=games` link opens on games with no flash (movies
 * is the default since the finalize round).
 *
 * Section rhythm is 64 px at phone width, 80 at tablet, 96 from desktop up.
 * Each section fades up once as it enters (`data-reveal` on its one inner
 * wrapper, never on each element); the hero rises on first paint instead.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Vision />
      <HowItWorks />
      <Product />
      <Faq />
      <Access />
    </>
  );
}

const SECTION = 'py-16 md:py-20 lg:py-24';
const HAIRLINE = 'border-t border-border-separator';

const MEDIA: Medium[] = ['games', 'movies'];

/** A sentence in its games and movies versions; the page shows one. */
function ByMedium({ text }: { text: Record<Medium, string> }) {
  return (
    <>
      <span data-medium-only="games">{text.games}</span>
      <span data-medium-only="movies">{text.movies}</span>
    </>
  );
}

/** Text that may name the medium: one string for both, or a version each. */
function MaybeByMedium({ text }: { text: string | Record<Medium, string> }): ReactNode {
  return typeof text === 'string' ? text : <ByMedium text={text} />;
}

/**
 * The hero clips sideways: the glow behind the angled phone spreads past the
 * column, and at phone width past the screen, which must never scroll
 * sideways. The clip sits above the phone's 3D chain, so it flattens nothing.
 *
 * Below 1024 px the medium switch opens the hero, right under the nav; from
 * 1024 px it sits in the nav's center instead (medium-switch.tsx).
 */
function Hero() {
  return (
    <div className="overflow-x-clip">
      <Container className="pt-6 pb-16 md:pt-8 md:pb-20 lg:pt-12 lg:pb-24">
        <MediumSwitch placement="hero" />
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          <div className="max-w-[600px]">
            {/* The last word follows the switch: "play." for movies, "start." for games. A screen reader hears the one shown; the animated pair is hidden from it (globals.css, "The tagline's last word"). */}
            <h1 className="animate-rise text-display text-balance">
              {copy.hero.titleLead}{' '}
              <span className="sr-only">
                <ByMedium text={copy.hero.titleEnd} />
              </span>
              <span aria-hidden="true" className="press-swap">
                {MEDIA.map((medium) => (
                  <span key={medium} className="press-word" data-word={medium}>
                    {copy.hero.titleEnd[medium]}
                  </span>
                ))}
              </span>
            </h1>
            <p className="animate-rise mt-6 text-body text-pretty text-text-secondary [--rise-delay:90ms] md:text-title-3 md:font-normal">
              {copy.hero.subtitle}
            </p>
            {/* Side by side from 480 px; below it the two do not fit one row, so they stack full width. */}
            <div className="animate-rise mt-9 flex flex-col gap-3 [--rise-delay:180ms] min-[480px]:flex-row">
              <ButtonLink href={ACCESS_HREF}>{copy.nav.requestAccess}</ButtonLink>
              <ButtonLink href="#how" variant="secondary">
                {copy.hero.secondary}
                <ArrowDown aria-hidden="true" className="size-4" strokeWidth={2.25} />
              </ButtonLink>
            </div>
          </div>
          <AskMoment />
        </div>
      </Container>
    </div>
  );
}

/** The three scenes, in step order, with each medium's label for a screen reader. */
const SCENES = [
  { Scene: PickScene, key: 'pick' },
  { Scene: SlotScene, key: 'slot' },
  { Scene: AskScene, key: 'ask' },
] as const;

/**
 * Three steps, each a live scene over its sentence, in the medium the page
 * shows. The scenes play once as they scroll into view; side by side (from
 * 768 px) they play in turn, 1.4 s apart, so the reader sees the pick, then
 * the slot, then the ask; stacked, each plays as it arrives (globals.css,
 * `--scene-delay`). A switch plays them again (play-on-view.tsx). The
 * hairline over each step fills with the brand green as it scrolls up, where
 * the browser has scroll-driven animation; elsewhere it stays a hairline.
 */
function HowItWorks() {
  return (
    <section aria-labelledby="how" className={HAIRLINE}>
      <Container className={SECTION}>
        <div data-reveal="">
          <SectionHeading id="how">{copy.how.title}</SectionHeading>
          <ol className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-12 md:mt-10 md:grid-cols-3 md:gap-6 lg:gap-10">
            {copy.how.steps.map((step, index) => {
              const { Scene, key } = SCENES[index] ?? SCENES[0];
              return (
                <li key={step.title} className="how-step flex flex-col">
                  <PlayOnView className="how-scene h-[272px] overflow-clip rounded-xl bg-bg-surface p-5">
                    {MEDIA.map((medium) => (
                      <div
                        key={medium}
                        data-medium-only={medium}
                        role="img"
                        aria-label={copy.how.scenes[medium][key].label}
                        className="h-full"
                      >
                        <Scene medium={medium} />
                      </div>
                    ))}
                  </PlayOnView>
                  <div className="step-rule relative mt-6 border-t border-border-separator pt-5">
                    <span aria-hidden="true" className="step-fill" />
                    <p className="text-subheadline font-semibold text-accent-text tabular-nums">{index + 1}</p>
                    <h3 className="mt-2 text-title-3 tracking-[-0.017em]">{step.title}</h3>
                    <p className="mt-2 text-body text-pretty text-text-secondary">
                      <ByMedium text={step.body} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>
    </section>
  );
}

/**
 * The four framing points as one strip of short cards (site brief, reaction
 * inference a). Four across from desktop, two per row from 640 px and one
 * below it (the round-three cards are longer), under a
 * heading like every other section's, so the page keeps one rhythm.
 */
function Vision() {
  return (
    <section aria-labelledby="why" className={HAIRLINE}>
      <Container className={SECTION}>
        <div data-reveal="">
          <SectionHeading id="why">{copy.vision.title}</SectionHeading>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:mt-10 md:gap-4 lg:grid-cols-4">
            {copy.vision.points.map((point) => (
              <li
                key={point.id}
                className="rounded-xl border border-transparent bg-bg-surface p-4 transition-colors duration-200 hover:border-border-separator sm:p-6"
              >
                <h3 className="text-headline text-balance">{point.title}</h3>
                <p className="mt-2 text-subheadline text-pretty text-text-secondary">
                  <MaybeByMedium text={point.body} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

/** The games side's four phones (finalize round): the real shots alone, Home, Search, compare and Ranking. */
const GAMES_PHONES = productRow.map((shot) => <PhoneShot key={shot.src} shot={shot} width="100%" />);

/** The movies side's four, drawn live in the games row's order: Home, Search, the compare step, Ranking. */
const MOVIES_PHONES = [
  <MoviesHomePhone key="home" width="100%" />,
  <MoviesSearchPhone key="search" width="100%" />,
  <MoviesComparePhone key="compare" width="100%" />,
  <MoviesRankingPhone key="ranking" width="100%" />,
];

/**
 * Phones side by side, one strip per medium. Games: the four real screens,
 * the app's web build at phone size (shots.ts). Movies: the movies Home,
 * Search, the compare step with scene 1's films and Ranking, all drawn live
 * on the tokens (movie-screens.tsx).
 *
 * Interactive strip (2026-10-08): from 768 px each row has one large phone,
 * Home first, at 320 px beside three at 200 (scaled down together where the
 * column is narrower), and a click on a small phone makes it the large one,
 * with its one-line caption under it (feature-strip.tsx; the sizes and the
 * motion in globals.css, "The strip"). The phones meet on their vertical
 * middles at every frame. Below 768 px each is the row that scrolls sideways
 * and snaps to each frame, as before (the page itself never scrolls
 * sideways).
 */
function Product() {
  return (
    <section aria-labelledby="product" className="bg-bg-surface">
      <Container className={SECTION}>
        <div data-reveal="">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-8">
            <SectionHeading id="product">{copy.product.title}</SectionHeading>
            <p className="text-subheadline text-text-secondary">
              <ByMedium text={copy.product.caption} />
            </p>
          </div>
          <FeatureStrip
            medium="games"
            label={copy.product.rowLabel.games}
            phones={GAMES_PHONES}
            screens={copy.product.screens.games}
          />
          <FeatureStrip
            medium="movies"
            lead
            label={copy.product.rowLabel.movies}
            phones={MOVIES_PHONES}
            screens={copy.product.screens.movies}
          />
        </div>
      </Container>
    </section>
  );
}

function Faq() {
  return (
    <section aria-labelledby="faq">
      <Container className={SECTION}>
        <div data-reveal="" className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-16">
          <SectionHeading id="faq">{copy.faq.title}</SectionHeading>
          <div className="border-t border-border-separator">
            {copy.faq.items.map((item) => (
              <details key={item.question} className="group border-b border-border-separator">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm py-5 text-headline transition-colors duration-150 hover:text-text-secondary">
                  {item.question}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-5 shrink-0 text-text-secondary transition-transform duration-300 ease-(--ease-site) group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                {/* Rafa's answers: his draft where he has given one (round five), else the placeholder; round three's drafts are in copy.ts beside each question. */}
                {'answer' in item ? (
                  <p className="faq-answer max-w-[600px] pb-6 text-body text-pretty text-text-secondary">{item.answer}</p>
                ) : (
                  <p className="faq-answer max-w-[600px] pb-6 text-body text-pretty text-text-secondary italic">
                    {copy.faq.pending}
                  </p>
                )}
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function Access() {
  return (
    <section aria-labelledby="access">
      <Container className="pb-16 md:pb-20 lg:pb-24">
        <div
          data-reveal=""
          className="flex flex-col items-center rounded-xl bg-bg-surface px-6 py-14 text-center md:py-16"
        >
          <SectionHeading id="access">{copy.access.title}</SectionHeading>
          <p className="mt-3 max-w-[460px] text-body text-pretty text-text-secondary">{copy.access.body}</p>
          <div className="mt-8">
            <ButtonLink href={ACCESS_HREF}>{copy.nav.requestAccess}</ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
