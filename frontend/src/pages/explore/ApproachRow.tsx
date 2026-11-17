import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { APPROACH_BY_ID, duration, int, pct } from "@/lib/meta";
import type { Approach, ApproachId, Language } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./Meter";
import { SIZE_UNIT, approachName } from "./explore-utils";

/**
 * One grid template for every family so the columns line up down the whole schedule:
 * identity | two micro bars | size | exactness (lg). Below lg the row folds into two lines:
 * name + exactness, then bars + size.
 */
export const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_9.5rem_9rem] lg:items-center lg:gap-x-8";

const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

/** A micro bar on the shared 0 to 100 axis, with the 50% tick (a coin flip on the balanced sets). */
function MicroBar({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  const has = typeof value === "number" && !Number.isNaN(value);
  const w = has ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div className="grid grid-cols-[5.7rem_minmax(0,1fr)_3.2rem] items-center gap-x-2 sm:grid-cols-[6.6rem_minmax(0,1fr)_3.4rem] sm:gap-x-2.5">
      <span className="t-annotation truncate max-sm:text-[11px]">{label}</span>
      <span className="relative h-[4px] rounded-full bg-panel-2" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ width: `${w}%`, background: color }}
        />
        <span className="absolute -bottom-[3px] -top-[3px] left-1/2 w-px bg-ink-2/60" />
      </span>
      <span className="text-right font-mono text-[13px] font-medium text-ink tabular">
        {has ? <AnimatedNumber value={value} format={pctText} /> : "–"}
      </span>
    </div>
  );
}

/** Registered rings (one circle over the other) for an exact language; offset rings when it differs. */
function RingGlyph({ exact }: { exact: boolean }) {
  return (
    <svg width="24" height="16" viewBox="0 0 22 14" aria-hidden className="shrink-0">
      <circle cx="8" cy="7" r="5.5" fill="none" stroke="var(--ink-2)" strokeWidth="1.3" />
      <circle cx={exact ? 8 : 14} cy="7" r="5.5" fill="none" stroke="var(--ink)" strokeWidth="1.3" strokeDasharray={exact ? undefined : "2.4 1.8"} />
    </svg>
  );
}

type Exactness = { exact: boolean; text: string; title: string } | null;

function exactnessOf(a: Approach): Exactness {
  if (a.family === "truth") {
    if (a.id === "dfa") return { exact: true, text: "reference", title: "Hand-built. Every other approach is scored against this DFA." };
    if (a.id === "nfa") return { exact: true, text: "matches", title: "Accepts exactly the same strings as the ground-truth DFA." };
    return { exact: true, text: "matches", title: "Subset construction and Hopcroft's algorithm both preserve the language exactly." };
  }
  if (a.family === "learned") {
    if (a.stats.equivalent_to_truth === true)
      return { exact: true, text: "matches", title: "Accepts exactly the same strings as the ground-truth DFA (checked on the product automaton)." };
    if (a.stats.equivalent_to_truth === false)
      return { exact: false, text: "differs", title: "Disagrees with the ground-truth DFA on at least one string, even if the test sets never show it." };
  }
  return null;
}

function stopNote(a: Approach): string | null {
  if (a.stats.converged !== false) return null;
  if (a.stats.stop_reason === "max_states") return "stopped at budget";
  return `stopped early${a.stats.stop_reason ? ` (${a.stats.stop_reason.replace(/_/g, " ")})` : ""}`;
}

/** One short fact under the size (lg), with its long form as a tooltip. */
function sizeFact(a: Approach, minimal: number): { text: string; title?: string } | null {
  const s = a.stats;
  if (a.id === "dfa") return s.states === undefined ? null : s.states === minimal ? { text: "already minimal" } : { text: `minimal is ${minimal}` };
  if (a.id === "nfa") {
    if (s.epsilon_moves === undefined) return null;
    return { text: s.epsilon_moves === 0 ? "no ε-moves" : `${s.epsilon_moves} ε-move${s.epsilon_moves === 1 ? "" : "s"}` };
  }
  if (a.id === "min_dfa") {
    if (s.states_before === undefined) return null;
    return s.states_before === s.states ? { text: "already minimal" } : { text: `merged from ${s.states_before}`, title: `Subset construction gave ${s.states_before} states` };
  }
  if (a.id.startsWith("lstar_")) {
    if (s.fidelity_test === undefined || s.fidelity_test === null) return null;
    return { text: `fidelity ${pct(s.fidelity_test)}`, title: `Agrees with its model on ${pct(s.fidelity_test)} of test strings` };
  }
  if (a.family === "learned") return s.learning_time_s === undefined || s.learning_time_s === null ? null : { text: `learned in ${duration(s.learning_time_s)}` };
  if (a.kind === "ml" && s.test_f1 !== undefined) return { text: `test F1 ${pct(s.test_f1)}` };
  return null;
}

export interface ApproachRowProps {
  approach: Approach;
  /** The language these numbers were measured on (lags behind the selection while new numbers load). */
  language: Language;
  /** The selected language: where the row links to. */
  linkLanguageId: string;
  /** Lengths of the held-out long strings, e.g. "21–40" (from the dataset report); null while unknown. */
  longRange: string | null;
  /** Lit because its partner row (same trained pipeline, other family) is hovered. */
  paired: boolean;
  onHoverChange: (id: ApproachId | null) => void;
}

