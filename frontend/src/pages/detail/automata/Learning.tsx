import { createRef, useMemo, useRef, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { AnimatedBeam } from "@/components/magicui/animated-beam";
import CountUp from "@/components/reactbits/CountUp";
import { DimensionLine } from "@/components/ui/DimensionLine";
import { Term } from "@/components/ui/Term";
import { useApproaches } from "@/lib/api";
import { pct, showString } from "@/lib/meta";
import type { AutomatonMetrics, AutomatonRecord, DfaPayload, Language, LearningTrace } from "@/lib/types";
import { cn } from "@/lib/utils";
import { accessStrings, plural, stateNotes, stopReasonText } from "./model";
import { Meter, StatePill, useMediaQuery } from "./ui";

// ------------------------------------------------------------------ shared bits
function BigNumber({ value, label, hint, decimals = 0, suffix }: { value: number; label: ReactNode; hint?: ReactNode; decimals?: number; suffix?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline font-display text-4xl font-semibold leading-none text-ink">
        <CountUp to={value} decimals={decimals} separator="," mode={decimals === 0 ? "roll" : "count"} duration={1.6} easing="expo" />
        {suffix && <span className="ml-1 text-2xl text-ink-2">{suffix}</span>}
      </div>
      <div className="mt-2 text-sm text-ink-2">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function FidelityPanel({ metrics, modelName }: { metrics: AutomatonMetrics; modelName: string }) {
  const rows = [
    { split: "Test strings", n: metrics.test.n, lengths: "lengths 0–20", acc: metrics.test.accuracy, fid: metrics.test.fidelity },
    { split: "Long strings", n: metrics.long.n, lengths: "lengths 21–40, never trained on", acc: metrics.long.accuracy, fid: metrics.long.fidelity },
  ];
  const fid = metrics.test.fidelity ?? null;
  const acc = metrics.test.accuracy;
  const model = modelName.toLowerCase();
  const cex = metrics.counterexample_to_truth;
  let insight: string;
  if (fid === null) insight = "";
  else if (fid >= 0.99 && acc < 0.97) insight = `The DFA copies the ${model} almost perfectly, so its errors are the model's own: the model never learned the language, and L* faithfully extracted what it did learn.`;
  else if (fid >= 0.99 && metrics.equivalent_to_truth === true) insight = `The DFA agrees with both the ${model} and the true language: the model really did learn a finite-state machine.`;
  else if (fid >= 0.99)
    insight = `The DFA copies the ${model} and scores ${pct(acc)} on the test strings, yet it is not the true language${
      cex != null ? `: the equivalence check finds a string they both get wrong, ${showString(cex)}.` : "."
    }`;
  else if (acc > fid + 0.05) insight = `The DFA is closer to the truth than to its own model. With a limited state budget L* could not copy every mistake of the ${modelName.toLowerCase()}, and the simpler machine it kept is more right than the model.`;
  else insight = `The DFA neither matches the model exactly nor the language: it is an approximation of an approximation.`;
  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-2 text-ink-2">
        <p>
          <Term k="fidelity">Fidelity</Term> asks whether the DFA agrees with the model it was extracted from; accuracy asks whether it agrees with the
          true language. The two can differ a lot.
        </p>
        {insight && <p className="text-ink">{insight}</p>}
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.split} className="space-y-4">
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">{r.split}</span> <span className="text-muted">{r.n.toLocaleString("en-US")} strings, {r.lengths}</span>
            </p>
            {[
              { label: `Fidelity to the ${modelName.toLowerCase()}`, v: r.fid ?? null, color: "var(--series-edsm)" },
              { label: "Accuracy against the true language", v: r.acc, color: "var(--accept)" },
            ].map((m) => (
              <div key={m.label} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-x-4 gap-y-1.5">
                <span className="text-sm text-ink-2">{m.label}</span>
                <span className="text-right font-display text-xl font-semibold tabular-nums text-ink">{pct(m.v)}</span>
                <Meter value={m.v} color={m.color} label={`${m.label}: ${pct(m.v)}`} className="col-span-2" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ L*
export function LstarStory({ learning, metrics, modelName }: { learning: LearningTrace; metrics: AutomatonMetrics | null | undefined; modelName: string }) {
  const rounds = learning.rounds ?? [];
  const maxStates = Math.max(1, ...rounds.map((r) => r.states ?? 0));
  const shape = learning.table_shape;
  const converged = learning.converged ?? metrics?.converged ?? null;
  const equivalent = metrics?.equivalent_to_truth ?? null;
  const cexCount = Array.isArray(learning.counterexamples) ? learning.counterexamples.length : learning.counterexamples ?? 0;
  const eqQueries = learning.equivalence_queries ?? rounds.length;
  // eq_strings_tested is the total over all equivalence queries.
  const perQuery = learning.eq_strings_tested && eqQueries > 0 ? Math.round(learning.eq_strings_tested / eqQueries) : null;

  return (
    <div className="space-y-14">
      <div className="max-w-3xl space-y-3 text-ink-2">
        <p>
          <Term k="lstar">L*</Term> treated the trained {modelName.toLowerCase()} as its teacher. It filled an{" "}
          <Term k="observation-table">observation table</Term> with <Term k="membership-query">membership queries</Term>, built the smallest DFA
          that fits the table, then asked an <Term k="equivalence-query">equivalence query</Term>: does this DFA agree with the model on a batch of{" "}
          {perQuery ? `about ${perQuery.toLocaleString("en-US")} test strings` : "test strings"}? Each disagreement came back as a{" "}
          <Term k="counterexample">counterexample</Term>, grew the table, and the loop went round again
          {learning.eq_strings_tested ? ` (${learning.eq_strings_tested.toLocaleString("en-US")} strings tested in all)` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-y border-line py-8 sm:grid-cols-3 lg:grid-cols-5">
        <BigNumber value={learning.membership_queries ?? 0} label="membership queries" hint="questions of the form: is w accepted?" />
        <BigNumber value={eqQueries} label="equivalence queries" hint={`${plural(cexCount, "counterexample")} returned`} />
        <BigNumber value={learning.closedness_fixes ?? 0} label={<>times the table was not <Term k="closed">closed</Term></>} />
        <BigNumber value={learning.consistency_fixes ?? 0} label={<>times it was not <Term k="consistent">consistent</Term></>} />
        <BigNumber
          value={(learning.learning_time_s ?? metrics?.learning_time_s ?? 0) * 1000}
          decimals={1}
          suffix="ms"
          label="learning time"
          hint={shape ? `final table ${shape.S} × ${shape.E}` : undefined}
        />
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="font-display text-2xl font-semibold text-ink">Round by round</h3>
          <p className="mt-1 text-sm text-muted">Table sizes read access strings × experiments: the rows that become states, and the suffixes that tell them apart.</p>
        </div>
        <ol className="border-t border-line">
          {rounds.map((r, i) => (
            <motion.li
              key={r.round}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -6% 0px" }}
              transition={{ duration: 0.5, delay: Math.min(i, 10) * 0.05 }}
              className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-6 gap-y-2 border-b border-line py-4 md:grid-cols-[88px_minmax(0,1fr)_minmax(0,1.1fr)]"
            >
              <div className="font-display text-lg font-semibold text-ink">Round {r.round}</div>
              <div className="min-w-0 space-y-1.5">
                {r.states !== null ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink">
                        Hypothesis with <span className="font-semibold tabular-nums">{plural(r.states, "state")}</span>
                      </span>
                      <span className="whitespace-nowrap text-xs text-muted">
                        table {r.S} × {r.E}
                      </span>
                    </div>
                    <Meter value={Math.max(0.02, r.states / maxStates)} color="var(--lamp)" label={`${r.states} states`} />
                  </>
                ) : (
                  <p className="text-sm text-ink-2">
                    No hypothesis: the table reached {r.S} × {r.E} and the next one would break the state budget.
                  </p>
                )}
              </div>
              <div className="col-span-2 min-w-0 text-sm md:col-span-1">
                {r.counterexample !== null ? (
                  <p className="text-ink-2">
                    The model disagreed on{" "}
                    <span className="break-all rounded-md bg-lamp-soft px-1.5 py-0.5 font-mono text-[13px] text-ink">{showString(r.counterexample)}</span>
                  </p>
                ) : r.aborted ? (
                  <p className="text-lamp">Stopped at the state budget.</p>
                ) : (
                  <p className="text-accept">No counterexample: the teacher agreed.</p>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
        <div className={cn("max-w-3xl border-l-2 pl-5", converged ? "border-[color:var(--accept)]" : "border-[color:var(--lamp)]")}>
          <p className="text-ink">{stopReasonText(learning.stop_reason, converged)}</p>
          {converged === false && equivalent === true && (
            <p className="mt-1 text-ink-2">
              The model kept producing counterexamples it got wrong itself, so L* ran out of room. The DFA shown is the last complete hypothesis, and
              that one is exactly the true language.
            </p>
          )}
          {converged === false && equivalent === false && (
            <p className="mt-1 text-ink-2">The DFA shown is the last complete hypothesis: a snapshot of the model's behaviour, not a finished copy.</p>
          )}
          {converged === true && equivalent === false && (
            <p className="mt-1 text-ink-2">The model and the DFA agree, but both differ from the true language: the model learned something else.</p>
          )}
        </div>
      </div>

      {metrics && <FidelityPanel metrics={metrics} modelName={modelName} />}
    </div>
  );
}

// ------------------------------------------------------------------ RPNI / EDSM
/** The first prefixes of the prefix tree fly to the state their prefix reaches in the learned DFA. */
function PrefixFold({ dfa, ptaStates }: { dfa: DfaPayload; ptaStates: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");
  const depth = narrow ? 5 : 6;
  const W = 760;
  const H = 360;
  const targets = useMemo(() => {
    const ys = dfa.states.map((_, i) => (H / (dfa.states.length + 1)) * (i + 1));
    return new Map(dfa.states.map((q, i) => [q, { x: W - 70, y: ys[i] }]));
  }, [dfa]);
  const dots = useMemo(() => {
    const out: { id: string; x: number; y: number; px: number | null; py: number | null; to: string; level: number }[] = [];
    const k = dfa.alphabet.length;
    const run = (w: string) => {
      let q: string | undefined = dfa.start;
      for (const s of w) q = q === undefined ? undefined : dfa.transitions[q]?.[s];
      return q;
    };
    let frontier: { w: string; x: number; y: number }[] = [{ w: "", x: 40, y: H / 2 }];
    for (let level = 0; level <= depth; level++) {
      const next: { w: string; x: number; y: number }[] = [];
      const count = Math.pow(k, level);
      frontier.forEach((node, idx) => {
        const to = run(node.w);
        const parent = level === 0 ? null : out.find((d) => d.id === node.w.slice(0, -1));
        if (to !== undefined) out.push({ id: node.w, x: node.x, y: node.y, px: parent?.x ?? null, py: parent?.y ?? null, to, level });
        if (level < depth) {
          for (let c = 0; c < k; c++) {
            const childIndex = idx * k + c;
            const childCount = count * k;
            next.push({ w: node.w + dfa.alphabet[c], x: 40 + ((level + 1) * (W - 260)) / depth, y: ((childIndex + 0.5) / childCount) * (H - 30) + 15 });
          }
        }
      });
      frontier = next;
    }
    return out;
  }, [dfa, depth]);
  const accepting = new Set(dfa.accepting);
  const fold = inView || !!reduce;
  const counts = new Map<string, number>();
  for (const d of dots) counts.set(d.to, (counts.get(d.to) ?? 0) + 1);
  // Where each dot settles: a comb of rows behind its state, so the fold ends as a histogram of
  // how many prefixes each state absorbed (shortest prefixes nearest the state).
  const settle = useMemo(() => {
    const spacing = H / (dfa.states.length + 1);
    const maxRows = Math.max(1, Math.floor((spacing - 10) / 7.5));
    const seen = new Map<string, number>();
    const out = new Map<string, { x: number; y: number }>();
    for (const d of [...dots].sort((a, b) => a.level - b.level)) {
      const t = targets.get(d.to)!;
      const total = counts.get(d.to) ?? 1;
      const rows = Math.min(maxRows, Math.max(2, Math.ceil(total / 18)));
      const k = seen.get(d.to) ?? 0;
      seen.set(d.to, k + 1);
      const col = Math.floor(k / rows);
      const row = k % rows;
      out.set(d.id, { x: t.x - 38 - col * 7.5, y: t.y + (row - (rows - 1) / 2) * 7.5 });
    }
    return out;
  }, [dots, targets, counts, dfa.states.length]);

  return (
    <div ref={ref} className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`The first ${dots.length} prefixes of the prefix tree, each moving to the state it reaches in the learned ${dfa.states.length}-state DFA.`}>
        <motion.g initial={false} animate={{ opacity: fold ? 0.08 : 0.5 }} transition={{ duration: 0.8, delay: fold && !reduce ? 0.5 : 0 }}>
          {dots.map((d) => d.px !== null && d.py !== null && <line key={`l-${d.id}`} x1={d.px} y1={d.py} x2={d.x} y2={d.y} stroke="var(--ink-2)" strokeWidth={0.8} />)}
        </motion.g>
        {dots.map((d) => {
          const end = settle.get(d.id)!;
          const delay = 0.6 + d.level * 0.12 + (d.y / H) * 0.25;
          return (
            <motion.circle
              key={d.id}
              r={d.level === 0 ? 4.2 : 3}
              fill={accepting.has(d.to) ? "var(--accept)" : "var(--ink-2)"}
              initial={false}
              animate={fold ? { cx: end.x, cy: end.y, opacity: 0.85 } : { cx: d.x, cy: d.y, opacity: 0.9 }}
              transition={reduce ? { duration: 0 } : { duration: 1.3, ease: [0.6, 0, 0.2, 1], delay }}
            />
          );
        })}
        {dfa.states.map((q, i) => {
          const t = targets.get(q)!;
          return (
            <motion.g
              key={q}
              initial={false}
              animate={{ opacity: fold ? 1 : 0.25, scale: fold ? 1 : 0.85 }}
              transition={{ duration: 0.5, delay: fold && !reduce ? 1.6 + i * 0.08 : 0 }}
              style={{ transformOrigin: `${t.x}px ${t.y}px`, transformBox: "view-box" }}
            >
              <circle cx={t.x} cy={t.y} r={22} fill="var(--state-fill)" stroke="var(--ink-2)" strokeWidth={1.6} />
              {accepting.has(q) && <circle cx={t.x} cy={t.y} r={17.5} fill="none" stroke="var(--ink-2)" strokeWidth={1.3} />}
              <text x={t.x} y={t.y + 4} textAnchor="middle" className="font-mono" fontSize={12.5} fill="var(--ink)">
                {q.length > 6 ? `${q.slice(0, 5)}…` : q}
              </text>
              <text x={t.x + 30} y={t.y + 4} className="font-mono" fontSize={11} fill="var(--muted)">
                ×{counts.get(q) ?? 0}
              </text>
            </motion.g>
          );
        })}
      </svg>
      <p className="text-sm text-muted">
        The first {dots.length} nodes of the prefix tree (all prefixes up to length {depth}) fold into the state each prefix reaches in the learned
        DFA; green dots are accepting. The full tree had {ptaStates.toLocaleString("en-US")} states.
      </p>
    </div>
  );
}

export function PassiveStory({ learning, metrics, dfa, approachId, consistent }: { learning: LearningTrace; metrics: AutomatonMetrics | null | undefined; dfa: DfaPayload; approachId: "rpni" | "edsm"; consistent: boolean | null }) {
  const name = approachId.toUpperCase();
  return (
    <div className="space-y-12">
      <div className="max-w-3xl space-y-3 text-ink-2">
        <p>
          {name} never asks a question. It only sees the labelled training strings. First it builds a <Term k="pta">prefix tree acceptor</Term>: one
          state per distinct prefix, accepting exactly the positive examples. Then it merges states, keeping a merge only if the merged machine still
          rejects every negative example.
        </p>
        {approachId === "rpni" ? (
          <p>
            <Term k="rpni">RPNI</Term> walks the tree in a fixed order. Each candidate (a blue state at the edge of the finished part) is tried
            against every finished (red) state; the first merge that stays consistent wins. If none does, the candidate is promoted to red.
          </p>
        ) : (
          <p>
            <Term k="edsm">EDSM</Term> scores every red–blue pair by how many labelled states would agree after merging, and performs the merge with
            the most evidence first. Strong evidence makes wrong merges, the ones that generalize badly, much less likely.
          </p>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PrefixFold dfa={dfa} ptaStates={learning.pta_states ?? 0} />
        <div className="grid grid-cols-2 content-start gap-x-8 gap-y-8">
          <div className="col-span-2 min-w-0 space-y-2" role="img" aria-label={`${(learning.pta_states ?? 0).toLocaleString("en-US")} prefix-tree states merged down to ${learning.states ?? dfa.states.length}`}>
            <div className="flex items-baseline justify-between gap-6">
              <span className="t-stat text-ink">
                <CountUp to={learning.pta_states ?? 0} separator="," mode="roll" duration={1.6} easing="expo" />
              </span>
              <span className="t-stat text-ink">{learning.states ?? dfa.states.length}</span>
            </div>
            <DimensionLine label={`${(learning.pta_states ?? 0).toLocaleString("en-US")} prefix-tree states to ${learning.states ?? dfa.states.length}`} />
          </div>
          <BigNumber value={learning.merges ?? 0} label="merges kept" hint={learning.merge_attempts ? `${learning.merge_attempts} merges tried` : undefined} />
          <BigNumber value={learning.promotions ?? 0} label="promotions to red" />
          <BigNumber value={(learning.learning_time_s ?? metrics?.learning_time_s ?? 0) * 1000} decimals={1} suffix="ms" label="learning time" />
          {consistent !== null && (
            <div className="min-w-0">
              <div className={cn("font-display text-4xl font-semibold leading-none", consistent ? "text-accept" : "text-reject")}>{consistent ? "Yes" : "No"}</div>
              <div className="mt-2 text-sm text-ink-2">labels every training string correctly</div>
            </div>
          )}
        </div>
      </div>

      {metrics && (
        <div className={cn("max-w-3xl border-l-2 pl-5", metrics.equivalent_to_truth ? "border-[color:var(--accept)]" : "border-[color:var(--reject)]")}>
          {metrics.equivalent_to_truth ? (
            <p className="text-ink">The training strings were rich enough: the merged DFA is exactly the true language.</p>
          ) : (
            <p className="text-ink">
              Every training string is labelled correctly, yet the DFA is not the true language: it disagrees on{" "}
              <span className="rounded-md bg-lamp-soft px-1.5 py-0.5 font-mono text-ink">{showString(metrics.counterexample_to_truth ?? "")}</span>. The
              sample was missing a <Term k="characteristic-sample">characteristic</Term> string that would have blocked a wrong merge.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ground truth
function Pipeline({ steps }: { steps: { title: string; value: ReactNode; detail: ReactNode; tone?: "accept" | "lamp" }[] }) {
  const container = useRef<HTMLDivElement>(null);
  const count = steps.length;
  const nodeRefs = useMemo(() => Array.from({ length: count }, () => createRef<HTMLDivElement>()), [count]);
  const wide = useMediaQuery("(min-width: 1024px)");
  const reduce = useReducedMotion();
  return (
    <div ref={container} className="relative">
      <ol className="relative z-[1] grid gap-6 lg:gap-10" style={{ gridTemplateColumns: wide ? `repeat(${count}, minmax(0, 1fr))` : undefined }}>
        {steps.map((s, i) => (
          <motion.li
            key={s.title}
            className="relative"
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.6, delay: i * 0.15 }}
          >
            <div
              ref={nodeRefs[i]}
              className={cn(
                "grid h-14 w-14 place-items-center rounded-full border-2 bg-[color:var(--bg)] font-display text-xl font-semibold",
                s.tone === "accept" ? "border-[color:var(--accept)] text-accept" : s.tone === "lamp" ? "border-[color:var(--lamp)] text-lamp" : "border-line-strong text-ink",
              )}
            >
              {s.value}
            </div>
            <p className="mt-4 font-display text-lg font-semibold text-ink">{s.title}</p>
            <div className="mt-1 text-sm text-ink-2">{s.detail}</div>
          </motion.li>
        ))}
      </ol>
      {wide &&
        !reduce &&
        steps.slice(1).map((_, i) => (
          <AnimatedBeam
            key={i}
            containerRef={container}
            fromRef={nodeRefs[i]}
            toRef={nodeRefs[i + 1]}
            startXOffset={30}
            endXOffset={-30}
            pathColor="var(--line-strong)"
            pathOpacity={1}
            pathWidth={1.5}
            gradientStartColor="var(--lamp)"
            gradientStopColor="var(--lamp)"
            duration={3.2}
            delay={i * 0.6}
          />
        ))}
    </div>
  );
}

export function TruthStory({ dfa, language }: { dfa: DfaPayload; language: Language }) {
  const reduce = useReducedMotion();
  const notes = stateNotes(dfa);
  const access = useMemo(() => accessStrings(dfa), [dfa]);
  return (
    <div className="space-y-12">
      <p className="max-w-3xl text-ink-2">
        Nobody learned this one. It was written by hand from the definition of {language.id}: decide what the machine must remember about the
        string so far, give each fact a state, then fill in one arrow for every state and symbol.
      </p>
      <div className="space-y-4">
        <h3 className="font-display text-2xl font-semibold text-ink">What each state remembers</h3>
        <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {dfa.states.map((q, i) => (
            <motion.li
              key={q}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -6% 0px" }}
              transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.05 }}
              className="flex items-start gap-4 border-b border-line pb-4"
            >
              <StatePill tone={dfa.accepting.includes(q) ? "accept" : "neutral"} className="mt-0.5 text-[15px]">
                {q}
              </StatePill>
              <div className="min-w-0">
                <p className="text-ink">{notes[q] ?? "–"}</p>
                <p className="text-xs text-muted">
                  first reached by <span className="font-mono">{showString(access.get(q) ?? "")}</span>
                  {dfa.accepting.includes(q) ? ", accepting" : ""}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="space-y-6">
        <h3 className="font-display text-2xl font-semibold text-ink">How we know it is right</h3>
        <Pipeline
          steps={[
            { title: "Hand-built DFA", value: dfa.states.length, detail: <>{plural(dfa.states.length, "state")}, written from the definition.</> },
            { title: "NFA, determinized", value: "≡", detail: <>The hand-built NFA, turned into a DFA by the <Term k="subset-construction">subset construction</Term>.</>, tone: "lamp" },
            { title: "Regex, via Thompson", value: "≡", detail: <>Thompson's ε-NFA of <code className="font-mono">{language.regex}</code>, determinized the same way.</>, tone: "lamp" },
            { title: "Proved equivalent", value: "✓", detail: <>The <Term k="product">product construction</Term> found no string where any two disagree, and every dataset label was cross-checked against all of them.</>, tone: "accept" },
          ]}
        />
      </div>
    </div>
  );
}

export function MinDfaStory({ record, language }: { record: AutomatonRecord; language: Language }) {
  const approaches = useApproaches(language.id);
  const nfa = approaches.data?.find((a) => a.id === "nfa");
  const m = record.minimization;
  const nfaStates = nfa?.stats.states;
  const eps = nfa?.stats.epsilon_moves ?? 0;
  const before = m?.states_before ?? nfa?.stats.subset_dfa_states;
  const after = m?.states_after ?? record.automaton.num_states;
  return (
    <div className="space-y-10">
      <p className="max-w-3xl text-ink-2">
        This DFA was computed, not drawn. Starting from the NFA for {language.id}, the subset construction makes it deterministic and Hopcroft's
        algorithm merges every pair of states no string can tell apart. The result is the unique smallest DFA for the language, up to renaming
        states.
      </p>
      <Pipeline
        steps={[
          { title: eps > 0 ? "Thompson ε-NFA" : "Hand-built NFA", value: nfaStates ?? "–", detail: <>{nfaStates !== undefined ? plural(nfaStates, "state") : "NFA"}{eps > 0 ? `, ${plural(eps, "ε-move")}` : ", no ε-moves"}.</> },
          { title: "Subset construction", value: before ?? "–", detail: <>{before !== undefined ? plural(before, "DFA state") : "DFA"}: one per reachable set of NFA states.</>, tone: "lamp" },
          { title: "Hopcroft minimization", value: after, detail: <>{plural(after, "state")}: equivalent states merged.</>, tone: "lamp" },
          { title: "Checked", value: "✓", detail: <>Equivalent to the hand-built DFA by the <Term k="product">product construction</Term>.</>, tone: "accept" },
        ]}
      />
      <p className="text-sm text-muted">
        No training data was involved. Open the NFA page to watch the subset construction itself, and the Minimization tab to watch the merge.
      </p>
    </div>
  );
}
