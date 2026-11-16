import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Pause, Play, SkipForward, StepForward } from "lucide-react";
import { errorMessage, useAutomaton } from "@/lib/api";
import { runDfa } from "@/lib/automata";
import { showString } from "@/lib/meta";
import type { DfaPayload, Language } from "@/lib/types";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { layoutGraph, toGraphModel } from "@/components/graph/layout";
import { Tape } from "@/components/tape/Tape";
import { Button, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { cn } from "@/lib/utils";
import { accessStrings, demoSamples, hashSeed, setNotation, stateNotes } from "./explore-utils";

const RADIUS = 22;
const SAMPLES = 8;
/** Below this drawing scale state labels stop being legible; the sheet then scrolls sideways instead. */
const MIN_SCALE = 0.6;
const PAN_FADE = "linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent)";

/** Content-box size of an element, kept in sync with a ResizeObserver. */
function useBoxSize<T extends HTMLElement>(fallback: { width: number; height: number }) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Four L-shaped corner marks, like the registration marks on a drawing sheet. */
function CornerMarks() {
  const mark = "pointer-events-none absolute h-3 w-3 border-line-strong";
  return (
    <>
      <span aria-hidden className={cn(mark, "left-2 top-2 border-l border-t")} />
      <span aria-hidden className={cn(mark, "right-2 top-2 border-r border-t")} />
      <span aria-hidden className={cn(mark, "bottom-2 left-2 border-b border-l")} />
      <span aria-hidden className={cn(mark, "bottom-2 right-2 border-b border-r")} />
    </>
  );
}

// ------------------------------------------------------------------ the running machine
function MachineDemo({ dfa, language, running }: { dfa: DfaPayload; language: Language; running: boolean }) {
  const reduce = useReducedMotion() ?? false;
  const notes = useMemo(() => stateNotes(dfa), [dfa]);
  const access = useMemo(() => accessStrings(dfa), [dfa]);
  const accepting = useMemo(() => new Set(dfa.accepting), [dfa]);
  const layout = useMemo(() => layoutGraph(toGraphModel(dfa), { rankdir: "LR", r: RADIUS }), [dfa]);
  const samples = useMemo(() => {
    const list = demoSamples(dfa, SAMPLES, hashSeed(language.id), 3, 8);
    return list.length ? list : [{ string: "", accepted: runDfa(dfa, "").accepted }];
  }, [dfa, language.id]);

  const [sampleIdx, setSampleIdx] = useState(0);
  const [consumed, setConsumed] = useState(() => (reduce ? Number.POSITIVE_INFINITY : 0));
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [boxRef, box] = useBoxSize<HTMLDivElement>({ width: 560, height: 240 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Automata lay out as long chains. If the whole machine would be drawn too small to read (L9 on a
  // phone), draw it at a legible scale on a sheet that scrolls sideways and follows the read head.
  const pan = Math.min(box.width / layout.width, box.height / layout.height) < MIN_SCALE;

  const highlight = hovered ?? pinned;
  const sample = samples[sampleIdx % samples.length];
  const run = useMemo(() => runDfa(dfa, sample.string), [dfa, sample.string]);
  const n = run.steps.length;
  const c = Math.min(consumed, n);
  const done = c >= n;
  const playing = !paused && !reduce && highlight === null;
  const autoplay = running && playing;

  useEffect(() => {
    if (!autoplay) return;
    const delay = done ? 1900 : c === 0 ? 750 : 560;
    const t = window.setTimeout(() => {
      if (done) {
        setSampleIdx((i) => (i + 1) % samples.length);
        setConsumed(0);
      } else {
        setConsumed(c + 1);
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [autoplay, done, c, sampleIdx, samples.length]);

  const verdictText = (accepted: boolean, final: string | null) =>
    `${accepted ? "accepted" : "rejected"}, it ends in ${final ?? "no state"}${final && accepting.has(final) ? ", an accepting state" : ""}`;

  const step = () => {
    setPaused(true);
    setPinned(null);
    if (done) {
      setSampleIdx((i) => (i + 1) % samples.length);
      setConsumed(0);
      setAnnouncement("");
      return;
    }
    const next = c + 1;
    setConsumed(next);
    if (next >= n) setAnnouncement(`${showString(sample.string)}: ${verdictText(run.accepted, run.final)}.`);
  };

  const nextString = () => {
    setPinned(null);
    const j = (sampleIdx + 1) % samples.length;
    setSampleIdx(j);
    if (reduce || paused) {
      setConsumed(Number.POSITIVE_INFINITY);
      const s = samples[j].string;
      const r = runDfa(dfa, s);
      setAnnouncement(`${showString(s)}: ${verdictText(r.accepted, r.final)}.`);
    } else {
      setConsumed(0);
    }
  };

  // ---------------------------------------------------------------- what to light up
  const last = c > 0 ? run.steps[c - 1] : null;
  const current = highlight ?? (last ? last.to : dfa.start);
  const verdict = highlight || !done ? null : run.accepted ? "accept" : "reject";

  useEffect(() => {
    const el = scrollerRef.current;
    const node = layout.nodes.find((nd) => nd.id === current);
    if (!pan || !el || !node) return;
    el.scrollTo({ left: Math.max(0, node.x * MIN_SCALE - el.clientWidth / 2), behavior: reduce ? "auto" : "smooth" });
  }, [pan, current, layout, reduce]);

  let narration: ReactNode;
  if (highlight) {
    const way = access[highlight];
    narration = (
      <>
        <span className="font-mono text-lamp">{highlight}</span>
        {notes[highlight] ? <span className="text-ink">: {notes[highlight]}</span> : null}
        <span className="text-muted">
          {highlight === dfa.start ? ". The start state." : way !== undefined ? `. First reached by reading ${way}.` : ". Unreachable from the start."}
        </span>
      </>
    );
  } else if (!last) {
    narration = (
      <>
        <span className="text-muted">Start in </span>
        <span className="font-mono text-lamp">{dfa.start}</span>
        {notes[dfa.start] && <span className="text-ink-2">, {notes[dfa.start]}</span>}
      </>
    );
  } else if (!done) {
    narration = (
      <>
        <span className="text-muted">Read </span>
        <span className="font-mono text-ink">{last.symbol}</span>
        <span className="text-muted">: </span>
        <span className="font-mono text-ink-2">{last.from}</span>
        <span className="text-muted"> to </span>
        <span className="font-mono text-lamp">{last.to}</span>
        {notes[last.to] && <span className="text-ink-2">, {notes[last.to]}</span>}
      </>
    );
  } else {
    narration = (
      <>
        <span className={cn("font-medium", run.accepted ? "text-accept" : "text-reject")}>{run.accepted ? "Accepted" : "Rejected"}</span>
        <span className="text-muted">: it ends in </span>
        <span className={cn("font-mono", run.accepted ? "text-accept" : "text-reject")}>{run.final}</span>
        <span className="text-ink-2">{run.final && accepting.has(run.final) ? ", an accepting state" : ", which is not accepting"}</span>
      </>
    );
  }

  const iconButton =
    "inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink";

  return (
    <div>
      {/* the drawing sheet with the ground-truth DFA */}
      <div ref={boxRef} className="grid-paper relative grid h-[230px] place-items-center rounded-2xl border border-line px-4 py-5 sm:h-[260px] lg:h-[280px]">
        <CornerMarks />
        <div
          ref={scrollerRef}
          className={cn("w-full", pan && "no-scrollbar overflow-x-auto")}
          style={pan ? { maskImage: PAN_FADE, WebkitMaskImage: PAN_FADE } : undefined}
          tabIndex={pan ? 0 : undefined}
          role={pan ? "group" : undefined}
          aria-label={pan ? "State diagram, scrolls sideways" : undefined}
        >
          <div className="mx-auto" style={pan ? { width: Math.round(layout.width * MIN_SCALE) } : { maxWidth: Math.round(layout.width * 1.55) }}>
            <AutomatonGraph
              automaton={dfa}
            active={[current]}
            activeEdge={highlight || !last ? null : { from: last.from, to: last.to }}
            tokenKey={`${sampleIdx}-${c}`}
            verdict={verdict}
            notes={notes}
            radius={RADIUS}
            zoomable={false}
            maxHeight={pan ? Math.ceil(layout.height * MIN_SCALE) + 2 : Math.max(120, box.height - 4)}
            onStateClick={(q) => {
              setPinned((p) => (p === q ? null : q));
              setHovered(null);
            }}
              ariaLabel={`Ground-truth DFA for ${language.id} with ${dfa.states.length} states. Start state ${dfa.start}; accepting ${dfa.accepting.join(", ") || "none"}.`}
            />
          </div>
        </div>
      </div>

      {/* narration: what the machine just did (a div: the global p style would undo truncate) */}
      <div className="mt-4 min-h-[1.5rem] truncate text-[15px]" aria-hidden>
        {narration}
      </div>

      {/* the tape and its verdict */}
      <div className="mt-1 flex items-end gap-3" aria-hidden={autoplay}>
        <Tape
          input={sample.string}
          head={c}
          status={done ? (run.accepted ? "accepted" : "rejected") : c === 0 ? "idle" : "running"}
          size="md"
          className="min-w-0 flex-1"
          label="Sample string"
        />
        <div className="mb-1.5 hidden w-[92px] shrink-0 sm:block">
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.span
                key={`${sampleIdx}-${run.accepted}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.5, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: -4 }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0.1 } : { type: "spring", stiffness: 520, damping: 22 }}
                className={cn(
                  "inline-block rounded-md border-[3px] border-double px-2 py-0.5 font-mono text-[13px] font-semibold",
                  run.accepted ? "border-[color:var(--accept)] text-accept" : "border-[color:var(--reject)] text-reject",
                )}
              >
                {run.accepted ? "accepted" : "rejected"}
              </motion.span>
            ) : (
              <motion.span key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[13px] text-muted">
                reading…
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* manual control (pausing is also required for auto-playing content) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!reduce && (
          <button
            type="button"
            className={iconButton}
            onClick={() => {
              if (playing) {
                setPaused(true);
              } else {
                setPinned(null);
                setHovered(null);
                setPaused(false);
              }
            }}
          >
            {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            {playing ? "Pause" : "Play"}
          </button>
        )}
        <button type="button" className={iconButton} onClick={step}>
          <StepForward size={14} aria-hidden />
          Step
        </button>
        <button type="button" className={iconButton} onClick={nextString}>
          <SkipForward size={14} aria-hidden />
          Next string
        </button>
        <span className="ml-auto hidden font-mono text-xs text-muted tabular sm:inline">
          string {(sampleIdx % samples.length) + 1} of {samples.length}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* what each state remembers; hover or focus to light it up, click to pin */}
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-sm text-ink-2">
          What each state remembers <span className="text-muted">(hover to find it in the diagram, click to pin it)</span>
        </p>
        <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
          {dfa.states.map((q) => {
            const lit = highlight === q || (!highlight && current === q);
            return (
              <li key={q}>
                <button
                  type="button"
                  aria-pressed={pinned === q}
                  onPointerEnter={() => setHovered(q)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(q)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setPinned((p) => (p === q ? null : q))}
                  style={{ borderRadius: 10 }}
                  className={cn(
                    "flex w-full items-baseline gap-2.5 px-2.5 py-1.5 text-left transition-colors duration-200",
                    lit ? "bg-lamp-soft" : "hover:bg-panel-2/60",
                    pinned === q && "ring-1 ring-[color:var(--lamp)]",
                  )}
                >
                  <span className={cn("w-12 shrink-0 font-mono text-[13px] font-medium transition-colors duration-200", lit ? "text-lamp" : "text-ink")}>
                    {q}
                    {accepting.has(q) && (
                      <span className="ml-1 text-accept" title="Accepting state">
                        ◎
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 text-[13px] leading-snug text-ink-2">
                    {notes[q] ?? (accepting.has(q) ? "accepting" : "")}
                    {accepting.has(q) && <span className="sr-only"> (accepting state)</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function StageSkeleton() {
  return (
    <div role="status" aria-label="Loading the ground-truth DFA">
      <Skeleton className="h-[220px] rounded-2xl sm:h-[260px] lg:h-[280px]" />
      <Skeleton className="mt-4 h-5 w-2/3" />
      <Skeleton className="mt-3 h-12 w-full" />
      <Skeleton className="mt-6 h-24 w-full" />
    </div>
  );
}

// ------------------------------------------------------------------ the stage
export function LanguageStage({ language, onChoose }: { language: Language; onChoose: () => void }) {
  const query = useAutomaton(language.id, "dfa");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const automaton = query.data?.automaton;
  const dfa = automaton && automaton.kind === "dfa" ? automaton : undefined;

  return (
    <div ref={ref} className="relative rounded-[22px] border border-line bg-panel/85 p-5 shadow-[var(--shadow)] backdrop-blur-sm sm:p-7">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={language.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <h3 className="flex min-w-0 items-baseline gap-3 font-display font-semibold">
              <span className="text-4xl text-lamp tabular">{language.id}</span>
              <span className="min-w-0 text-2xl text-ink sm:text-[28px]">{language.name}</span>
            </h3>
            <div className="flex items-center gap-2 pt-1.5">
              <span className="flex gap-1" title={`Alphabet ${setNotation(language.alphabet)}`}>
                {language.alphabet.map((sym) => (
                  <span key={sym} className="grid h-7 w-7 place-items-center rounded-md border border-line-strong bg-panel font-mono text-sm text-ink">
                    {sym}
                  </span>
                ))}
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <code className="no-scrollbar max-w-full overflow-x-auto whitespace-nowrap rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 font-mono text-[14px] text-ink sm:text-[15px]">
              <DecryptedText text={language.regex} animateOn="view" sequential speed={28} useOriginalCharsOnly encryptedClassName="text-lamp" />
            </code>
            <span className="text-sm text-muted">
              {language.difficulty} for the ML pipelines, minimal <Term k="dfa">DFA</Term> with {language.expected_min_states} states
            </span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{language.description}</p>
        </motion.div>
      </AnimatePresence>

      <div className="mt-6">
        {query.isPending ? (
          <StageSkeleton />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : dfa ? (
          <MachineDemo key={language.id} dfa={dfa} language={language} running={inView} />
        ) : (
          <ErrorState message={`The backend sent no DFA for ${language.id}.`} onRetry={() => void query.refetch()} />
        )}
      </div>

      <div className="mt-6 grid items-end gap-4 border-t border-line pt-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <p className="text-sm leading-relaxed text-ink-2">
          <span className="font-medium text-ink">Why ML finds it {language.difficulty}: </span>
          {language.ml_note}
        </p>
        <Button onClick={onChoose} className="justify-self-start sm:justify-self-end">
          Choose an approach for {language.id}
        </Button>
      </div>
    </div>
  );
}
