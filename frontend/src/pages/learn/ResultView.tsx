import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { useLenis } from "@/components/layout/SmoothScroll";
import { Button, Stat } from "@/components/ui/primitives";
import { useLearnClassify } from "@/lib/api";
import type { LearnClassifyResult, LearnResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HowLearned, MlFit } from "./Insights";
import { LEARNER_BY_ID } from "./LearnerPicker";
import { MachinePanel } from "./Machine";
import { ms, plural, randomTestString, type Frame, type Outcome, type Run } from "./model";
import { MyhillNerode } from "./MyhillNerode";
import type { Preset } from "./presets";
import { RuleCheck } from "./RuleCheck";
import { TestBench } from "./TestBench";

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** The brief's teaching notes for tiny and trivial results, from the returned data. */
function teachingNotes(result: LearnResult): string[] {
  const notes: string[] = [];
  if (result.samples < 6) {
    notes.push(`With only ${plural(result.samples, "example")}, this is the simplest machine that fits. Add a string it gets wrong.`);
  }
  if (result.states === 1) {
    const acceptsAll = result.automaton.accepting.length > 0;
    const wrong = result.samples - result.fits_samples;
    if (result.negatives === 0) notes.push("Every sample was accepted, so the simplest machine accepts everything.");
    else if (result.positives === 0) notes.push("Every sample was rejected, so the simplest machine rejects everything.");
    else
      notes.push(
        `One state that ${acceptsAll ? "accepts" : "rejects"} everything is the simplest guess${wrong > 0 ? `, and it gets ${plural(wrong, "example")} wrong` : ""}. Add more examples near the boundary.`,
      );
  }
  return notes;
}

/**
 * Everything about one learned machine. Mounted per learning session (keyed by session id), so the
 * graph draws itself in afresh and the test history starts empty for every new machine.
 */
