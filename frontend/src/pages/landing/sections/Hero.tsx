import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { Link } from "react-router";
import { useInView, useReducedMotion } from "motion/react";
import SplitText from "@/components/reactbits/SplitText";
import { useLenis } from "@/components/layout/SmoothScroll";
import { Term } from "@/components/ui/Term";
import { useSummary } from "@/lib/api";
import { int } from "@/lib/meta";
import { useTheme, useThemeColors } from "@/lib/theme";
import { HeroMachine, type MachineStep } from "../parts/a/HeroMachine";
import { statePoint } from "../parts/a/geometry";
import { PulseGrid, type PulseGridHandle } from "../parts/a/PulseGrid";
import { useLiveGate, useMediaQuery, useRefreshOnResize } from "../parts/a/hooks";
import { numberWord } from "../parts/a/text";
import { InlineSkeleton } from "../parts/a/ui";

const TITLE_A = "Find the machine";
const TITLE_B = "inside the model.";

/**
 * Hero: a live DFA reading strings off a tape, next to the project in one paragraph.
 * The drafting grid behind it is React Bits' RippleGrid (forked as PulseGrid): every symbol the
 * machine reads sends a ripple out from the state the token lands on; a verdict sends a bigger one.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const live = useLiveGate(ref);
  const near = useInView(ref, { margin: "200px 0px 200px 0px" });
  const reduce = useReducedMotion();
  // Below 768px the WebGL grid is not worth its cost: phones get the CSS drafting grid.
  const roomy = useMediaQuery("(min-width: 768px)");
  const { theme } = useTheme();
  const colors = useThemeColors();
  const lenis = useLenis();
  const summary = useSummary();
  const grid = useRef<PulseGridHandle>(null);
  const timers = useRef<number[]>([]);
  useRefreshOnResize(ref);

  // Ripple when the token arrives (it travels for ~0.45 s along the edge).
  const onStep = useCallback((step: MachineStep, graphEl: HTMLElement | null) => {
    const t = window.setTimeout(() => {
      const at = statePoint(step.dfa, step.state, graphEl, 25);
      if (at) grid.current?.pulse(at.x, at.y, step.verdict ? 1 : 0.42);
    }, step.verdict ? 540 : 430);
    timers.current.push(t);
    if (timers.current.length > 12) timers.current.shift();
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const rows = summary.data?.meta.dataset_rows;
  const languageCount = summary.data?.languages.length;
  const pipelineCount = summary.data?.pipelines.length;

  const toResults = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById("results");
    if (!target) return; // no results section yet: let the browser handle the hash
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: -24 });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", "#results");
  };

  const num = (v: number | undefined, words = false) => (v === undefined ? <InlineSkeleton /> : words ? numberWord(v) : int(v));

  return (
    <section ref={ref} aria-labelledby="hero-title" className="relative isolate overflow-x-clip">
      {/* background: the drafting grid (WebGL only while near the viewport and on wide screens, CSS grid otherwise).
          On lg the grid is held back to about a third of its strength behind the text column. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 lg:[mask-image:linear-gradient(to_right,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.35)_38%,black_55%)]"
      >
        {near && !reduce && roomy ? (
          <PulseGrid
            ref={grid}
            key={theme}
            color={theme === "dark" ? colors.line : colors.ink2}
            lightMode={theme === "light"}
            variant="lines"
            cellSize={48}
            lineWidth={1}
            glow={0}
            rippleStrength={0.8}
            rippleSpeed={0.75}
            rippleSize={1.15}
            autoRipple="none"
            mouseInteraction
            clickRipple
            fade={0.8}
            opacity={theme === "dark" ? 0.5 : 0.38}
            paused={!live}
          />
        ) : (
          <div className="grid-paper absolute inset-0 opacity-70" />
        )}
      </div>

      <div className="mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 pb-14 pt-24 lg:pb-10">
        <h1
          id="hero-title"
          aria-label={`${TITLE_A} ${TITLE_B}`}
          className="font-display text-[clamp(2.75rem,5.6vw,5.1rem)] font-semibold leading-[1.0] tracking-[-0.02em] text-ink"
        >
          <span className="block" aria-hidden>
            <SplitText text={TITLE_A} tag="span" splitType="chars" effect="rise" mask delay={26} duration={0.9} trigger="load" textAlign="left" />
          </span>
          <span className="block pb-[0.08em] text-ink-2" aria-hidden>
            <SplitText text={TITLE_B} tag="span" splitType="chars" effect="rise" mask delay={26} duration={0.9} trigger="load" textAlign="left" />
          </span>
        </h1>

        <div className="mt-6 grid items-start gap-x-14 gap-y-10 lg:mt-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
          <div className="max-w-xl lg:pt-2">
            <p className="text-[17px] leading-relaxed text-ink-2">
              A <Term k="dfa">DFA</Term> decides whether a string belongs to a language by reading it one symbol at a time, and it never makes a
              mistake. We generated {num(rows)} labelled strings for {num(languageCount, true)} regular languages, built and minimized a DFA for
              each, and trained {num(pipelineCount, true)} classifiers to tell members from non-members.
              <span className="hidden sm:inline">
                {" "}
                Then we extracted the DFA each classifier had actually learned and compared them all on accuracy, size, speed and strings longer
                than any they were trained on.
              </span>
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* Styled like <Button variant="primary" size="lg">; a Link cannot wrap a button. */}
              <Link
                to="/explore"
                className="inline-flex h-12 items-center justify-center rounded-full bg-lamp px-7 text-base font-medium text-[#1a1203] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98]"
              >
                Explore the models
              </Link>
              <a
                href="#results"
                onClick={toResults}
                className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong bg-[color:var(--bg)]/40 px-7 text-base font-medium text-ink backdrop-blur-sm transition-colors hover:border-ink-2 hover:bg-panel-2/60"
              >
                See the results
              </a>
            </div>
          </div>

          {/* Phones: the live machine comes straight after the headline; the lede and buttons follow. */}
          <HeroMachine live={live} onStep={onStep} className="order-first w-full lg:order-none" />
        </div>
      </div>
    </section>
  );
}
