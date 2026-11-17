import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { Tape } from "@/components/tape/Tape";
import { ErrorState, Gauge, Skeleton, VerdictStamp } from "@/components/ui/primitives";
import { errorMessage, useAutomaton, useClassify, useSummary } from "@/lib/api";
import { int } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { binaryValue, isDfa, stateNotes } from "./data";
import { useDfaRun } from "./useDfaRun";
import { InlineSkeleton } from "./ui";

/** Both strings are multiples of 3; every verdict and probability shown comes from the machine and the API. */
const SHORT = "1001";
const LONG = "100111100111010110011101";

/**
 * The question, drawn: the same string goes through a machine you can read (L6's ground-truth DFA)
 * and through a model (the random forest, which only sees numbers about the string). Then a longer
 * string: the machine is still right; the model's probability sits near one half.
 */
export function RuleVsGuess({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useInView(ref, { once: true, amount: 0.35 });
  // Second beat once the figure's top passes 40% of the viewport.
  const deeper = useInView(ref, { once: true, margin: "0px 0px -60% 0px" });
  const q = useAutomaton("L6", "dfa");
  const summary = useSummary();
  const dfa = isDfa(q.data?.automaton) ? q.data.automaton : undefined;
  const short = useClassify();
  const long = useClassify();
  const [beat, setBeat] = useState<0 | 1>(0);
  const input = beat === 0 ? SHORT : LONG;
  const run = useDfaRun(started ? dfa : undefined, input, beat, beat === 0 ? { stepMs: 620, typeMs: 80 } : { stepMs: 190, typeMs: 22 });
  const notes = stateNotes(dfa);

  // Ask the model about both strings once, as soon as the figure is on screen.
  const asked = useRef(false);
  useEffect(() => {
    if (!started || asked.current) return;
    asked.current = true;
    short.mutate({ language: "L6", approach: "ml_rf", string: SHORT });
    long.mutate({ language: "L6", approach: "ml_rf", string: LONG });
  }, [started, short, long]);

  // The longer string follows once the first verdict has had a moment on screen.
  useEffect(() => {
    if (beat !== 0 || !deeper || run.phase !== "done") return;
    const t = window.setTimeout(() => setBeat(1), 1400);
    return () => window.clearTimeout(t);
  }, [beat, deeper, run.phase]);

  const answer = beat === 0 ? short : long;
  const modelFailed = short.isError;
  const done = run.phase === "done";
  const probability = done && answer.data?.string === input ? (answer.data.probability ?? null) : null;
  const features = summary.data?.meta.feature_count_binary;
  const trainMax = summary.data?.meta.max_train_length;

  return (
    <div ref={ref} className={cn("grid gap-x-12 gap-y-10 lg:grid-cols-12", className)}>
      <div className="lg:col-span-5">
        <h3 className="t-h3 text-ink">A rule, and a guess</h3>
        <div className="mt-4 space-y-4 leading-relaxed text-ink-2">
          <p>
            On the left, the ground-truth DFA for L6, binary numbers divisible by 3. It reads the string one symbol at a time and cannot be
            wrong. On the right, a random forest trained on labelled L6 strings. It never sees the machine, only{" "}
            {features ?? <InlineSkeleton className="w-[1.6em]" />} numbers about the string, and answers with a probability.
          </p>
          <p className={cn("transition-colors duration-500", beat === 1 ? "text-ink" : "text-muted")}>
            Then a string of {LONG.length} symbols, longer than any the model was trained on (those have at most{" "}
            {trainMax ?? <InlineSkeleton className="w-[1.2em]" />}). Still a multiple of 3:{" "}
            <span className="font-mono">{int(binaryValue(LONG))}</span> = 3 × <span className="font-mono">{int(binaryValue(LONG) / 3)}</span>.
          </p>
        </div>
      </div>

      <div className={cn("grid gap-x-8 gap-y-10 lg:col-span-7", !modelFailed && "sm:grid-cols-2")}>
        {/* the rule */}
        <figure className="min-w-0">
          <div className="relative">
            {q.error && !dfa ? (
              <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
            ) : !dfa ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <AutomatonGraph
                automaton={dfa}
                active={run.current ? [run.current] : []}
                activeEdge={run.edge}
                tokenKey={run.tokenKey}
                verdict={run.verdict}
                notes={notes}
                radius={24}
                zoomable={false}
                maxHeight={220}
              />
            )}
            <div className="pointer-events-none absolute -top-2 right-0" aria-hidden={!done}>
              <VerdictStamp accepted={done ? run.accepted : null} size="sm" />
            </div>
          </div>
          <Tape input={run.tape} head={run.head} status={run.status} size="sm" className="mt-3" label="Input tape for L6" />
          <figcaption className="t-caption mt-3">A rule you can read.</figcaption>
        </figure>

        {/* the guess */}
        {!modelFailed && (
          <figure className="flex min-w-0 flex-col">
            <div className="rounded-md border border-line px-3 py-2.5">
              <p className="text-sm text-ink-2">
                {features ?? <InlineSkeleton className="w-[1.6em]" />} numbers about the string
              </p>
              <p className="mt-1 truncate font-mono text-xs text-muted" aria-hidden>
                length {input.length}, ones {[...input].filter((c) => c === "1").length}, last symbol {input.slice(-1)}, …
              </p>
            </div>
            <svg aria-hidden viewBox="0 0 10 28" className="mx-auto h-7 w-2.5" fill="none">
              <path d="M5 0 V22 M1.5 18.5 L5 24 L8.5 18.5" stroke="var(--line-strong)" strokeWidth="1.2" />
            </svg>
            {answer.isPending && !answer.data ? (
              <Skeleton className="mx-auto h-[150px] w-full max-w-[240px]" />
            ) : (
              <Gauge value={probability} label="Random forest, P(accept)" className="mx-auto w-full max-w-[240px]" />
            )}
            <figcaption className="t-caption mt-3">A guess that is usually right.</figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}
