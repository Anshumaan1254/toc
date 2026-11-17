import { useCallback, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLenis } from "@/components/layout/SmoothScroll";
import { Term } from "@/components/ui/Term";
import { useDataset, useSummary } from "@/lib/api";
import { int } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { useMediaQuery, useRefreshOnResize } from "../parts/a/hooks";
import { CompareMeters, LengthHistogram, ModelGlyphs, ObservationTable, TransitionTable } from "../parts/a/objectives/visuals";
import { numberWord } from "../parts/a/text";
import { CropMarks, InlineSkeleton } from "../parts/a/ui";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Horizontal sweep only where there is room for it and motion is welcome. */
const SWEEP_QUERY = "(min-width: 1024px) and (min-height: 640px)";
/** Panel width, gap and side padding of the sweep track (the padding lines up with max-w-6xl). */
const PANEL_W = "min(74vw, 1040px)";
const GAP = "4vw";
const PAD = "max(1.5rem, calc((100vw - 72rem) / 2 + 1.5rem))";
/** Empty holds at both ends of the pin: the first station sits still as the heading sticks, the last as it releases. */
const HOLD = 0.08;
/** Scroll progress of the pin (0..1) to progress of the sideways travel (0..1). */
const travelOf = (p: number) => Math.min(1, Math.max(0, (p - HOLD) / (1 - 2 * HOLD)));

interface Objective {
  id: string;
  short: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
  link?: { to: string; label: string };
}

/**
 * The five objectives of the brief as a pinned horizontal sweep: the page scroll drives a
 * track of drawings sideways while a tape at the top shows which objective is under the head.
 * The pin is CSS sticky (the app's <main> keeps a CSS filter, which would break a fixed pin).
 * Narrow or short screens and reduced motion get a plain vertical stack.
 */
