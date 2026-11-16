import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { FastForward, RotateCcw } from "lucide-react";
import type { CompareResult, DfaPayload, Language } from "@/lib/types";
import { runDfa } from "@/lib/automata";
import { showString } from "@/lib/meta";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { useTracePlayer } from "@/components/graph/useTracePlayer";
import { Tape, type TapeStatus } from "@/components/tape/Tape";
import { Badge, Button, Skeleton, VerdictStamp } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "./hooks";

interface TruthBannerProps {
  language: Language;
  /** The string being compared (null until one is chosen). */
  input: string | null;
  result: CompareResult | null;
  dfa?: DfaPayload;
  dfaFailed: boolean;
  notes?: Record<string, string>;
  maxTrain?: number;
}

function StateName({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[0.92em] text-ink">{children}</span>;
}

/**
 * The answer key. The hand-built DFA defines the language, so its verdict is the ground truth.
 * The banner replays its run locally (tape + read head + lit state) and lands the stamp at the end.
 */
export function TruthBanner({ language, input, result, dfa, dfaFailed, notes, maxTrain }: TruthBannerProps) {
  const reduce = useReducedMotion() ?? false;
  const wide = useMediaQuery("(min-width: 640px)");
  // Observe the <section>, which both the idle and the running branch render: Motion's useInView only
  // watches the element present at mount, so a ref that appears later would never report being in view.
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.3 });

  const run = useMemo(() => (dfa && input !== null ? runDfa(dfa, input) : null), [dfa, input]);
  const steps = run?.steps ?? [];
  const stepMs = Math.round(Math.min(520, Math.max(110, 2600 / Math.max(1, steps.length))));
  const player = useTracePlayer(steps.length, { stepMs });
  const { setStepMs, restart } = player;
  useEffect(() => setStepMs(stepMs), [stepMs, setStepMs]);

  // Play once per string, when the banner is on screen.
  const runKey = run ? `${language.id}|${input}` : null;
  const [started, setStarted] = useState<string | null>(null);
  useEffect(() => {
    if (!runKey || !inView || started === runKey) return;
    setStarted(runKey);
    restart();
  }, [runKey, inView, started, restart]);

  if (input === null) {
    return (
      <section ref={ref} aria-labelledby="truth-title" className="mx-auto max-w-6xl px-6 pt-14">
        <div className="rounded-[28px] border border-dashed border-line-strong px-6 py-12 text-center sm:px-12">
          <h2 id="truth-title" className="font-display text-3xl font-semibold text-ink">
            Pick a string to compare
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">
            Type a string over {"{"}
            {language.alphabet.join(", ")}
            {"}"} or choose an example above. The ground-truth DFA for {language.id} reads it here first, then every other approach gives its verdict below.
          </p>
        </div>
      </section>
    );
  }

  // With reduced motion there is no run to watch: show where it ends straight away.
  const playing = !reduce && started === runKey;
  const index = reduce ? steps.length - 1 : playing ? player.index : -1;
  const done = run ? reduce || (playing && player.done) : result !== null;
  const truth = result?.truth ?? run?.accepted ?? null;
  const consumed = run ? (done ? steps.length : index + 1) : done ? input.length : 0;
  const current = run && dfa ? (index < 0 ? dfa.start : steps[index].to) : null;
  const finalState = run?.final ?? result?.results.find((r) => r.approach === "dfa")?.final_state ?? null;
  const status: TapeStatus = done ? (truth ? "accepted" : "rejected") : playing ? "running" : "idle";
  const edge = playing && index >= 0 && steps[index] ? { from: steps[index].from, to: steps[index].to } : null;
  const shown = showString(input);
  const tapeSize = !wide ? "sm" : input.length > 14 ? "md" : "lg";
  // Larger machines (L8, L9) get the full width of the banner so their states stay legible.
  const bigGraph = (dfa?.states.length ?? 0) > 5;

  const graph = (
    <>
      <div
        className={cn(
          "flex flex-1 items-center rounded-2xl border border-line bg-[color:var(--bg)]/55 p-3 sm:p-4",
          bigGraph && "no-scrollbar overflow-x-auto lg:overflow-visible",
        )}
        data-lenis-prevent={bigGraph ? true : undefined}
      >
        {dfa ? (
          <AutomatonGraph
            className={bigGraph ? "min-w-[36rem] lg:min-w-0" : undefined}
            automaton={dfa}
            active={current ? [current] : []}
            activeEdge={edge}
            tokenKey={index}
            verdict={done ? (truth ? "accept" : "reject") : null}
            notes={notes}
            zoomable={false}
            maxHeight={bigGraph ? 340 : 300}
            ariaLabel={`Ground-truth DFA for ${language.id} with ${dfa.states.length} states; ${
              done && finalState ? `the run ends in ${finalState}` : current ? `currently in ${current}` : "waiting to run"
            }.`}
          />
        ) : dfaFailed ? (
          <p className="w-full py-10 text-center text-sm text-muted">The diagram of the ground-truth DFA could not be loaded.</p>
        ) : (
          <Skeleton className="h-52 w-full" />
        )}
      </div>
      {dfa && (
        <p className="mt-2 text-xs text-muted">
          {dfa.states.length} states. Double circles are accepting states; amber marks the transition just taken.
          {bigGraph && <span className="lg:hidden"> Swipe sideways to see the whole machine.</span>}
        </p>
      )}
    </>
  );

  let sentence: ReactNode;
  if (!done) {
    sentence = (
      <>
        The DFA reads the string one symbol at a time. The amber head marks the next symbol to read; the lit state is where the machine is now
        {current && notes?.[current] ? (
          <>
            : <StateName>{current}</StateName>, {notes[current]}
          </>
        ) : null}
        .
      </>
    );
  } else if (finalState === null) {
    sentence = <>The DFA has no move for one of the symbols, so it stops early and rejects.</>;
  } else {
    const note = notes?.[finalState];
    sentence = (
      <>
        {input.length === 0 ? (
          <>With nothing to read, the DFA stays in its start state </>
        ) : (
          <>The DFA reads all {input.length} symbols and stops in </>
        )}
        <StateName>{finalState}</StateName>
        {note ? <>, the state for “{note}”</> : null}. That state is {truth ? "accepting" : "not accepting"}, so {input.length === 0 ? "ε" : "the string"} is{" "}
        {truth ? "in" : "not in"} {language.id}.
      </>
    );
  }

  return (
    <section ref={ref} aria-labelledby="truth-title" className="mx-auto max-w-6xl px-6 pt-14">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative overflow-hidden rounded-[28px] border border-line bg-panel/80 shadow-[var(--shadow)]"
      >
        <div aria-hidden className="grid-paper absolute inset-0 opacity-70" />
        <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:p-10">
          <div className="min-w-0">
            <p className="text-sm text-ink-2">
              The answer key: the hand-built <Term k="dfa">DFA</Term> that defines {language.id}
            </p>
            <h2 id="truth-title" className="mt-2 font-display text-4xl font-semibold text-ink sm:text-5xl">
              {truth === null || !done ? (
                <span className="text-ink-2">Reading {input.length === 0 ? "ε" : `${input.length} symbol${input.length === 1 ? "" : "s"}`}…</span>
              ) : truth ? (
                <>In {language.id}</>
              ) : (
                <>Not in {language.id}</>
              )}
            </h2>

            <Tape className="mt-6" input={input} head={consumed} status={status} size={tapeSize} label={`Input tape for ${language.id}`} />

            <p className="mt-5 min-h-[4.8rem] max-w-xl text-[15px] leading-relaxed text-ink-2" aria-live="off">
              {sentence}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="outline">
                <span className="font-mono">{shown.length > 26 ? `${shown.slice(0, 12)}…${shown.slice(-12)}` : shown}</span>
              </Badge>
              <Badge tone="outline">
                {input.length} symbol{input.length === 1 ? "" : "s"}
              </Badge>
              {result?.longer_than_training && (
                <Badge tone="lamp">longer than every training string{maxTrain !== undefined ? ` (max ${maxTrain})` : ""}</Badge>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="flex min-h-[3.5rem] flex-wrap items-center justify-between gap-3">
              <VerdictStamp accepted={done ? truth : null} size={wide ? "lg" : "md"} />
              {run && !reduce && (
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStarted(runKey);
                      restart();
                    }}
                  >
                    <RotateCcw size={14} aria-hidden /> Replay<span className="hidden sm:inline"> the run</span>
                  </Button>
                  {!done && (
                    <Button variant="ghost" size="sm" onClick={player.jumpToEnd}>
                      <FastForward size={14} aria-hidden /> Skip to the end
                    </Button>
                  )}
                </div>
              )}
            </div>
            {bigGraph ? (
              <div className="mt-4 rounded-2xl border border-line bg-[color:var(--bg)]/55 p-5" aria-hidden>
                <p className="text-sm text-muted">{done ? "The run ended in" : "The machine is in"}</p>
                {current || finalState ? (
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-lg border border-line-strong bg-panel px-2.5 py-1 font-mono text-xl text-ink">{(done ? finalState : current) ?? "–"}</span>
                    <span className="text-ink-2">{notes?.[(done ? finalState : current) ?? ""] ?? ""}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 flex flex-1 flex-col">{graph}</div>
            )}
          </div>
          {bigGraph && <div className="min-w-0 lg:col-span-2">{graph}</div>}
        </div>
      </motion.div>
    </section>
  );
}

export function TruthBannerSkeleton() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-14" aria-hidden>
      <div className={cn("grid gap-8 rounded-[28px] border border-line p-8 lg:grid-cols-2")}>
        <div className="space-y-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </section>
  );
}
