import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { RotateCcw } from "lucide-react";
import type { DfaPayload } from "@/lib/types";
import { runDfa } from "@/lib/automata";
import { showString } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { Tape } from "@/components/tape/Tape";
import { VerdictStamp } from "@/components/ui/primitives";
import { AutomatonGraph } from "./AutomatonGraph";
import { useTracePlayer } from "./useTracePlayer";

export type LightTableOutcome = "exact" | "accepting-differs" | "no-match";

export interface DfaMatch {
  outcome: LightTableOutcome;
  /** truth state -> candidate state, when the transition structures are isomorphic */
  bijection?: Map<string, string>;
  /** truth states whose acceptance differs from their image (outcome "accepting-differs") */
  differing: string[];
}

/**
 * Compare two total DFAs by structure: BFS from both start states in alphabet order, matching on
 * transitions only, then compare the accepting sets afterwards (design direction 4.3).
 */
export function matchDfas(truth: DfaPayload, candidate: DfaPayload): DfaMatch {
  const none: DfaMatch = { outcome: "no-match", differing: [] };
  if (truth.alphabet.join("\u0000") !== candidate.alphabet.join("\u0000") || truth.states.length !== candidate.states.length) return none;
  const map = new Map<string, string>([[truth.start, candidate.start]]);
  const inverse = new Map<string, string>([[candidate.start, truth.start]]);
  const queue: [string, string][] = [[truth.start, candidate.start]];
  while (queue.length) {
    const [t, c] = queue.shift()!;
    for (const sym of truth.alphabet) {
      const t2 = truth.transitions[t]?.[sym];
      const c2 = candidate.transitions[c]?.[sym];
      if ((t2 === undefined) !== (c2 === undefined)) return none;
      if (t2 === undefined || c2 === undefined) continue;
      if (map.has(t2)) {
        if (map.get(t2) !== c2) return none;
      } else {
        if (inverse.has(c2)) return none;
        map.set(t2, c2);
        inverse.set(c2, t2);
        queue.push([t2, c2]);
      }
    }
  }
  if (map.size !== truth.states.length) return none;
  const accepting = new Set(candidate.accepting);
  const differing = truth.states.filter((t) => truth.accepting.includes(t) !== accepting.has(map.get(t)!));
  return { outcome: differing.length ? "accepting-differs" : "exact", bijection: map, differing };
}

/** The candidate renamed into the truth's state names: identical structure, so an identical layout. */
function renamed(truth: DfaPayload, candidate: DfaPayload, bijection: Map<string, string>): DfaPayload {
  const accepting = new Set(candidate.accepting);
  return { ...truth, accepting: truth.states.filter((t) => accepting.has(bijection.get(t)!)), meta: { ...candidate.meta } };
}

const LAMP_SHEET = { "--ink-2": "var(--lamp)", "--ink": "var(--lamp)", "--state-fill": "transparent" } as CSSProperties;

/**
 * The light table: the candidate DFA (lamp ink, on tracing paper) slides over the ground truth.
 * - exact: the sheets register and the stamp reads "exact";
 * - accepting-differs: the sheets register but the disagreeing states stay ringed in amber;
 * - no-match: side by side, the shortest disagreeing string runs through both machines at once.
 */