export function ObjectivesChapter() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const reduce = useReducedMotion();
  const roomy = useMediaQuery(SWEEP_QUERY);
  const sweep = roomy && !reduce;
  const lenis = useLenis();
  const progress = useMotionValue(0);
  const [active, setActive] = useState(0);
  const summary = useSummary();
  useRefreshOnResize(sectionRef);

  const dataset = useDataset();
  const rows = summary.data?.meta.dataset_rows;
  const langs = summary.data?.languages.length;
  const features = summary.data?.meta.feature_count_binary;
  const trainMax = summary.data?.meta.max_train_length;
  const longBuckets = dataset.data?.config.buckets.filter((b) => b.pool === "long") ?? [];
  const longRange = longBuckets.length ? { lo: Math.min(...longBuckets.map((b) => b.lo)), hi: Math.max(...longBuckets.map((b) => b.hi)) } : null;
  const n = (v: number | undefined | null, w = "w-[1.4em]") => (v === undefined || v === null ? <InlineSkeleton className={w} /> : v);

  const objectives: Objective[] = [
    {
      id: "data",
      short: "Data",
      title: "Generate the datasets",
      body: (
        <>
          Label strings for {langs ? numberWord(langs) : <InlineSkeleton />} regular languages with their ground-truth DFAs:{" "}
          {rows ? int(rows) : <InlineSkeleton />} strings in all. Strings of up to {n(trainMax)} symbols are split into training, validation and
          test sets; strings of {n(longRange?.lo)} to {n(longRange?.hi)} symbols are kept back to test{" "}
          <Term k="generalization">generalization</Term>.
        </>
      ),
      visual: <LengthHistogram />,
    },
    {
      id: "dfa",
      short: "Automata",
      title: "Build, run and minimize DFAs",
      body: (
        <>
          Write a DFA and an NFA for every language, convert NFAs with the <Term k="subset-construction">subset construction</Term>, process
          strings one transition at a time and shrink each machine with <Term k="hopcroft">Hopcroft&apos;s algorithm</Term>, checked against
          Moore&apos;s rounds.
        </>
      ),
      visual: <TransitionTable />,
      link: { to: "/explore/L8/min_dfa", label: "Open the L8 minimization" },
    },
    {
      id: "ml",
      short: "Classifiers",
      title: "Train classifiers on the strings",
      body: (
        <>
          Turn each string into {features ? features : <InlineSkeleton className="w-[2em]" />} generic features and train logistic regression, a
          decision tree and a random forest, plus a <Term k="stacking">stacked ensemble</Term> of the three, tuned on the validation split.
        </>
      ),
      visual: <ModelGlyphs />,
      link: { to: "/explore", label: "Browse every model" },
    },
    {
      id: "learn",
      short: "Learning",
      title: "Learn the automaton back",
      body: (
        <>
          Ask each trained classifier <Term k="membership-query">membership queries</Term> with <Term k="lstar">L*</Term> to extract the DFA it
          implements, and learn DFAs straight from the labelled strings with <Term k="rpni">RPNI</Term> and <Term k="edsm">EDSM</Term>.
        </>
      ),
      visual: <ObservationTable />,
      link: { to: "/learn", label: "Train RPNI on your own examples" },
    },
    {
      id: "compare",
      short: "Comparison",
      title: "Compare everything",
      body: (
        <>
          Put machines and models side by side on accuracy, size, the time it takes to classify one string, and how well each copes with strings
          longer than any it was trained on.
        </>
      ),
      visual: <CompareMeters />,
      link: { to: "/compare", label: "Run one string through all 13 approaches" },
    },
  ];
  const count = objectives.length;

  useGSAP(
    () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!sweep || !section || !track) return;
      const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const t = travelOf(self.progress);
            progress.set(t);
            setActive(Math.min(count - 1, Math.round(t * (count - 1))));
          },
        },
      });
      tl.to({}, { duration: HOLD })
        .to(track, { x: () => -distance(), ease: "none", duration: 1 - 2 * HOLD })
        .to({}, { duration: HOLD });
      triggerRef.current = tl.scrollTrigger ?? null;
      return () => {
        triggerRef.current = null;
        progress.set(0);
        setActive(0);
      };
    },
    { scope: sectionRef, dependencies: [sweep, count], revertOnUpdate: true },
  );

  /** Scroll the page so objective i sits under the head. */
  const goTo = useCallback(
    (i: number, immediate = false) => {
      const st = triggerRef.current;
      if (!st) return;
      const y = st.start + (st.end - st.start) * (HOLD + ((1 - 2 * HOLD) * i) / Math.max(1, count - 1));
      if (lenis) lenis.scrollTo(y, { immediate, duration: 1.2 });
      else window.scrollTo({ top: y, behavior: immediate ? "auto" : "smooth" });
    },
    [lenis, count],
  );

  /** Keyboard users: tabbing into an off-screen panel brings it under the head. */
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    if (!sweep) return;
    const panel = (e.target as HTMLElement).closest<HTMLElement>("[data-objective]");
    if (!panel) return;
    const i = Number(panel.dataset.objective);
    if (Number.isFinite(i) && i !== active) goTo(i, true);
  };

  const sectionHeight = `calc(116vh + ${count} * ${PANEL_W} + ${count - 1} * ${GAP} + 2 * ${PAD} - 100vw)`;

  return (
    <section
      ref={sectionRef}
      id="objectives"
      aria-labelledby="objectives-title"
      data-sweep={sweep ? "on" : "off"}
      onFocus={onFocus}
      className={cn("relative", sweep ? "" : "py-24 lg:py-32")}
      style={sweep ? { height: sectionHeight } : undefined}
    >
      <div className={cn(sweep && "sticky top-0 flex h-screen flex-col overflow-x-clip")}>
        <div className={cn("mx-auto w-full max-w-6xl px-6", sweep ? "pt-28" : "")}>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div className="max-w-3xl">
              <h2 id="objectives-title" className="font-display text-[clamp(2.2rem,4vw,3.25rem)] font-semibold leading-[1.03] tracking-[-0.015em] text-ink">
                What the project set out to do
              </h2>
              {!sweep && (
                <p className="mt-4 text-lg leading-relaxed text-ink-2">
                  From the brief: build the data, the machines and the models, learn machines back from the models, then compare them all.
                </p>
              )}
            </div>
            {sweep && <ProgressTape labels={objectives.map((o) => o.short)} progress={progress} active={active} onPick={(i) => goTo(i)} />}
          </div>
        </div>

        <div className={cn(sweep ? "relative flex min-h-0 flex-1 items-center" : "mx-auto mt-12 max-w-6xl px-6")}>
          <div
            ref={trackRef}
            className={cn(sweep ? "flex w-max items-stretch will-change-transform" : "flex flex-col gap-20")}
            style={sweep ? { gap: GAP, paddingLeft: PAD, paddingRight: PAD } : undefined}
          >
            {objectives.map((o, i) => (
              <article
                key={o.id}
                data-objective={i}
                aria-labelledby={`objective-${o.id}`}
                className={cn("grid shrink-0 gap-x-10 gap-y-8", sweep ? "h-[min(calc(100vh-16rem),500px)] grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" : "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]")}
                style={sweep ? { width: PANEL_W } : undefined}
              >
                <div className="flex min-w-0 flex-col justify-center">
                  <h3 id={`objective-${o.id}`} className="font-display text-[clamp(1.8rem,2.6vw,2.4rem)] font-semibold leading-[1.05] text-ink">
                    {o.title}
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-ink-2">{o.body}</p>
                  {o.link && (
                    <Link
                      to={o.link.to}
                      className="mt-6 inline-flex w-fit items-center rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-2 hover:bg-panel-2/60"
                    >
                      {o.link.label}
                    </Link>
                  )}
                </div>
                <div className="relative min-h-0 min-w-0">
                  <CropMarks size="h-3 w-3" />
                  <div className="grid-paper flex h-full flex-col justify-center overflow-hidden rounded-md border border-line bg-panel/40 p-5">{o.visual}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Five tape cells with the amber head gliding over them as the sweep advances (amber only on the head). */
function ProgressTape({
  labels,
  progress,
  active,
  onPick,
}: {
  labels: string[];
  progress: MotionValue<number>;
  active: number;
  onPick: (i: number) => void;
}) {
  const n = labels.length;
  const x = useTransform(progress, (p) => `calc(${(p * (n - 1)).toFixed(4)} * (6.6rem + 4px))`);
  return (
    <nav aria-label="Objectives" className="relative">
      <ol className="flex gap-1">
        {labels.map((l, i) => (
          <li key={l} className="w-[6.6rem]">
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={i === active ? "step" : undefined}
              className={cn(
                "h-10 w-full rounded-md border font-mono text-xs transition-colors",
                i === active ? "border-[color:var(--ink-2)] bg-panel text-ink" : i < active ? "border-line bg-panel-2/60 text-muted" : "border-line-strong bg-panel text-ink-2 hover:text-ink",
              )}
            >
              {l}
            </button>
          </li>
        ))}
      </ol>
      {/* the read head */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-4 left-0 flex w-[6.6rem] justify-center" style={{ x }}>
        <svg width="14" height="10" viewBox="0 0 16 12">
          <path d="M1 1 H15 L8 11 Z" fill="var(--lamp)" />
        </svg>
      </motion.div>
    </nav>
  );
}