export function ResultView({
  outcome,
  stale,
  busy,
  preset,
  onRelearn,
  onAddCounterexample,
}: {
  outcome: Outcome;
  stale: boolean;
  busy: boolean;
  preset: Preset | null;
  onRelearn: () => void;
  onAddCounterexample: (s: string, accepted: boolean) => void;
}) {
  const result = outcome.data;
  const meta = LEARNER_BY_ID[outcome.learner];
  const classify = useLearnClassify();
  const [input, setInput] = useState(() => randomTestString(result.alphabet, 8, 12));
  const [run, setRun] = useState<Run | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [history, setHistory] = useState<LearnClassifyResult[]>([]);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const counter = useRef(0);
  const benchRef = useRef<HTMLDivElement>(null);
  const machineRef = useRef<HTMLDivElement>(null);
  const lenis = useLenis();
  const reduce = useReducedMotion();
  const bring = useCallback(
    (el: HTMLElement | null, offset = -88) => {
      if (!el) return;
      if (lenis) lenis.scrollTo(el, { offset, duration: 0.9 });
      else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    },
    [lenis, reduce],
  );
  // On one-column layouts the machine sits above the bench: show it when a string starts running.
  useEffect(() => {
    if (!run || !window.matchMedia("(max-width: 1023px)").matches) return;
    const el = machineRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 64 || top > window.innerHeight * 0.4) bring(el);
  }, [run, bring]);

  const play = (r: LearnClassifyResult) => {
    counter.current += 1;
    setFrame(null);
    setRun({ id: counter.current, result: r });
  };
  const test = (s: string) =>
    classify.mutate(
      { sessionId: result.session_id, string: s },
      {
        onSuccess: (r) => {
          play(r);
          setHistory((h) => [r, ...h.filter((x) => x.string !== r.string)].slice(0, 10));
        },
      },
    );
  const done = !!(run && frame && frame.runId === run.id && frame.done);
  const fitsAll = result.fits_samples === result.samples;
  const notes = teachingNotes(result);

  return (
    <div className="mx-auto max-w-6xl px-6">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h2 id="result-title" className="font-display text-4xl font-semibold text-ink md:text-5xl">
              A {result.states}-state machine that fits {fitsAll ? `all ${result.samples}` : `${result.fits_samples} of ${result.samples}`} examples
            </h2>
            <p className="mt-3 text-lg text-ink-2">
              {meta.mode === "passive" ? `Learned by ${meta.name}` : `Extracted by L* from a ${meta.name.split(" + ")[0].toLowerCase()}`} in{" "}
              {ms(result.learn_time_ms)}
              {typeof result.minimized_from === "number" && result.minimized_from !== result.states
                ? `, then minimized from ${plural(result.minimized_from, "state")}.`
                : ", already minimal."}
            </p>
            {notes.map((note) => (
              <p key={note} className="mt-3 border-l-2 border-line-strong pl-3 text-ink-2">
                {note}
              </p>
            ))}
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <Stat value={result.states} label={result.states === 1 ? "state" : "states"} hint={`${result.automaton.num_transitions} transitions`} />
          <Stat value={`${result.fits_samples}/${result.samples}`} label="examples fitted" hint={`${result.positives} accepted, ${result.negatives} rejected`} />
          {typeof result.stats.pta_states === "number" ? (
            <Stat value={result.stats.pta_states} label="prefix-tree states" hint="before any merging" />
          ) : typeof result.stats.membership_queries === "number" ? (
            <Stat value={result.stats.membership_queries.toLocaleString("en-US")} label="membership queries" hint="strings L* asked the model about" />
          ) : (
            <Stat value={result.minimized_from ?? result.states} label="states before minimizing" />
          )}
          <Stat value={ms(result.learn_time_ms)} label="learning time" />
        </div>
      </Reveal>

      {stale && (
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel/85 px-4 py-3 text-sm text-ink shadow-[inset_3px_0_0_var(--line-strong)]" role="status">
          <RefreshCw size={16} className="shrink-0 text-ink-2" aria-hidden />
          <span className="min-w-0 flex-1">Your examples or learner changed since this machine was learned.</span>
          <Button size="sm" onClick={onRelearn} loading={busy}>
            Learn again
          </Button>
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
        <div ref={machineRef} className="min-w-0 scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <Reveal>
            <MachinePanel result={result} run={run} frame={frame} onFrame={setFrame} pair={pair} busy={busy} />
          </Reveal>
        </div>

        <div className={cn("min-w-0 space-y-10 transition-opacity duration-300", busy && "pointer-events-none opacity-60")} aria-busy={busy}>
          <Reveal delay={0.1}>
            <div ref={benchRef} className="relative rounded-3xl border border-line bg-panel/85 p-5 shadow-[var(--shadow)] sm:p-6">
              <TestBench
                alphabet={result.alphabet}
                input={input}
                onInput={setInput}
                onTest={test}
                pending={classify.isPending}
                error={classify.error}
                run={run}
                done={done}
                history={history}
                onReplay={play}
                onRelearn={onRelearn}
              />
            </div>
          </Reveal>

          {preset && outcome.presetId === preset.id && (
            <RuleCheck
              preset={preset}
              result={result}
              busy={busy}
              onAddCounterexample={onAddCounterexample}
              onTryString={(s) => {
                setInput(s);
                test(s);
                bring(benchRef.current, -120);
              }}
            />
          )}

          <Reveal>
            <HowLearned result={result} samples={outcome.samples} />
          </Reveal>
          <Reveal>
            <MlFit result={result} />
          </Reveal>
          <Reveal>
            <MyhillNerode dfa={result.automaton} rows={result.distinguishing_suffixes} pair={pair} onPair={setPair} />
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/** Before the first machine: a ghost of one, waiting to be drawn. */
export function EmptyResult({ busy, count }: { busy: boolean; count: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="relative overflow-hidden rounded-3xl border border-dashed border-line-strong bg-panel/40">
        <div className="grid-paper absolute inset-0 opacity-70" aria-hidden />
        <div className="relative grid items-center gap-8 px-6 py-12 md:grid-cols-[1fr_1.2fr] md:px-12 md:py-16">
          <div className="space-y-3">
            <h2 id="result-title" className="font-display text-3xl font-semibold text-ink">
              {busy ? "Learning…" : "Your machine will be drawn here"}
            </h2>
            <p className="text-ink-2" aria-live="polite">
              {busy
                ? `Building a DFA from ${plural(count, "example")} and training three ML models on the same strings.`
                : "Press “Learn the automaton” and the learner turns your examples into a state diagram you can run strings through."}
            </p>
          </div>
          <svg viewBox="0 0 360 150" className="w-full max-w-md justify-self-center text-line-strong" aria-hidden>
            <defs>
              <marker id="ghost-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,1 L10,5 L0,9 z" fill="var(--line-strong)" />
              </marker>
            </defs>
            <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="5 5">
              <line x1="10" y1="70" x2="50" y2="70" markerEnd="url(#ghost-arrow)" />
              <circle cx="78" cy="70" r="26" />
              <circle cx="186" cy="70" r="26" />
              <circle cx="294" cy="70" r="26" />
              <circle cx="294" cy="70" r="20" />
              <line x1="104" y1="70" x2="157" y2="70" markerEnd="url(#ghost-arrow)" />
              <line x1="212" y1="70" x2="265" y2="70" markerEnd="url(#ghost-arrow)" />
              <path d="M174 47 C160 6 212 6 198 47" markerEnd="url(#ghost-arrow)" />
              <path d="M286 95 C250 146 122 146 86 96" markerEnd="url(#ghost-arrow)" />
            </g>
            {busy && !reduce && (
              <motion.circle
                r="5.5"
                fill="var(--lamp)"
                style={{ filter: "drop-shadow(0 0 6px var(--lamp))" }}
                initial={{ cx: 78, cy: 70 }}
                animate={{ cx: [78, 186, 294, 294, 78], cy: [70, 70, 70, 70, 70] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