export function LightTable({
  truth,
  candidate,
  counterexample,
  truthLabel = "Ground truth",
  candidateLabel = "Extracted DFA",
  maxHeight = 340,
  className,
}: {
  truth: DfaPayload;
  candidate: DfaPayload;
  counterexample?: string | null;
  truthLabel?: string;
  candidateLabel?: string;
  maxHeight?: number;
  className?: string;
}) {
  const match = useMemo(() => matchDfas(truth, candidate), [truth, candidate]);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const reduce = useReducedMotion();
  const [run, setRun] = useState(0);
  const [registered, setRegistered] = useState(false);
  const hasCex = counterexample !== null && counterexample !== undefined; // "" (ε) is a real counterexample

  useEffect(() => {
    if (reduce) setRegistered(true);
  }, [reduce]);

  if (match.outcome !== "no-match" && match.bijection) {
    const sheet = renamed(truth, candidate, match.bijection);
    const exact = match.outcome === "exact";
    return (
      <div ref={ref} className={cn("space-y-4", className)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="t-annotation">
            <span className="text-ink-2">{truthLabel}</span> in ink · <span className="text-lamp">{candidateLabel}</span> on tracing paper
          </p>
          <button
            type="button"
            onClick={() => {
              setRegistered(false);
              setRun((r) => r + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-ink-2 hover:bg-panel-2 hover:text-ink"
          >
            <RotateCcw size={13} aria-hidden /> Lay the sheets again
          </button>
        </div>
        <div className="relative">
          <AutomatonGraph automaton={truth} zoomable={false} animateIn={false} maxHeight={maxHeight} marked={registered && !exact ? match.differing : []} ariaLabel={`${truthLabel}: ${truth.states.length} states`} />
          <motion.div
            key={run}
            className="pointer-events-none absolute inset-0"
            style={LAMP_SHEET}
            initial={reduce ? { opacity: 0.85 } : { x: 14, y: 12, rotate: 1.5, opacity: 0 }}
            animate={inView || reduce ? { x: 0, y: 0, rotate: 0, opacity: 0.85 } : undefined}
            transition={{ duration: 1.05, ease: [0.65, 0, 0.35, 1], delay: 0.15 }}
            onAnimationComplete={() => setRegistered(true)}
            aria-hidden
          >
            <AutomatonGraph automaton={sheet} zoomable={false} animateIn={false} maxHeight={maxHeight} />
          </motion.div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <VerdictStamp accepted={null} label={registered ? (exact ? "exact" : "differs") : undefined} tone={exact ? "accept" : "reject"} />
          <p className="max-w-xl text-sm text-ink-2" aria-live="polite">
            {exact
              ? `Every state and every transition registers: the ${candidateLabel.toLowerCase()} is the same machine as the ${truthLabel.toLowerCase()}.`
              : `The transitions register, but ${match.differing.length === 1 ? "one state disagrees" : `${match.differing.length} states disagree`} on whether to accept${
                  hasCex ? `, so the two machines first part ways on the string ${showString(counterexample!)}` : ""
                }.`}
          </p>
        </div>
      </div>
    );
  }
  return <DivergenceRun ref_={ref} truth={truth} candidate={candidate} counterexample={hasCex ? counterexample! : null} truthLabel={truthLabel} candidateLabel={candidateLabel} maxHeight={maxHeight} className={className} />;
}

function DivergenceRun({
  ref_,
  truth,
  candidate,
  counterexample,
  truthLabel,
  candidateLabel,
  maxHeight,
  className,
}: {
  ref_: React.RefObject<HTMLDivElement | null>;
  truth: DfaPayload;
  candidate: DfaPayload;
  counterexample: string | null;
  truthLabel: string;
  candidateLabel: string;
  maxHeight: number;
  className?: string;
}) {
  const input = counterexample ?? "";
  const a = useMemo(() => runDfa(truth, input), [truth, input]);
  const b = useMemo(() => runDfa(candidate, input), [candidate, input]);
  const player = useTracePlayer(input.length, { stepMs: 650 });
  const inView = useInView(ref_, { once: true, margin: "-15% 0px" });
  useEffect(() => {
    if (inView && counterexample !== null) player.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);
  const i = player.index;
  const done = player.done || input.length === 0;
  const stateA = i >= 0 ? a.steps[i]?.to ?? a.final : truth.start;
  const stateB = i >= 0 ? b.steps[i]?.to ?? b.final : candidate.start;
  return (
    <div ref={ref_} className={cn("space-y-4", className)}>
      <p className="t-annotation">
        These machines differ in shape ({truth.states.length} vs {candidate.states.length} states), so the sheets cannot register.
        {counterexample !== null ? " Instead, the shortest string they disagree on runs through both." : ""}
      </p>
      {counterexample !== null && <Tape input={input} head={i + 1} status={done ? "idle" : "running"} size="md" />}
      <div className="grid gap-6 md:grid-cols-2">
        {[
          { label: truthLabel, dfa: truth, state: stateA, steps: a.steps, accepted: a.accepted, lamp: false },
          { label: candidateLabel, dfa: candidate, state: stateB, steps: b.steps, accepted: b.accepted, lamp: true },
        ].map((side) => (
          <div key={side.label} className="space-y-2">
            <div className={cn("t-annotation", side.lamp && "text-lamp")}>{side.label}</div>
            <AutomatonGraph
              automaton={side.dfa}
              active={side.state ? [side.state] : []}
              activeEdge={i >= 0 ? side.steps[i] ?? null : null}
              tokenKey={i}
              verdict={done ? (side.accepted ? "accept" : "reject") : null}
              maxHeight={maxHeight}
              animateIn={false}
            />
            {done && counterexample !== null && <VerdictStamp accepted={side.accepted} size="sm" />}
          </div>
        ))}
      </div>
    </div>
  );
}
