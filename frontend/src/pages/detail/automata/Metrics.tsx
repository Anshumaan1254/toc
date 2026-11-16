import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { Term } from "@/components/ui/Term";
import { runDfa } from "@/lib/automata";
import { duration, showString } from "@/lib/meta";
import type { AutomatonMetrics, DfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Meter } from "./ui";

function Figure({ value, label, hint, color }: { value: number | null | undefined; label: ReactNode; hint?: ReactNode; color: string }) {
  const v = value ?? null;
  return (
    <div className="min-w-0 space-y-2">
      <div className="font-display text-[44px] font-semibold leading-none text-ink">
        {v === null ? "–" : <NumberTicker value={v * 100} decimalPlaces={1} className="tracking-normal text-ink dark:text-ink" />}
        {v !== null && <span className="text-2xl text-ink-2">%</span>}
      </div>
      <Meter value={v} color={color} label={typeof label === "string" ? `${label}: ${v === null ? "not measured" : `${(v * 100).toFixed(1)}%`}` : "meter"} />
      <div className="text-sm text-ink-2">{label}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function MetricsPanel({ metrics, dfa, isLstar, onRun }: { metrics: AutomatonMetrics; dfa: DfaPayload; isLstar: boolean; onRun: (s: string) => void }) {
  const reduce = useReducedMotion();
  const cex = metrics.counterexample_to_truth;
  const says = cex !== null ? runDfa(dfa, cex).accepted : null;
  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <motion.div
        initial={reduce ? false : { opacity: 0, x: -24 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
        className={cn("border-l-[3px] pl-6", metrics.equivalent_to_truth ? "border-[color:var(--accept)]" : "border-[color:var(--reject)]")}
      >
        <p className={cn("font-display text-[40px] font-semibold leading-[1.02] md:text-5xl", metrics.equivalent_to_truth ? "text-accept" : "text-reject")}>
          {metrics.equivalent_to_truth ? "Exactly the right machine." : "Not the right machine."}
        </p>
        {metrics.equivalent_to_truth ? (
          <p className="mt-4 text-ink-2">
            The <Term k="equivalence">equivalence check</Term> with the ground-truth DFA finds no string where the two disagree. It is right on
            every string of every length, not only on the test set.
          </p>
        ) : (
          <div className="mt-4 space-y-4 text-ink-2">
            <p>
              The <Term k="equivalence">equivalence check</Term> with the ground-truth DFA finds the shortest string where they disagree:
            </p>
            {cex !== null && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="break-all rounded-xl border border-[color:var(--lamp)]/50 bg-lamp-soft px-4 py-2 font-mono text-2xl text-ink">{showString(cex)}</span>
                <button
                  type="button"
                  onClick={() => onRun(cex)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-medium text-ink hover:border-ink-2 hover:bg-panel-2/60"
                >
                  <Play size={14} aria-hidden /> Run it on this DFA
                </button>
              </div>
            )}
            {cex !== null && says !== null && (
              <p>
                This DFA {says ? "accepts" : "rejects"} {cex === "" ? "the empty string" : "it"}; the true language {says ? "rejects" : "accepts"} it.
              </p>
            )}
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-10">
        <Figure value={metrics.test.accuracy} label="accuracy on test strings" hint={`${metrics.test.n.toLocaleString("en-US")} strings, lengths 0–20`} color="var(--accept)" />
        <Figure
          value={metrics.long.accuracy}
          label={<>accuracy on long strings</>}
          hint={`${metrics.long.n.toLocaleString("en-US")} strings, lengths 21–40, never seen in training`}
          color="var(--accept)"
        />
        {isLstar && (
          <Figure
            value={metrics.test.fidelity ?? null}
            label={<><Term k="fidelity">fidelity</Term> to its model</>}
            hint={metrics.long.fidelity !== undefined ? `${((metrics.long.fidelity ?? 0) * 100).toFixed(1)}% on the long strings` : undefined}
            color="var(--series-edsm)"
          />
        )}
        <div className="min-w-0 space-y-2">
          <div className="font-display text-[44px] font-semibold leading-none text-ink">
            {metrics.learning_time_s !== null && metrics.learning_time_s !== undefined ? duration(metrics.learning_time_s) : "–"}
          </div>
          <div className="h-2" aria-hidden />
          <div className="text-sm text-ink-2">to learn</div>
          <div className="text-xs text-muted">then {duration(metrics.inference_time_per_string_s)} per string to classify</div>
        </div>
      </div>
    </div>
  );
}
