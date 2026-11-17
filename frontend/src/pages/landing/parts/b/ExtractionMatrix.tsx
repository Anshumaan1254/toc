import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { PIPELINES } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LSTAR_IDS } from "./results-data";

/**
 * Every L* extraction at a glance: one cell per (language, pipeline) with the DFA's state
 * count, whether it equals the ground truth, and whether L* converged or stopped at its
 * state budget. Each cell links to that automaton in the explorer.
 */
export function ExtractionMatrix({ summary }: { summary: Summary }) {
  const reduce = useReducedMotion();
  const langs = summary.languages;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto" data-lenis-prevent>
        <table className="w-full min-w-[30rem] border-separate border-spacing-1 text-sm">
          <caption className="sr-only">L* extractions per language and pipeline: number of states, exact or not, converged or stopped at the state budget.</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-left text-xs font-medium text-muted">
                Language
              </th>
              {PIPELINES.map((p) => (
                <th key={p.id} scope="col" className="px-2 py-1 text-center text-xs font-medium text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
                    {p.short}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {langs.map((l, ri) => (
              <tr key={l.id}>
                <th scope="row" className="whitespace-nowrap px-2 text-left font-normal">
                  <span className="font-mono text-ink">{l.id}</span> <span className="hidden text-xs text-muted md:inline">{l.name}</span>
                </th>
                {LSTAR_IDS.map((a, ci) => {
                  const r = summary.automata[l.id]?.[a];
                  if (!r) return <td key={a} className="text-center text-muted">–</td>;
                  const exact = r.equivalent_to_truth;
                  const stopped = !r.converged;
                  return (
                    <td key={a} className="p-0">
                      <motion.div
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: reduce ? 0 : ri * 0.04 + ci * 0.06 }}
                      >
                        <Link
                          to={`/explore/${l.id}/${a}`}
                          className={cn(
                            "flex h-10 items-center justify-center gap-1.5 rounded-lg border font-mono text-[13px] transition-colors hover:border-[color:var(--ink-2)] hover:bg-panel-2/60",
                            exact ? "border-line text-ink-2" : "border-line text-ink",
                            stopped && "border-dashed !border-[color:var(--line-strong)]",
                          )}
                          aria-label={`${l.id}, ${a}: ${r.states} states, ${exact ? "equal to the ground truth" : "differs from the ground truth"}, ${stopped ? "stopped at the state budget" : "converged"}`}
                          title={`${r.states} states${stopped ? ", stopped at the state budget" : ""}`}
                        >
                          <RingGlyph exact={exact} />
                          <span aria-hidden>{exact ? "✓" : "≠"}</span>
                          <span className="tabular">{r.states}</span>
                        </Link>
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-2" aria-label="Key">
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-12 items-center justify-center gap-1 rounded border border-line font-mono text-ink-2" aria-hidden>
            <RingGlyph exact />✓
          </span>
          equal to the ground truth
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-12 items-center justify-center gap-1 rounded border border-line font-mono text-ink" aria-hidden>
            <RingGlyph exact={false} />≠
          </span>
          differs from it
        </li>
        <li className="flex items-center gap-2">
          <span className="h-5 w-8 rounded border border-dashed border-line-strong" aria-hidden />
          stopped at the state budget
        </li>
        <li className="text-muted">the number is the DFA&apos;s state count</li>
      </ul>
    </div>
  );
}

/**
 * Two state rings laid on top of each other: registered in ink when the extracted DFA is the
 * truth, the tracing-paper ring slipped off in amber when it is not (the light-table idea).
 */
function RingGlyph({ exact }: { exact: boolean }) {
  return (
    <svg viewBox="0 0 18 14" width={18} height={14} aria-hidden className="shrink-0">
      <circle cx={7} cy={7} r={5} fill="none" stroke="var(--ink-2)" strokeWidth={1.25} />
      {exact ? (
        <circle cx={7} cy={7} r={3} fill="none" stroke="var(--ink-2)" strokeWidth={1.25} />
      ) : (
        <circle cx={11} cy={7} r={5} fill="none" stroke="var(--lamp)" strokeWidth={1.25} strokeDasharray="2.2 1.6" />
      )}
    </svg>
  );
}
