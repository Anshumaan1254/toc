import { Fragment } from "react";
import { motion, useReducedMotion } from "motion/react";
import { APPROACHES } from "@/lib/meta";
import type { ComparisonOverallRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBands, words } from "./bands";

const FAMILY_ORDER = ["ground truth", "learned DFA", "ML pipeline"];
const FAMILY_NAME: Record<string, string> = {
  "ground truth": "Ground truth",
  "learned DFA": "Learned automata",
  "ML pipeline": "ML pipelines",
};

const colorOf = (row: ComparisonOverallRow) => {
  const candidates = APPROACHES.filter((a) => a.name === row.approach);
  const pick = row.family === "ML pipeline" ? candidates.find((a) => a.family === "ml") : candidates.find((a) => a.family !== "ml");
  return (pick ?? candidates[0])?.color ?? "var(--series-truth)";
};

const fmtSize = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
const fmtUs = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1));
const fmtBuild = (s: number | null) => (s === null ? "–" : s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(1)} s`);

/** Width (0-1) of a log-scale bar between `lo` and `hi`. */
const logShare = (v: number, lo: number, hi: number) => Math.max(0.03, Math.min(1, (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))));

/** (e) Automata against models: one designed table from summary.comparison_overall. */
export function ComparisonTable({ rows, languages }: { rows: ComparisonOverallRow[]; languages: number }) {
  const reduce = useReducedMotion();
  const bands = useBands();
  const groups = FAMILY_ORDER.map((f) => ({ family: f, rows: rows.filter((r) => r.family === f) })).filter((g) => g.rows.length);
  const extra = rows.filter((r) => !FAMILY_ORDER.includes(r.family));
  if (extra.length) groups.push({ family: "other", rows: extra });
  const sizes = rows.map((r) => r.mean_size).filter((v) => v > 0);
  const times = rows.map((r) => r.inference_us_per_string).filter((v) => v > 0);
  const sizeLo = Math.min(...sizes) / 2;
  const sizeHi = Math.max(...sizes);
  const timeLo = Math.min(...times) / 2;
  const timeHi = Math.max(...times);
  const bar = (share: number, i: number) => (
    <span className="mt-1.5 block h-1 w-full max-w-[7rem] overflow-hidden rounded-full bg-[color:var(--panel-2)]" aria-hidden>
      <motion.span
        className="block h-full rounded-full bg-ink-2"
        initial={reduce ? { width: `${share * 100}%` } : { width: 0 }}
        whileInView={{ width: `${share * 100}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: i * 0.04 }}
      />
    </span>
  );
  let i = 0;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel" data-lenis-prevent>
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Every approach averaged over the {words(languages)} languages: accuracy on the test split and on lengths {bands.longWords}, model size, time to
          classify one string, build time and the number of languages recovered exactly.
        </caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="sticky left-0 z-10 bg-panel px-4 py-3 font-medium">
              Approach
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Test accuracy
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Lengths {bands.longDash}
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Size
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Time per string
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Build time
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Exact languages
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.family}>
              <tr>
                <th scope="rowgroup" colSpan={7} className="sticky left-0 bg-panel-2/50 px-4 pb-1.5 pt-4 text-left font-display text-[15px] font-semibold text-ink">
                  {FAMILY_NAME[g.family] ?? g.family}
                </th>
              </tr>
              {g.rows.map((r) => {
                const k = i++;
                const perfect = r.long_accuracy >= 0.9999;
                return (
                  <tr key={r.approach + r.family} className="border-t border-line/70 align-top">
                    <th scope="row" className="sticky left-0 z-10 bg-panel px-4 py-3 font-normal text-ink">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(r) }} aria-hidden />
                        {r.approach}
                      </span>
                    </th>
                    <td className="tabular px-3 py-3 text-right text-ink">{(r.test_accuracy * 100).toFixed(1)}%</td>
                    <td className={cn("tabular px-3 py-3 text-right", perfect ? "text-accept" : "text-ink")}>{(r.long_accuracy * 100).toFixed(1)}%</td>
                    <td className="px-3 py-3 text-ink">
                      <span className="tabular">{fmtSize(r.mean_size)}</span> <span className="text-xs text-muted">{r.size_unit}</span>
                      {bar(logShare(r.mean_size, sizeLo, sizeHi), k)}
                    </td>
                    <td className="px-3 py-3 text-ink">
                      <span className="tabular">{fmtUs(r.inference_us_per_string)}</span> <span className="text-xs text-muted">µs</span>
                      {bar(logShare(r.inference_us_per_string, timeLo, timeHi), k)}
                    </td>
                    <td className="tabular px-3 py-3 text-right text-ink-2">{fmtBuild(r.build_time_s)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="tabular w-12 text-ink">
                          {r.exact_languages}/{languages}
                        </span>
                        <span className="flex gap-[3px]" aria-hidden>
                          {Array.from({ length: languages }, (_, j) => (
                            <span
                              key={j}
                              className="h-2.5 w-1.5 rounded-[2px]"
                              style={{ background: j < r.exact_languages ? "var(--accept)" : "color-mix(in srgb, var(--ink-2) 18%, transparent)" }}
                            />
                          ))}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-xs text-muted">
        The size and time bars use a logarithmic scale, so the smallest automaton and the largest forest fit on one line. Size counts transitions for
        automata and parameters or tree nodes for models; times are per string, measured on the test split.
      </p>
    </div>
  );
}
