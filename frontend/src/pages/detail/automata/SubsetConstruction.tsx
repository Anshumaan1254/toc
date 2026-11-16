import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { layoutGraph, toGraphModel, type Layout } from "@/components/graph/layout";
import { useTracePlayer } from "@/components/graph/useTracePlayer";
import CountUp from "@/components/reactbits/CountUp";
import { Term } from "@/components/ui/Term";
import type { DfaPayload, NfaPayload, SubsetStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setLabel, subsetsOf } from "./model";
import { AcceptIcon, StartIcon, TableScroller } from "./Tables";
import { PlayerBar, stateRadius, useAutoPlayOnView, useMediaQuery } from "./ui";

const edgeKey = (from: string, to: string) => `${from}\u0000${to}`;

/**
 * The subset DFA laid out once in full, then revealed state by state and arrow by arrow so
 * nothing jumps as it grows. Visual style adapted from src/components/graph/AutomatonGraph.tsx.
 */
function GrowingDfa({
  layout,
  visible,
  edges,
  focus,
  accepting,
  maxHeight,
  label,
}: {
  layout: Layout;
  visible: Set<string>;
  edges: Map<string, string[]>;
  focus: { from: string; to: string | null; key: string | null } | null;
  accepting: Set<string>;
  maxHeight: number;
  label: string;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const r = layout.r;
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={label} className="block h-auto w-full" style={{ maxHeight }}>
      <defs>
        {(["line", "lamp"] as const).map((kind) => (
          <marker key={kind} id={`grow-${kind}-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L10,5 L0,9 z" fill={kind === "lamp" ? "var(--lamp)" : "var(--ink-2)"} />
          </marker>
        ))}
        <filter id={`grow-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      {layout.startArrows.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--ink-2)" strokeWidth={1.6} markerEnd={`url(#grow-line-${uid})`} />
      ))}
      {layout.edges.map((e) => {
        const symbols = edges.get(e.key);
        if (!symbols) return null;
        const on = focus?.key === e.key;
        return (
          <g key={e.key}>
            <motion.path
              d={e.d}
              fill="none"
              stroke={on ? "var(--lamp)" : "var(--ink-2)"}
              strokeOpacity={on ? 1 : 0.62}
              strokeWidth={on ? 2.4 : 1.4}
              markerEnd={`url(#grow-${on ? "lamp" : "line"}-${uid})`}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            />
            <text
              x={e.lx}
              y={e.ly}
              textAnchor="middle"
              className="font-mono"
              fontSize={12}
              fill={on ? "var(--lamp)" : "var(--ink-2)"}
              fontWeight={on ? 600 : 400}
              stroke="var(--bg)"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {symbols.join(", ")}
            </text>
          </g>
        );
      })}
      {layout.nodes.map((n) => {
        if (!visible.has(n.id)) return null;
        const lit = focus !== null && (focus.from === n.id || focus.to === n.id);
        const label = n.id.length > 9 ? `${n.id.slice(0, 8)}…` : n.id;
        return (
          <motion.g
            key={n.id}
            initial={reduce ? false : { opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            style={{ transformOrigin: `${n.x}px ${n.y}px`, transformBox: "view-box" }}
          >
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={r + 6}
              fill="var(--lamp)"
              filter={`url(#grow-glow-${uid})`}
              initial={false}
              animate={{ opacity: lit ? 0.5 : 0 }}
              transition={{ duration: 0.25 }}
            />
            <circle cx={n.x} cy={n.y} r={r} fill="var(--state-fill)" stroke={lit ? "var(--lamp)" : "var(--ink-2)"} strokeWidth={lit ? 2.6 : 1.6} />
            {accepting.has(n.id) && <circle cx={n.x} cy={n.y} r={r - 4.5} fill="none" stroke={lit ? "var(--lamp)" : "var(--ink-2)"} strokeWidth={1.3} />}
            <text x={n.x} y={n.y + 4} textAnchor="middle" className="font-mono" fontSize={label.length > 5 ? 10 : 12.5} fontWeight={lit ? 600 : 500} fill="var(--ink)">
              {label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

function powerOfTwo(n: number): string {
  if (n <= 20) return (2 ** n).toLocaleString("en-US");
  return `about ${new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 0 }).format(2 ** n)}`;
}

function BlowUp({ nfa, dfa }: { nfa: NfaPayload; dfa: DfaPayload }) {
  const n = nfa.states.length;
  const m = dfa.states.length;
  const sets = Object.values(subsetsOf(dfa));
  const hasEmpty = sets.some((s) => s.length === 0);
  const allSubsetsWithStart = m === 2 ** (n - nfa.start.length) && sets.every((s) => nfa.start.every((q) => s.includes(q)));
  return (
    <div className="grid items-center gap-10 border-t border-line pt-12 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex items-end gap-6">
        <div>
          <div className="font-display text-7xl font-semibold leading-none text-ink">
            <CountUp to={n} mode="roll" duration={1.2} easing="expo" />
          </div>
          <div className="mt-2 text-sm text-muted">NFA states</div>
        </div>
        <svg width="56" height="24" viewBox="0 0 56 24" className="mb-9 text-muted" aria-hidden>
          <line x1="2" y1="12" x2="46" y2="12" stroke="currentColor" strokeWidth="1.6" />
          <path d="M44 6 L54 12 L44 18 z" fill="currentColor" />
        </svg>
        <div>
          <div className={cn("font-display text-7xl font-semibold leading-none", m > n ? "text-lamp" : "text-accept")}>
            <CountUp to={m} mode="roll" duration={1.4} delay={0.3} easing="expo" />
          </div>
          <div className="mt-2 text-sm text-muted">DFA states</div>
        </div>
      </div>
      <div className="max-w-2xl space-y-3 text-ink-2">
        <p>
          A DFA state stands for a set of NFA states, and {n} NFA states have 2<sup>{n}</sup> = {powerOfTwo(n)} possible subsets. Only {m} of them can
          ever be active together, so the subset construction stops at {m}.
        </p>
        {m > n ? (
          <p className="text-ink">
            Here determinism costs states: {m} instead of {n}. The NFA can guess where the part that matters begins; a DFA cannot guess, so it tracks every
            possibility at once.
            {allSubsetsWithStart && (
              <>
                {" "}
                Every one of the 2<sup>{n - nfa.start.length}</sup> = {m} sets that contain the always-active start state is reachable: the exponential
                blow-up, in full.
              </>
            )}
          </p>
        ) : m < n ? (
          <p className="text-ink">
            Here the DFA is smaller: {m} states instead of {n}.{" "}
            {nfa.has_epsilon
              ? "Thompson's construction adds many states that only glue ε-moves together, and each ε-closure collapses into a single DFA state."
              : "Several NFA states are always active together, so they share one DFA state."}
          </p>
        ) : (
          <p className="text-ink">
            Same size here: {m} reachable subsets for {n} NFA states.
          </p>
        )}
        {hasEmpty && <p className="text-sm text-muted">One of the DFA states is ∅, the empty set: once no NFA state is active, nothing can ever be accepted, so ∅ acts as the trap state.</p>}
      </div>
    </div>
  );
}

export function SubsetConstruction({ nfa, dfa, steps }: { nfa: NfaPayload; dfa: DfaPayload; steps: SubsetStep[] }) {
  const reduce = useReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");
  const subsets = useMemo(() => subsetsOf(dfa), [dfa]);
  const nfaAccepting = useMemo(() => new Set(nfa.accepting), [nfa]);
  const dfaAccepting = useMemo(() => new Set(dfa.accepting), [dfa]);
  const dfaRadius = useMemo(() => stateRadius(dfa), [dfa]);
  const nfaRadius = useMemo(() => stateRadius(nfa), [nfa]);
  const layout = useMemo(() => layoutGraph(toGraphModel(dfa), { rankdir: "LR", r: dfaRadius }), [dfa, dfaRadius]);
  const player = useTracePlayer(steps.length, { stepMs: 700 });
  const autoRef = useAutoPlayOnView(player.play);
  const index = Math.max(-1, Math.min(player.index, steps.length - 1));
  const step = index >= 0 ? steps[index] : null;

  // Two beats per step: first the subset being expanded, then the set it leads to.
  const [phase, setPhase] = useState<"read" | "result">("result");
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current || reduce || index < 0) {
      firstRun.current = false;
      setPhase("result");
      return;
    }
    setPhase("read");
    const t = window.setTimeout(() => setPhase("result"), Math.min(480, player.stepMs * 0.45));
    return () => window.clearTimeout(t);
  }, [index, reduce, player.stepMs]);

  const done = index >= steps.length - 1;
  const shown = phase === "result" ? index : index - 1; // last step whose result is on screen

  // Discovery order of DFA states, and what is known after `shown`.
  const order = useMemo(() => {
    const out = [dfa.start];
    for (const s of steps) if (!out.includes(s.to)) out.push(s.to);
    for (const q of dfa.states) if (!out.includes(q)) out.push(q);
    return out;
  }, [dfa, steps]);
  const known = useMemo(() => {
    const visible = new Set([dfa.start]);
    const edges = new Map<string, string[]>();
    const cells = new Map<string, string>();
    for (let i = 0; i <= shown; i++) {
      const s = steps[i];
      visible.add(s.from);
      visible.add(s.to);
      const k = edgeKey(s.from, s.to);
      edges.set(k, [...(edges.get(k) ?? []), s.symbol]);
      cells.set(`${s.from}\u0000${s.symbol}`, s.to);
    }
    if (step) visible.add(step.from);
    return { visible, edges, cells };
  }, [steps, shown, step, dfa.start]);

  const focus = step ? { from: step.from, to: phase === "result" ? step.to : null, key: phase === "result" ? edgeKey(step.from, step.to) : null } : null;
  const nfaActive = step ? (phase === "read" ? step.from_set : step.closure) : subsets[dfa.start] ?? nfa.start;
  const rows = order.filter((q) => known.visible.has(q));
  const startClosure = subsets[dfa.start] ?? [];
  const closureAdds = step ? step.closure.filter((q) => !step.move.includes(q)) : [];
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!step) return;
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(step.from)}"]`);
    const box = tableRef.current?.firstElementChild as HTMLElement | null;
    if (el && box) box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2);
  }, [step]);

  const bigNfa = nfa.states.length > 8;
  const bigDfa = dfa.states.length > 8;

  const nfaFigure = (
    <figure className="min-w-0 rounded-[24px] border border-line bg-panel/50 p-4">
      <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-x-4 text-sm">
        <span className="font-medium text-ink">The NFA</span>
        <span className="font-mono text-xs text-muted">{phase === "read" && step ? `expanding ${setLabel(step.from_set)}` : `lit ${setLabel(nfaActive)}`}</span>
      </figcaption>
      <div className="mx-auto w-full" style={{ maxWidth: bigNfa ? undefined : 640 }}>
        <AutomatonGraph
          automaton={nfa}
          active={nfaActive}
          radius={nfaRadius}
          maxHeight={narrow ? 240 : bigNfa ? 300 : 250}
          zoomable
          ariaLabel={`The NFA with ${nfa.states.length} states; lit: ${setLabel(nfaActive)}.`}
        />
      </div>
    </figure>
  );

  const dfaFigure = (
    <figure className="min-w-0 rounded-[24px] border border-line bg-panel/50 p-4">
      <figcaption className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-ink">The DFA so far</span>
        <span className="text-xs text-muted">
          {known.visible.size} of {dfa.states.length} states
        </span>
      </figcaption>
      <div className="mx-auto w-full" style={{ maxWidth: bigDfa ? undefined : Math.max(320, layout.width * 1.6) }}>
        <GrowingDfa
          layout={layout}
          visible={known.visible}
          edges={known.edges}
          focus={focus}
          accepting={dfaAccepting}
          maxHeight={narrow ? 260 : bigDfa ? 320 : 270}
          label={`The DFA built so far: ${known.visible.size} of ${dfa.states.length} states, ${[...known.edges.values()].reduce((a, s) => a + s.length, 0)} of ${steps.length} transitions.`}
        />
      </div>
    </figure>
  );

  const narrative = (
    <div ref={autoRef} className="min-w-0 space-y-6">
      <div className="min-h-[164px] space-y-3" aria-live={player.playing ? "off" : "polite"}>
        <p className="text-sm text-muted">{index < 0 ? "Start" : `Step ${index + 1} of ${steps.length}`}</p>
        {!step ? (
          <>
            <p className="break-words font-mono text-[15px] leading-relaxed text-ink">
              start = ε-closure({setLabel(nfa.start)}) = {setLabel(startClosure)} = <span className="text-lamp">{dfa.start}</span>
            </p>
            <p className="text-ink-2">
              The DFA starts in the set of NFA states active before any input: the start state plus everything its ε-moves reach. Call it {dfa.start}.
            </p>
          </>
        ) : (
          <>
            <p className="break-words font-mono text-[15px] leading-relaxed text-ink">
              δ({step.from}, <span className="text-lamp">{step.symbol}</span>) = ε-closure(move({setLabel(step.from_set)}, {step.symbol}))
              {phase === "result" && (
                <>
                  {" "}= ε-closure({setLabel(step.move)}) = {setLabel(step.closure)} = <span className="text-lamp">{step.to}</span>
                </>
              )}
            </p>
            <p className={cn("text-ink-2 transition-opacity duration-300", phase === "read" ? "opacity-40" : "opacity-100")}>
              On {step.symbol}, the states {setLabel(step.from_set)} can move to {setLabel(step.move)}.
              {closureAdds.length > 0 ? ` Following ε-moves adds ${setLabel(closureAdds)}.` : step.move.length > 0 && nfa.has_epsilon ? " No ε-move adds anything." : ""}{" "}
              {step.new ? <span className="font-medium text-lamp">That set is new, so it becomes DFA state {step.to}.</span> : <>That set is already DFA state {step.to}.</>}
            </p>
          </>
        )}
      </div>
      <PlayerBar player={player} total={steps.length} stepLabel="Step" name="subset construction" endLabel="Skip to the finished DFA" />
    </div>
  );

  const table = (
    <div ref={tableRef} className="min-w-0">
      <TableScroller label="DFA transition table, filled in as the construction runs" className="max-h-[420px]">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Subset-construction table: each DFA state, the NFA states it stands for, and its transitions</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-panel px-3 py-2.5 text-left text-xs font-medium text-ink-2">
                DFA state
              </th>
              <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-panel px-3 py-2.5 text-left text-xs font-medium text-ink-2">
                NFA states
              </th>
              {dfa.alphabet.map((s) => (
                <th key={s} scope="col" className="sticky top-0 z-[1] border-b border-line bg-panel px-3 py-2.5 text-center font-mono text-sm font-medium text-ink">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <motion.tr
                key={q}
                data-row={q}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className={cn(step?.from === q && "bg-lamp-soft/60")}
              >
                <th scope="row" className="border-b border-line/70 px-3 py-2 text-left font-mono font-medium text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex w-[18px] justify-center text-ink-2">{q === dfa.start && <StartIcon />}</span>
                    <span className="inline-flex w-4 justify-center text-accept">{dfaAccepting.has(q) && <AcceptIcon />}</span>
                    {q}
                  </span>
                </th>
                <td className="border-b border-line/70 px-3 py-2 font-mono text-[13px] text-ink-2">
                  {(subsets[q] ?? []).length === 0 ? (
                    "∅"
                  ) : (
                    <>
                      {"{"}
                      {(subsets[q] ?? []).map((s, i) => (
                        <span key={s}>
                          {i > 0 && ", "}
                          <span className={nfaAccepting.has(s) ? "font-semibold text-accept" : undefined}>{s}</span>
                        </span>
                      ))}
                      {"}"}
                    </>
                  )}
                </td>
                {dfa.alphabet.map((s) => {
                  const target = known.cells.get(`${q}\u0000${s}`);
                  const current = step?.from === q && step.symbol === s;
                  return (
                    <td
                      key={s}
                      className={cn(
                        "border-b border-line/70 px-3 py-2 text-center font-mono text-ink transition-colors duration-300",
                        current && "bg-lamp-soft ring-1 ring-inset ring-[color:var(--lamp)]",
                      )}
                    >
                      {target ?? <span className="text-muted/60">·</span>}
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
      <p className="mt-2 text-xs text-muted">A DFA state accepts when its set contains an accepting NFA state (shown in green).</p>
    </div>
  );

  const anySmall = !bigNfa || !bigDfa;

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        {bigNfa && nfaFigure}
        {bigDfa && dfaFigure}
        {anySmall ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              {!bigNfa && nfaFigure}
              {!bigDfa && dfaFigure}
            </div>
            <div className="min-w-0 space-y-6">
              {narrative}
              {table}
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {narrative}
            {table}
          </div>
        )}
      </div>

      {done && phase === "result" ? (
        <BlowUp nfa={nfa} dfa={dfa} />
      ) : (
        <p className="border-t border-line pt-8 text-ink-2">
          Play the construction to the end to compare the sizes. Each step answers one question: from this <Term k="subset-construction">set of NFA
          states</Term>, where does one symbol lead, once the <Term k="epsilon-closure">ε-closure</Term> is added?
        </p>
      )}
    </div>
  );
}
