import { useRef, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Info } from "lucide-react";
import { DimensionLine } from "@/components/ui/DimensionLine";
import { Stat } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { pct } from "@/lib/meta";
import type { LearnResult } from "@/lib/types";
import { LEARNER_BY_ID } from "./LearnerPicker";
import { ms, plural } from "./model";
import { PrefixTreeFold } from "./PrefixTreeFold";
import { Ticker } from "./Ticker";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function Fact({ value, label, hint }: { value: ReactNode; label: ReactNode; hint?: ReactNode }) {
  return <Stat value={value} label={label} hint={hint} className="border-l border-line pl-3 [&>div:first-child]:text-2xl" />;
}

const STOP_REASON: Record<string, string> = {
  equivalent: "the model agreed with L*'s hypothesis on every string the equivalence check tried",
  max_states: "its next hypothesis would have outgrown the state budget, so it kept the last complete one",
  max_seconds: "it ran out of its time budget",
  max_rounds: "it ran out of rounds",
  max_queries: "it ran out of its membership-query budget",
};

export function HowLearned({ result, samples }: { result: LearnResult; samples: { string: string; label: boolean }[] }) {
  const meta = LEARNER_BY_ID[result.learner];
  const s = result.stats;
  const passive = meta.mode === "passive";
  const pta = num(s.pta_states);
  const merges = num(s.merges);
  const promotions = num(s.promotions);
  const raw = num(s.raw_states) ?? result.minimized_from ?? null;
  const mq = num(s.membership_queries);
  const eq = num(s.equivalence_queries);
  const converged = typeof s.converged === "boolean" ? s.converged : null;
  const stop = typeof s.stop_reason === "string" ? s.stop_reason : null;

  return (
    <section aria-labelledby="how-title" className="space-y-5 border-t border-line pt-8">
      <div>
        <h3 id="how-title" className="font-display text-2xl font-semibold text-ink">
          How {meta.name} got there
        </h3>
        {passive && pta !== null ? (
          <p className="mt-1 text-ink-2">
            Your {plural(result.samples, "example")} formed a <Term k="pta">prefix tree</Term> with {plural(pta, "state")}.{" "}
            {merges !== null && <>{plural(merges, "merge")} folded it </>}
            down to {plural(result.states, "state")}; every fold kept all your examples on the right side.
          </p>
        ) : (
          <p className="mt-1 text-ink-2">
            L* asked the {meta.model === "lr" ? "logistic regression" : meta.model === "dt" ? "decision tree" : "random forest"}{" "}
            {mq !== null ? plural(mq, "membership query", "membership queries") : "its membership queries"} and stopped because{" "}
            {stop ? (STOP_REASON[stop] ?? stop.replace(/_/g, " ")) : "it finished"}.
          </p>
        )}
      </div>

      {passive && pta !== null && (
        <div className="space-y-3">
          {samples.length > 0 ? (
            <PrefixTreeFold dfa={result.automaton} samples={samples} learnerName={meta.name} ptaStates={pta} />
          ) : (
            <DimensionLine label={`${plural(pta, "state")} to ${result.states}`} />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {passive ? (
          <>
            {merges !== null && <Fact value={merges} label={merges === 1 ? "merge" : "merges"} hint="pairs of states folded together" />}
            {promotions !== null && <Fact value={promotions} label={promotions === 1 ? "promotion" : "promotions"} hint="states no merge could absorb" />}
          </>
        ) : (
          <>
            {mq !== null && (
              <Fact
                value={<Ticker value={mq} />}
                label={<Term k="membership-query">membership queries</Term>}
                hint="strings L* asked the model about"
              />
            )}
            {eq !== null && <Fact value={eq} label={<Term k="equivalence-query">{eq === 1 ? "equivalence query" : "equivalence queries"}</Term>} hint="hypotheses it proposed" />}
            {converged !== null && <Fact value={converged ? "yes" : "no"} label="converged" hint={converged ? "the model accepted the hypothesis" : "stopped at a budget"} />}
          </>
        )}
        {raw !== null && <Fact value={raw} label="states before minimizing" hint={raw === result.states ? "already minimal" : `${raw - result.states} merged away`} />}
        <Fact value={ms(result.learn_time_ms)} label="learning time" hint="includes training the three ML models" />
      </div>

      {result.warnings.length > 0 && (
        <ul className="space-y-2">
          {result.warnings.map((w) => (
            <li key={w} className="flex gap-3 rounded-xl border border-line bg-panel/85 px-4 py-3 text-sm text-ink shadow-[inset_3px_0_0_var(--line-strong)]">
              <Info size={17} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ML_ROWS: { id: string; name: string; color: string }[] = [
  { id: "lr", name: "Logistic regression", color: "var(--series-lr)" },
  { id: "dt", name: "Decision tree", color: "var(--series-dt)" },
  { id: "rf", name: "Random forest", color: "var(--series-rf)" },
];

export function MlFit({ result }: { result: LearnResult }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const rows = ML_ROWS.filter((r) => typeof result.ml_training_accuracy[r.id] === "number");
  const perfect = rows.every((r) => result.ml_training_accuracy[r.id] >= 0.9999);
  return (
    <section aria-labelledby="mlfit-title" className="space-y-4 border-t border-line pt-8">
      <div>
        <h3 id="mlfit-title" className="font-display text-2xl font-semibold text-ink">
          The ML models on the same examples
        </h3>
        <p className="mt-1 text-ink-2">
          {perfect
            ? `All three fit your ${plural(result.samples, "example")} perfectly. That is the easy part: run longer strings on the test bench to see whether they generalize like the DFA does.`
            : `Trained on the same ${plural(result.samples, "example")}, not every model can even reproduce them. Each bar is its accuracy on your own examples.`}
        </p>
      </div>
      <div ref={ref} className="space-y-3" role="list" aria-label="Training accuracy on your examples">
        {rows.map((r, i) => {
          const v = result.ml_training_accuracy[r.id];
          return (
            <div key={r.id} role="listitem" className="grid grid-cols-[9.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm max-sm:grid-cols-[7.5rem_minmax(0,1fr)_3.5rem]">
              <span className="flex min-w-0 items-center gap-2 text-ink-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                <span className="truncate">{r.name}</span>
              </span>
              <div className="h-2.5 overflow-hidden rounded-full bg-panel-2">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: r.color }}
                  initial={reduce ? false : { width: "0%" }}
                  animate={{ width: inView || reduce ? `${v * 100}%` : "0%" }}
                  transition={{ duration: 0.8, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="tabular text-right font-mono text-xs text-ink">{pct(v)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
