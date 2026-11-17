import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { Tape } from "@/components/tape/Tape";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { errorMessage, useAutomaton, useDataset, useSummary } from "@/lib/api";
import { runDfa } from "@/lib/automata";
import { PIPELINES, duration, int, pct } from "@/lib/meta";
import type { ApproachId, ComparisonOverallRow, DfaPayload, PipelineId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isDfa } from "../data";
import { useLiveGate } from "../hooks";
import { numberWord } from "../text";
import { useDfaRun } from "../useDfaRun";

/* ------------------------------------------------------------------ shared bits */

function Loading({ className }: { className?: string }) {
  return <Skeleton className={cn("h-full min-h-48 w-full", className)} />;
}

function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState message={errorMessage(error)} onRetry={retry} />;
}

function Legend({ items }: { items: { label: string; color: string; hollow?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={it.hollow ? { boxShadow: `inset 0 0 0 1.5px ${it.color}` } : { background: it.color }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Plays once when the element first scrolls (or sweeps) into view. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { once: true, amount: 0.35 });
  return [ref, seen] as const;
}

/* ------------------------------------------------------------------ 1. dataset: strings per length */

export function LengthHistogram() {
  const ds = useDataset();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const model = useMemo(() => {
    if (!ds.data) return null;
    const { main = {}, long = {} } = ds.data.length_distribution;
    const lengths = [...new Set([...Object.keys(main), ...Object.keys(long)].map(Number))].filter(Number.isFinite).sort((a, b) => a - b);
    const bars = lengths.map((n) => ({ n, main: main[String(n)] ?? 0, long: long[String(n)] ?? 0 }));
    const buckets = ds.data.config.buckets;
    const trainMax = Math.max(...buckets.filter((b) => b.pool === "main").map((b) => b.hi));
    const exhaustiveMax = Math.max(-1, ...buckets.filter((b) => b.pool === "main" && b.size === null).map((b) => b.hi));
    const longMax = Math.max(...buckets.filter((b) => b.pool === "long").map((b) => b.hi));
    return { bars, trainMax, exhaustiveMax, longMax, total: ds.data.total_rows };
  }, [ds.data]);
  return (
    <div ref={ref}>
      {ds.isPending ? <Loading /> : ds.error || !model ? <Failed error={ds.error} retry={() => void ds.refetch()} /> : <Histogram model={model} seen={seen} />}
    </div>
  );
}

function Histogram({
  model,
  seen,
}: {
  model: { bars: { n: number; main: number; long: number }[]; trainMax: number; exhaustiveMax: number; longMax: number; total: number };
  seen: boolean;
}) {
  const reduce = useReducedMotion();
  const W = 460;
  const H = 236;
  const top = 34;
  const bottom = 26;
  const n = model.bars.length;
  const step = (W - 8) / n;
  const max = Math.max(...model.bars.map((b) => b.main + b.long));
  const scale = (v: number) => (v <= 0 ? 0 : (Math.log10(v + 1) / Math.log10(max + 1)) * (H - top - bottom));
  const splitX = 4 + (model.trainMax + 1) * step - 1;
  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Strings per length, log scale: ${int(model.total)} strings; lengths 0 to ${model.trainMax} for training and testing, ${model.trainMax + 1} to ${model.longMax} held out.`}
      >
        <line x1={splitX} x2={splitX} y1={8} y2={H - bottom + 4} stroke="var(--lamp)" strokeDasharray="3 4" strokeWidth={1.2} />
        <text x={splitX + 8} y={18} fontSize={11} fill="var(--lamp)" className="font-sans">
          never used for training
        </text>
        <text x={splitX - 8} y={18} fontSize={11} fill="var(--ink-2)" textAnchor="end" className="font-sans">
          train, validation, test
        </text>
        {model.bars.map((b, i) => {
          const v = b.main + b.long;
          const h = scale(v);
          const isLong = b.long > 0 && b.main === 0;
          return (
            <motion.rect
              key={b.n}
              x={4 + i * step + 1}
              width={Math.max(2, step - 2.5)}
              y={H - bottom - h}
              height={h}
              rx={1.5}
              fill={isLong ? "var(--lamp)" : "var(--ink-2)"}
              fillOpacity={isLong ? 0.85 : 0.7}
              initial={reduce ? false : { scaleY: 0 }}
              animate={seen || reduce ? { scaleY: 1 } : { scaleY: 0 }}
              transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.018, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}
            >
              <title>{`length ${b.n}: ${int(v)} strings`}</title>
            </motion.rect>
          );
        })}
        <line x1={4} x2={W - 4} y1={H - bottom} y2={H - bottom} stroke="var(--line-strong)" />
        {model.bars.map((b, i) =>
          b.n % 10 === 0 ? (
            <text key={b.n} x={4 + i * step + step / 2} y={H - 8} fontSize={11} textAnchor="middle" fill="var(--muted)" className="font-mono">
              {b.n}
            </text>
          ) : null,
        )}
      </svg>
      <p className="text-xs text-muted">
        Strings per length across all languages (log scale).{" "}
        {model.exhaustiveMax >= 0 && <>Every string up to length {model.exhaustiveMax} is included; longer ones are sampled.</>}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ 2. DFAs: the transition table at work */

const TABLE_STRINGS = ["abab", "babb", "aabba", "abb"];

export function TransitionTable() {
  const rec = useAutomaton("L7", "dfa");
  const summary = useSummary();
  const dfa = isDfa(rec.data?.automaton) ? rec.data.automaton : undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const live = useLiveGate(boxRef);
  const [k, setK] = useState(0);
  const input = TABLE_STRINGS[k % TABLE_STRINGS.length];
  const run = useDfaRun(dfa, input, k, { stepMs: 640, typing: false });

  useEffect(() => {
    if (run.phase !== "done" || !live) return;
    const t = window.setTimeout(() => setK((v) => v + 1), 1700);
    return () => window.clearTimeout(t);
  }, [run.phase, live]);

  const shrink = useMemo(() => {
    const langs = summary.data?.languages ?? [];
    let before = 0;
    let after = 0;
    for (const l of langs) {
      const b = l.truth["subset DFA states (before)"];
      const a = l.truth["minimized states (after)"];
      if (typeof b === "number" && typeof a === "number") {
        before += b;
        after += a;
      }
    }
    return before > 0 ? { before, after, count: langs.length } : null;
  }, [summary.data]);

  const step = run.index >= 0 ? run.steps[run.index] : null;
  return (
    <div ref={boxRef}>
      {rec.isPending ? (
        <Loading />
      ) : rec.error || !dfa ? (
        <Failed error={rec.error} retry={() => void rec.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Tape input={run.tape} head={run.head} status={run.status} size="md" label="Input tape for L7" />
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
            <table className="w-full border-collapse font-mono text-sm" aria-label="Transition table δ of the L7 DFA">
              <thead>
                <tr className="text-muted">
                  <th className="py-1.5 text-left text-xs font-normal">δ</th>
                  {dfa.alphabet.map((sym) => (
                    <th key={sym} scope="col" className={cn("py-1.5 text-center font-medium transition-colors", step?.symbol === sym && "text-lamp")}>
                      {sym}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dfa.states.map((q) => {
                  const here = run.current === q;
                  const start = q === dfa.start;
                  const acc = dfa.accepting.includes(q);
                  return (
                    <tr key={q} className="border-t border-line">
                      <th scope="row" className={cn("py-1 text-left font-medium transition-colors", here ? "text-lamp" : "text-ink-2")}>
                        <span className="inline-block w-4 text-muted">{start ? "→" : ""}</span>
                        {q}
                        {acc && <span className="ml-1 text-accept">*</span>}
                      </th>
                      {dfa.alphabet.map((sym) => {
                        const lit = step?.from === q && step.symbol === sym;
                        return (
                          <td key={sym} className="py-1 text-center">
                            <span
                              className={cn(
                                "inline-block min-w-10 rounded-md px-1.5 py-0.5 transition-colors duration-200",
                                lit ? "bg-lamp-soft text-lamp ring-1 ring-[color:var(--lamp)]" : "text-ink",
                              )}
                            >
                              {dfa.transitions[q]?.[sym] ?? "–"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <AutomatonGraph
              automaton={dfa}
              active={run.current ? [run.current] : []}
              activeEdge={run.edge}
              tokenKey={run.tokenKey}
              verdict={run.verdict}
              radius={19}
              zoomable={false}
              maxHeight={150}
              ariaLabel="The same L7 DFA drawn as a state diagram; the lit state matches the table."
            />
          </div>
          <p className="min-h-4 text-xs text-muted">
            {run.phase === "done"
              ? `${input} stops in ${run.finalState}, so it is ${run.accepted ? "accepted" : "rejected"}. (→ start, * accepting)`
              : step
                ? `Look up row ${step.from}, column ${step.symbol}: move to ${step.to}.`
                : `Start in ${dfa.start}.`}
          </p>
          {shrink && (
            <div className="space-y-1.5 border-t border-line pt-4">
              <p className="text-xs text-ink-2">States in the {shrink.count} subset-construction DFAs, before and after minimization</p>
              <Bar value={shrink.before} max={shrink.before} label={`${shrink.before} before`} color="var(--ink-2)" />
              <Bar value={shrink.after} max={shrink.before} label={`${shrink.after} after`} color="var(--accept)" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Bar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const reduce = useReducedMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, transformOrigin: "0% 50%" }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: seen || reduce ? value / max : 0 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-xs text-ink-2">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ 3. classifiers: what each model is, drawn as a schematic */

function Glyph({ id, seen }: { id: PipelineId; seen: boolean }) {
  const reduce = useReducedMotion();
  const color = PIPELINES.find((p) => p.id === id)?.color ?? "var(--ink-2)";
  const draw = (delay = 0) => ({
    initial: reduce ? false : { pathLength: 0, opacity: 0 },
    animate: seen || reduce ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 },
    transition: { duration: 0.7, delay: reduce ? 0 : delay },
  });
  const node = (cx: number, cy: number, r = 4.5, fill = false, delay = 0) => (
    <motion.circle
      key={`${cx}-${cy}`}
      cx={cx}
      cy={cy}
      r={r}
      fill={fill ? color : "var(--bg)"}
      stroke={color}
      strokeWidth={1.6}
      initial={reduce ? false : { scale: 0 }}
      animate={{ scale: seen || reduce ? 1 : 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : delay }}
      style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}
    />
  );
  const common = { fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const };
  if (id === "lr")
    return (
      <svg viewBox="0 0 120 80" aria-hidden>
        {[16, 40, 64].map((y, i) => (
          <motion.path key={y} d={`M14 ${y} L52 40`} {...common} {...draw(i * 0.08)} />
        ))}
        {[16, 40, 64].map((y, i) => node(10, y, 3.5, true, i * 0.05))}
        {node(58, 40, 8, false, 0.25)}
        <text x={58} y={44} textAnchor="middle" fontSize={11} fill={color} className="font-mono">
          Σ
        </text>
        <motion.path d="M70 62 C 86 62, 88 18, 112 18" {...common} {...draw(0.4)} />
      </svg>
    );
  if (id === "dt")
    return (
      <svg viewBox="0 0 120 80" aria-hidden>
        <motion.path d="M60 12 L36 40 M60 12 L84 40 M36 40 L22 68 M36 40 L50 68 M84 40 L72 68 M84 40 L98 68" {...common} {...draw(0)} />
        {node(60, 12, 5, true, 0)}
        {node(36, 40, 4.5, false, 0.15)}
        {node(84, 40, 4.5, false, 0.2)}
        {[22, 50, 72, 98].map((x, i) => node(x, 68, 4, i % 2 === 0, 0.3 + i * 0.05))}
      </svg>
    );
  if (id === "rf")
    return (
      <svg viewBox="0 0 120 80" aria-hidden>
        {[22, 60, 98].map((x, t) => (
          <g key={x}>
            <motion.path d={`M${x} 14 L${x - 12} 38 M${x} 14 L${x + 12} 38 M${x - 12} 38 L${x - 18} 58 M${x - 12} 38 L${x - 6} 58`} {...common} {...draw(t * 0.12)} />
            {node(x, 14, 4, true, t * 0.1)}
            {node(x - 12, 38, 3.5, false, 0.15 + t * 0.1)}
            {node(x + 12, 38, 3.5, true, 0.2 + t * 0.1)}
          </g>
        ))}
        <motion.path d="M10 72 H110" {...common} strokeDasharray="2 4" {...draw(0.5)} />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 80" aria-hidden>
      {(["lr", "dt", "rf"] as const).map((b, i) => {
        const y = 16 + i * 24;
        const c = PIPELINES.find((p) => p.id === b)?.color ?? color;
        return (
          <g key={b}>
            <motion.path d={`M20 ${y} L74 40`} fill="none" stroke={c} strokeWidth={1.6} {...draw(i * 0.08)} />
            <motion.circle
              cx={14}
              cy={y}
              r={6}
              fill="var(--bg)"
              stroke={c}
              strokeWidth={1.6}
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: seen || reduce ? 1 : 0 }}
              transition={{ duration: 0.35, delay: reduce ? 0 : i * 0.06 }}
              style={{ transformOrigin: `14px ${y}px`, transformBox: "view-box" }}
            />
          </g>
        );
      })}
      {node(82, 40, 9, true, 0.3)}
      <motion.path d="M92 40 H112" {...common} {...draw(0.45)} />
    </svg>
  );
}

export function ModelGlyphs() {
  const summary = useSummary();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const data = summary.data;
  /** Name, glyph, two bars on one shared 0-100 axis, the two values: one ruled row per model. */
  const cols = "grid grid-cols-[3px_42px_minmax(0,3rem)_minmax(0,1fr)_3.4rem] items-center gap-x-3 sm:grid-cols-[3px_42px_minmax(0,9.5rem)_minmax(0,1fr)_3.4rem]";
  return (
    <div ref={ref}>
      {summary.isPending ? (
        <Loading />
      ) : summary.error || !data ? (
        <Failed error={summary.error} retry={() => void summary.refetch()} />
      ) : (
        <figure className="flex flex-col">
          <Legend
            items={[
              { label: "test split", color: "var(--ink-2)" },
              { label: "strings longer than any in training", color: "var(--ink-2)", hollow: true },
            ]}
          />
          <ul className="mt-3 border-b border-line" aria-label="Mean accuracy per classifier">
            {PIPELINES.map((p, i) => {
              const test = data.summary.pipeline_averages.test[p.id]?.accuracy ?? null;
              const long = data.summary.pipeline_averages.long[p.id]?.accuracy ?? null;
              const bar = (v: number | null, hollow: boolean, k: number) => (
                <div className="relative h-[6px]">
                  <motion.div
                    className="absolute inset-y-0 left-0 w-full rounded-[2px]"
                    style={{
                      transformOrigin: "0% 50%",
                      background: hollow ? `color-mix(in srgb, ${p.color} 22%, transparent)` : p.color,
                      boxShadow: hollow ? `inset 0 0 0 1px ${p.color}` : undefined,
                    }}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: seen || reduce ? (v ?? 0) : 0 }}
                    transition={{ duration: 0.8, delay: reduce ? 0 : i * 0.06 + k * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              );
              return (
                <li
                  key={p.id}
                  className={cn(cols, "border-t border-line py-2.5")}
                  aria-label={`${p.name}: ${pct(test ?? undefined)} on the test split, ${pct(long ?? undefined)} on longer strings`}
                >
                  <span aria-hidden className="h-4 w-[3px] rounded-full" style={{ background: p.color }} />
                  <span aria-hidden className="flex h-7 w-[42px] items-center [&>svg]:h-full [&>svg]:w-full">
                    <Glyph id={p.id} seen={seen} />
                  </span>
                  <span className="min-w-0 text-sm font-medium leading-tight text-ink">
                    <span className="hidden sm:inline">{p.name}</span>
                    <span className="font-mono text-xs sm:hidden">{p.short}</span>
                  </span>
                  <span aria-hidden className="flex flex-col gap-[3px]">
                    {bar(test, false, 0)}
                    {bar(long, true, 1)}
                  </span>
                  <span aria-hidden className="flex flex-col items-end font-mono text-[11px] leading-[1.15] text-ink-2">
                    <span>{pct(test ?? undefined)}</span>
                    <span className="text-muted">{pct(long ?? undefined)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {/* the shared axis under the bars */}
          <div aria-hidden className={cn(cols, "pt-1 font-mono text-[10px] text-muted")}>
            <span />
            <span />
            <span />
            <span className="flex justify-between">
              <span>0</span>
              <span>50</span>
              <span>100%</span>
            </span>
            <span />
          </div>
          <figcaption className="pt-3 text-xs text-muted">
            Mean accuracy over the {numberWord(data.languages.length)} languages. Every model sees the same {data.meta.feature_count_binary} features per
            string.
          </figcaption>
        </figure>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 4. automata learning: an L* observation table filling in */

const S_ROWS = ["", "a", "ab", "abb"];
const SA_ROWS = ["b", "aa", "aba", "abba", "abbb"];
const E_COLS = ["", "b", "bb"];
const LEARNERS: { id: ApproachId; label: string; color: string }[] = [
  { id: "lstar_lr", label: "L* (LR)", color: "var(--series-lr)" },
  { id: "lstar_dt", label: "L* (DT)", color: "var(--series-dt)" },
  { id: "lstar_rf", label: "L* (RF)", color: "var(--series-rf)" },
  { id: "lstar_stack", label: "L* (Stack)", color: "var(--series-stack)" },
  { id: "rpni", label: "RPNI", color: "var(--series-rpni)" },
  { id: "edsm", label: "EDSM", color: "var(--series-edsm)" },
];

export function ObservationTable() {
  const rec = useAutomaton("L7", "dfa");
  const summary = useSummary();
  const dfa = isDfa(rec.data?.automaton) ? rec.data.automaton : undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const live = useLiveGate(boxRef);
  const reduce = useReducedMotion();
  const rows = [...S_ROWS, ...SA_ROWS];
  const total = rows.length * E_COLS.length;
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    if (reduce || !live || !dfa) return;
    const t = window.setTimeout(() => setFilled((f) => (f >= total + 16 ? 0 : f + 1)), filled === 0 ? 600 : 140);
    return () => window.clearTimeout(t);
  }, [live, dfa, filled, total, reduce]);

  const shown = reduce ? total : Math.min(filled, total);
  return (
    <div ref={boxRef}>
      {rec.isPending ? (
        <Loading />
      ) : rec.error || !dfa ? (
        <Failed error={rec.error} retry={() => void rec.refetch()} />
      ) : (
        <div className="grid items-start gap-x-5 gap-y-6 sm:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)]">
          <div>
            <ObsTable dfa={dfa} rows={rows} filled={shown} />
            <p className="mt-2 text-xs text-muted">
              {shown} membership {shown === 1 ? "query" : "queries"} on L7. {numberWord(distinctRows(dfa)).replace(/^./, (c) => c.toUpperCase())} different rows above the line:{" "}
              {numberWord(distinctRows(dfa))} states.
            </p>
          </div>
          <div className="min-w-0">
            <p className="mb-3 text-xs text-ink-2">Exact DFA recovered, per language</p>
            {summary.isPending ? (
              <Loading className="min-h-32" />
            ) : summary.error || !summary.data ? (
              <Failed error={summary.error} retry={() => void summary.refetch()} />
            ) : (
              <RecoveryDots automata={summary.data.automata} languages={summary.data.languages.map((l) => l.id)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Distinct rows of the S part of the table: the number of states of the hypothesis. */
function distinctRows(dfa: DfaPayload): number {
  return new Set(S_ROWS.map((r) => E_COLS.map((e) => (runDfa(dfa, r + e).accepted ? "1" : "0")).join(""))).size;
}

function ObsTable({ dfa, rows, filled }: { dfa: DfaPayload; rows: string[]; filled: number }) {
  const show = (s: string) => (s === "" ? "ε" : s);
  return (
    <table className="w-full border-collapse font-mono text-[13px]" aria-label="L* observation table for L7: rows are access strings, columns are suffixes, cells are membership answers">
      <thead>
        <tr className="text-muted">
          <th className="pb-1.5 text-left text-[11px] font-normal">S \ E</th>
          {E_COLS.map((e) => (
            <th key={e} scope="col" className="pb-1.5 text-center font-medium text-ink-2">
              {show(e)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((s, r) => (
          <tr key={s} className={cn("border-t", r === S_ROWS.length ? "border-line-strong" : "border-line")}>
            <th scope="row" className={cn("py-1 text-left font-medium", r < S_ROWS.length ? "text-ink" : "text-muted")}>
              {show(s)}
            </th>
            {E_COLS.map((e, c) => {
              const i = r * E_COLS.length + c;
              const on = i < filled;
              const fresh = i === filled - 1;
              const yes = runDfa(dfa, s + e).accepted;
              return (
                <td key={e} className="py-1 text-center">
                  <span
                    className={cn(
                      "inline-grid h-6 w-8 place-items-center rounded transition-colors duration-150",
                      !on && "text-transparent",
                      on && (yes ? "bg-accept-soft text-accept" : "text-ink-2"),
                      fresh && "ring-1 ring-[color:var(--lamp)]",
                    )}
                  >
                    {yes ? "1" : "0"}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecoveryDots({ automata, languages }: { automata: Record<string, Record<string, { equivalent_to_truth: boolean }>>; languages: string[] }) {
  return (
    <ul className="space-y-3">
      {LEARNERS.map((l) => {
        const marks = languages.map((lang) => ({ lang, ok: !!automata[lang]?.[l.id]?.equivalent_to_truth }));
        const hits = marks.filter((m) => m.ok).length;
        return (
          <li key={l.id} className="flex items-center gap-2" aria-label={`${l.label}: exact for ${hits} of ${marks.length} languages`}>
            <span className="w-[3.9rem] shrink-0 whitespace-nowrap text-xs text-ink-2">{l.label}</span>
            <span className="flex gap-[2px]" aria-hidden>
              {marks.map((m) => (
                <span
                  key={m.lang}
                  title={`${m.lang}: ${m.ok ? "exact" : "differs from the truth"}`}
                  className="h-2 w-2 rounded-[2px]"
                  style={m.ok ? { background: l.color } : { boxShadow: `inset 0 0 0 1.5px ${l.color}`, opacity: 0.7 }}
                />
              ))}
            </span>
            <span className="ml-auto font-mono text-xs text-ink">
              {hits}/{marks.length}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ 5. comparison: the machine against the best classifier */

export function CompareMeters() {
  const summary = useSummary();
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref}>
      {summary.isPending ? (
        <Loading />
      ) : summary.error || !summary.data ? (
        <Failed error={summary.error} retry={() => void summary.refetch()} />
      ) : (
        <Meters rows={summary.data.summary.comparison_overall} seen={seen} retry={() => void summary.refetch()} />
      )}
    </div>
  );
}

function Meters({ rows, seen, retry }: { rows: ComparisonOverallRow[]; seen: boolean; retry: () => void }) {
  const dfa = rows.find((r) => r.family === "ground truth");
  const ml = rows.filter((r) => r.family === "ML pipeline").sort((a, b) => b.test_accuracy - a.test_accuracy)[0];
  if (!dfa || !ml) return <Failed error={new Error("The comparison table is missing rows.")} retry={retry} />;
  const mlColor = PIPELINES.find((p) => p.name === ml.approach)?.color ?? "var(--series-rf)";
  const metrics: { label: string; get: (r: ComparisonOverallRow) => number; fmt: (r: ComparisonOverallRow) => string; log?: [number, number] }[] = [
    { label: "Accuracy on the test split", get: (r) => r.test_accuracy, fmt: (r) => pct(r.test_accuracy) },
    { label: "Accuracy on longer strings", get: (r) => r.long_accuracy, fmt: (r) => pct(r.long_accuracy) },
    { label: "Size", get: (r) => r.mean_size, fmt: (r) => `${int(r.mean_size)} ${r.size_unit === "transitions" ? "transitions" : "nodes"}`, log: [1, 100000] },
    { label: "Time per string", get: (r) => r.inference_us_per_string, fmt: (r) => duration(r.inference_us_per_string / 1e6), log: [0.1, 100] },
  ];
  return (
    <div className="flex flex-col gap-5">
      <Legend
        items={[
          { label: dfa.approach, color: "var(--series-truth)" },
          { label: `${ml.approach}, the most accurate classifier`, color: mlColor },
        ]}
      />
      {metrics.map((m, i) => (
        <div key={m.label}>
          <p className="mb-1.5 text-xs text-ink-2">
            {m.label}
            {m.log && <span className="text-muted"> (log scale)</span>}
          </p>
          {[
            { r: dfa, color: "var(--series-truth)" },
            { r: ml, color: mlColor },
          ].map(({ r, color }, j) => {
            const v = m.get(r);
            const frac = m.log ? Math.max(0.02, (Math.log10(v) - Math.log10(m.log[0])) / (Math.log10(m.log[1]) - Math.log10(m.log[0]))) : v;
            return <MeterRow key={r.approach} frac={Math.min(1, frac)} color={color} label={m.fmt(r)} seen={seen} delay={i * 0.12 + j * 0.06} />;
          })}
        </div>
      ))}
    </div>
  );
}

function MeterRow({ frac, color, label, seen, delay }: { frac: number; color: string; label: ReactNode; seen: boolean; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="mb-1 flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, transformOrigin: "0% 50%" }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: seen || reduce ? frac : 0 }}
          transition={{ duration: 0.9, delay: reduce ? 0 : delay, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <span className="w-36 shrink-0 text-right font-mono text-xs text-ink">{label}</span>
    </div>
  );
}