export function ApproachRow({ approach, language, linkLanguageId, longRange, paired, onHoverChange }: ApproachRowProps) {
  const meta = APPROACH_BY_ID[approach.id];
  const kind = meta?.kind ?? approach.kind;
  const color = meta?.color ?? "var(--series-truth)";
  const s = approach.stats;
  const name = approachName(approach);
  const queryClient = useQueryClient();
  const exactness = exactnessOf(approach);
  const stop = stopNote(approach);
  const best = kind === "ml" && !!approach.pipeline && language.best_pipeline?.pipeline === approach.pipeline;
  const fact = sizeFact(approach, language.expected_min_states);
  const longLabel = longRange ? `lengths ${longRange}` : "longer strings";

  const size: { n: number; unit: string } | null =
    kind === "ml"
      ? s.complexity !== undefined && approach.pipeline
        ? { n: s.complexity, unit: SIZE_UNIT[approach.pipeline] }
        : null
      : s.states !== undefined
        ? { n: s.states, unit: s.states === 1 ? "state" : "states" }
        : null;

  const prefetch = () => {
    if (!approach.available) return;
    if (kind === "ml" && approach.pipeline) {
      const pipeline = approach.pipeline;
      void queryClient.prefetchQuery({ queryKey: ["model", language.id, pipeline], queryFn: () => api.model(language.id, pipeline), staleTime: Infinity });
    } else {
      void queryClient.prefetchQuery({
        queryKey: ["automaton", language.id, approach.id],
        queryFn: () => api.automaton(language.id, approach.id),
        staleTime: Infinity,
      });
    }
  };

  const sizeText = size ? `, ${int(size.n)} ${size.unit}` : "";
  const exactWords = exactness ? `, ${exactness.text === "reference" ? "the reference" : exactness.text === "matches" ? "matches the ground truth" : "differs from the ground truth"}` : "";
  const stopWords = stop ? `, ${stop}` : "";
  const bestWords = best ? `, best pipeline on ${language.id}` : "";
  const label = `${name}${exactWords}${stopWords}${bestWords}: ${pct(s.test_accuracy)} on test strings, ${pct(s.long_accuracy)} on ${
    longRange ? `lengths ${longRange.replace("–", " to ")}` : "longer strings"
  }${sizeText}.`;

  const verdict: ReactNode = (
    <>
      {exactness ? (
        <div className="inline-flex items-center gap-2 whitespace-nowrap text-sm" title={exactness.title}>
          <RingGlyph exact={exactness.exact} />
          <span className={exactness.exact ? "text-ink" : "text-ink-2"}>{exactness.text}</span>
        </div>
      ) : best ? (
        <div className="whitespace-nowrap text-sm text-ink" title="Ranked first among the ML pipelines on test F1, then test accuracy, then the smallest model.">
          best pipeline
        </div>
      ) : null}
      {stop && <div className="t-annotation mt-0.5 whitespace-nowrap">{stop}</div>}
    </>
  );

  const cells: ReactNode = (
    <>
      {/* identity: series tick, name, one-line blurb; below lg the exactness rides on the same line */}
      <div className="col-span-2 col-start-1 row-start-1 flex min-w-0 items-stretch gap-3.5 lg:col-span-1">
        <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <h4 className="t-h3 text-ink max-sm:text-[1.15rem] max-sm:leading-snug sm:truncate lg:text-[1.35rem]">{name}</h4>
          {approach.available ? (
            <div className="t-caption mt-0.5 hidden truncate sm:block" title={approach.blurb}>
              {approach.blurb}
            </div>
          ) : (
            <div className="t-caption mt-0.5">Not available yet: run notebook 02 to train it.</div>
          )}
        </div>
        <div className="shrink-0 self-center text-right lg:hidden">{verdict}</div>
      </div>

      {/* exactness (automata) or the best-pipeline note (ML), its own column at lg */}
      <div className="col-start-4 row-start-1 hidden min-w-0 self-center lg:block">{verdict}</div>

      {/* the two micro bars on one 0 to 100 axis */}
      <div className="col-start-1 row-start-2 min-w-0 space-y-1.5 lg:col-start-2 lg:row-start-1">
        <MicroBar label="test" value={s.test_accuracy} color={color} />
        <MicroBar label={longLabel} value={s.long_accuracy} color={color} />
      </div>

      {/* size, with its unit */}
      <div className="col-start-2 row-start-2 min-w-0 max-w-[6.5rem] self-center justify-self-end text-right lg:col-start-3 lg:row-start-1 lg:max-w-none lg:justify-self-start lg:text-left">
        {size ? (
          <div className="leading-snug">
            <span className="font-mono text-[14px] font-medium text-ink tabular">{int(size.n)}</span>{" "}
            <span className="text-[13px] text-ink-2">{size.unit}</span>
          </div>
        ) : null}
        {fact && (
          <div className="t-annotation mt-0.5 hidden truncate lg:block" title={fact.title}>
            {fact.text}
          </div>
        )}
      </div>
    </>
  );

  const rowClass = cn(
    ROW_GRID,
    "relative border-b py-4 transition-colors duration-200 lg:py-[18px]",
    paired ? "border-[color:var(--row)]" : "border-line",
  );
  const style = { "--row": color } as CSSProperties;

  if (!approach.available) {
    return (
      <div className={cn(rowClass, "opacity-60")} style={style}>
        {cells}
      </div>
    );
  }

  return (
    <Link
      to={`/explore/${linkLanguageId}/${approach.id}`}
      aria-label={label}
      style={style}
      className={cn(rowClass, "group hover:border-[color:var(--row)] focus-visible:border-[color:var(--row)]")}
      onPointerEnter={() => {
        prefetch();
        onHoverChange(approach.id);
      }}
      onPointerLeave={() => onHoverChange(null)}
      onFocus={() => {
        prefetch();
        onHoverChange(approach.id);
      }}
      onBlur={() => onHoverChange(null)}
    >
      {cells}
    </Link>
  );
}
