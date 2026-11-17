import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DimensionLine } from "@/components/ui/DimensionLine";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { layoutGraph, toGraphModel, type Layout } from "@/components/graph/layout";
import { useTracePlayer } from "@/components/graph/useTracePlayer";
import { Term } from "@/components/ui/Term";
import type { AutomatonMetrics, DfaPayload, Language, LearningTrace, Minimization } from "@/lib/types";
import { cn } from "@/lib/utils";
import { blockColor, lineageSlots, metaNumber, plural } from "./model";
import { Meter, PlayerBar, stateRadius, useAutoPlayOnView, useElementWidth, useMediaQuery } from "./ui";

/**
 * The subset DFA drawn exactly like AutomatonGraph (same layout, radius and strokes), whose
 * states then slide into the centroid of their group: the moment the groups become states.
 * Visual style adapted from src/components/graph/AutomatonGraph.tsx.
 */
function CollapseSvg({ layout, slots, maxHeight }: { layout: Layout; slots: Record<string, number>; maxHeight: number }) {
  const r = layout.r;
  const centroid = useMemo(() => {
    const sums = new Map<number, { x: number; y: number; n: number }>();
    for (const node of layout.nodes) {
      const s = slots[node.id] ?? -1;
      const acc = sums.get(s) ?? { x: 0, y: 0, n: 0 };
      sums.set(s, { x: acc.x + node.x, y: acc.y + node.y, n: acc.n + 1 });
    }
    return (id: string) => {
      const c = sums.get(slots[id] ?? -1)!;
      return { x: c.x / c.n, y: c.y / c.n };
    };
  }, [layout, slots]);
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="block h-auto w-full" style={{ maxHeight }} aria-hidden>
      <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.35 }}>
        {layout.startArrows.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--ink-2)" strokeWidth={1.6} />
        ))}
        {layout.edges.map((e) => (
          <g key={e.key}>
            <path d={e.d} fill="none" stroke="var(--ink-2)" strokeOpacity={0.62} strokeWidth={1.4} />
            <text x={e.lx} y={e.ly} textAnchor="middle" className="font-mono" fontSize={12} fill="var(--ink-2)" stroke="var(--bg)" strokeWidth={4} paintOrder="stroke">
              {e.label}
            </text>
          </g>
        ))}
      </motion.g>
      {layout.nodes.map((n, i) => {
        const c = centroid(n.id);
        const tint = blockColor(slots[n.id]);
        const label = n.id.length > 9 ? `${n.id.slice(0, 8)}…` : n.id;
        return (
          <motion.g
            key={n.id}
            initial={{ x: 0, y: 0 }}
            animate={{ x: c.x - n.x, y: c.y - n.y }}
            transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.12 + (i % 7) * 0.025 }}
          >
            <circle cx={n.x} cy={n.y} r={r} fill={`color-mix(in srgb, ${tint} 26%, var(--state-fill))`} stroke={tint} strokeWidth={1.6} />
            {n.accepting && <circle cx={n.x} cy={n.y} r={r - 4.5} fill="none" stroke={tint} strokeWidth={1.3} />}
            <motion.text
              x={n.x}
              y={n.y + 4}
              textAnchor="middle"
              className="font-mono"
              fontSize={label.length > 5 ? 10 : 12.5}
              fontWeight={500}
              fill="var(--ink)"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
            >
              {label}
            </motion.text>
          </motion.g>
        );
      })}
    </svg>
  );
}

function BlockChips({ blocks, slots, label }: { blocks: string[][]; slots: Record<string, number>; label: string }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {blocks.map((b) => {
        const color = blockColor(slots[b[0]]);
        return (
          <motion.li
            layout
            key={b.join("|")}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[13px] text-ink"
            style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
            {`{${b.join(", ")}}`}
          </motion.li>
        );
      })}
    </ul>
  );
}

export function MinimizationView({ minimization, after }: { minimization: Minimization; after: DfaPayload }) {
  const reduce = useReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");
  const before = minimization.before;
  const rounds = minimization.moore_rounds;
  const R = rounds.length;
  const rankdir = narrow && before.states.length > 4 ? "TB" : "LR";
  const slotsByRound = useMemo(() => lineageSlots(rounds), [rounds]);
  const finalSlots = slotsByRound[R - 1] ?? {};
  const afterSlots = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [state, members] of Object.entries(minimization.groups)) if (members.length) out[state] = finalSlots[members[0]] ?? 0;
    return out;
  }, [minimization.groups, finalSlots]);
  const radius = useMemo(() => stateRadius(before), [before]);
  const afterRadius = useMemo(() => stateRadius(after), [after]);
  const layout = useMemo(() => layoutGraph(toGraphModel(before), { rankdir, r: radius }), [before, rankdir, radius]);
  const player = useTracePlayer(R + 1, { stepMs: 1100 });
  const autoRef = useAutoPlayOnView(player.play);
  const index = Math.max(-1, Math.min(player.index, R));
  const merged = index === R;
  const nothingToMerge = minimization.states_before === minimization.states_after;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!merged) {
      setSettled(false);
      return;
    }
    if (reduce || nothingToMerge) {
      setSettled(true);
      return;
    }
    const t = window.setTimeout(() => setSettled(true), 1150);
    return () => window.clearTimeout(t);
  }, [merged, reduce, nothingToMerge]);

  const afterLayout = useMemo(() => layoutGraph(toGraphModel(after), { rankdir, r: afterRadius }), [after, rankdir, afterRadius]);
  const box = useElementWidth<HTMLDivElement>();
  const maxH = narrow ? 380 : 430;
  // Small machines should not balloon to the full width: cap each drawing relative to its own layout.
  const beforeMaxW = Math.max(320, layout.width * 1.6);
  const afterMaxW = Math.max(280, afterLayout.width * 1.6);
  const usableW = box.width > 0 ? Math.min(box.width, beforeMaxW) : 0;
  const stageHeight = usableW > 0 ? Math.min(maxH, (usableW * layout.height) / layout.width) : 0;
  const slots = index >= 0 && !merged ? slotsByRound[index] : merged ? finalSlots : undefined;
  const blocks = index >= 0 ? rounds[Math.min(index, R - 1)] : null;

  let caption: ReactNode;
  if (index < 0) caption = <>The DFA that the subset construction produced: {plural(before.states.length, "state")}. Moore's algorithm sorts them into groups of states that behave the same.</>;
  else if (merged)
    caption = nothingToMerge ? (
      <>Every group holds a single state, so there is nothing to merge: the subset DFA was already minimal.</>
    ) : (
      <>Each group becomes one state: {plural(minimization.states_before, "state")} merge into {minimization.states_after}. Arrows follow the group, and a group accepts if its states accept.</>
    );
  else if (index === 0)
    caption = (
      <>
        Round 0 splits accepting states from the rest: the empty string alone tells them apart.
        {R === 1 && " No later round splits anything, so this partition is already final."}
      </>
    );
  else if (index === R - 1) caption = <>Round {index} splits nothing new, so the partition is stable: states in the same group can never be told apart by any string.</>;
  else
    caption = (
      <>
        Round {index}: two states stay together only if every symbol takes them into the same group of round {index - 1}. Within a group, no string
        of length {index} or less separates them.
      </>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <p className="max-w-2xl text-ink-2">
          The minimized DFA was produced by <Term k="hopcroft">Hopcroft's algorithm</Term>. Below are the rounds of{" "}
          <Term k="moore">Moore's algorithm</Term>, its simpler cousin, which reaches the same groups one string length at a time.
        </p>
        <div className="w-[min(100%,15rem)] space-y-2" role="img" aria-label={`${minimization.states_before} states before, ${minimization.states_after} after`}>
          <div className="flex items-baseline justify-between gap-6">
            <span className="t-stat text-ink">{minimization.states_before}</span>
            <span className={cn("t-stat transition-colors duration-500", merged ? "text-lamp" : "text-ink")}>{minimization.states_after}</span>
          </div>
          <DimensionLine label={`${minimization.states_before} states to ${minimization.states_after}`} />
        </div>
      </div>

      <div className="rounded-[24px] border border-line bg-panel/50 p-4 sm:p-6">
        <div ref={box.ref} className="relative w-full" style={{ height: stageHeight || undefined, minHeight: stageHeight ? undefined : 240 }}>
          <AnimatePresence initial={false}>
            {!merged || (!settled && !nothingToMerge) ? (
              <motion.div
                key={merged ? "collapse" : "rounds"}
                className="absolute inset-0 flex items-center [&_circle]:transition-[fill,stroke] [&_circle]:duration-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: merged ? 0.15 : 0.35 }}
              >
                <div className="mx-auto w-full" style={{ maxWidth: beforeMaxW }}>
                  {merged ? (
                    <CollapseSvg layout={layout} slots={finalSlots} maxHeight={stageHeight || maxH} />
                  ) : (
                    <AutomatonGraph
                      automaton={before}
                      groups={slots}
                      rankdir={rankdir}
                      radius={radius}
                      maxHeight={stageHeight || maxH}
                      zoomable
                      ariaLabel={`Subset DFA with ${before.states.length} states${blocks ? `, coloured by the ${blocks.length} groups of Moore round ${index}` : ""}.`}
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="after"
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
              >
                <div className="mx-auto w-full" style={{ maxWidth: afterMaxW }}>
                  <AutomatonGraph
                    automaton={after}
                    groups={afterSlots}
                    rankdir={rankdir}
                    radius={afterRadius}
                    maxHeight={stageHeight || maxH}
                    zoomable={false}
                    ariaLabel={`Minimized DFA with ${after.states.length} states; each state is one group of the final round.`}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={autoRef} className="mt-5 space-y-4 border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-display text-xl font-semibold text-ink">
              {index < 0 ? "Before the first round" : merged ? "Merged" : `Round ${index}`}
              {blocks && !merged && <span className="ml-3 font-sans text-sm font-normal text-muted">{plural(blocks.length, "group")}</span>}
            </p>
          </div>
          <p className="min-h-[3rem] max-w-3xl text-ink-2" aria-live={player.playing ? "off" : "polite"}>
            {caption}
          </p>
          {blocks && <BlockChips blocks={blocks} slots={slotsByRound[Math.min(index, R - 1)]} label={`Groups after round ${Math.min(index, R - 1)}`} />}
          <PlayerBar player={player} total={R + 1} stepLabel="Round" name="minimization" endLabel="Skip to the merge" />
        </div>
      </div>
    </div>
  );
}

/** For DFAs without recorded minimization rounds: how big it is versus how big it needs to be. */
export function SizeStory({
  dfa,
  approachId,
  language,
  metrics,
  learning,
}: {
  dfa: DfaPayload;
  approachId: string;
  language: Language;
  metrics: AutomatonMetrics | null | undefined;
  learning: LearningTrace | undefined;
}) {
  const states = dfa.states.length;
  const raw = metrics?.raw_states ?? learning?.raw_states ?? metaNumber(dfa, "states_before") ?? states;
  const minimum = language.expected_min_states;
  const pta = learning?.pta_states;
  const isLstar = approachId.startsWith("lstar_");
  const isTruth = approachId === "dfa";
  const rows = [
    ...(pta ? [{ label: "Prefix tree before merging", value: pta, color: "var(--muted)" }] : []),
    ...(!isTruth ? [{ label: isLstar ? "L*'s final hypothesis" : "After the learner's merges", value: raw, color: "var(--series-truth)" }] : []),
    { label: isTruth ? "This hand-built DFA" : "After Hopcroft minimization", value: states, color: "var(--lamp)" },
    { label: `Smallest DFA for ${language.id}`, value: minimum, color: "var(--accept)" },
  ];
  const max = Math.max(...rows.map((r) => r.value));
  const scale = (v: number) => (pta ? Math.log10(v + 1) / Math.log10(max + 1) : v / max);

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3 text-ink-2">
        {isTruth ? (
          <p>
            This DFA was written by hand with one state per fact worth remembering, and it is already minimal: the next tab proves that no two of its{" "}
            {states} states can merge. The minimized DFA built from the NFA arrives at the same {states}.
          </p>
        ) : isLstar ? (
          <p>
            L* builds each hypothesis straight from its observation table, one state per distinct row, so the hypothesis is always minimal for
            what L* has seen. Running <Term k="hopcroft">Hopcroft's algorithm</Term> on the final DFA {raw === states ? "found nothing to merge" : `merged it from ${raw} to ${states} states`}.
          </p>
        ) : (
          <p>
            {approachId.toUpperCase()} starts from a <Term k="pta">prefix tree acceptor</Term> with one state per distinct training prefix and merges
            states while the labels allow it. It stopped at {plural(raw, "state")}; <Term k="hopcroft">Hopcroft's algorithm</Term> then{" "}
            {raw === states ? "found nothing more to merge" : `merged that down to ${states}`}.
          </p>
        )}
        {!isTruth &&
          (states > minimum ? (
            <p>
              It still has {plural(states - minimum, "state")} more than the smallest DFA for {language.id}. Minimization cannot remove them: each one
              changes the answer for some string, so this DFA accepts a different language.
            </p>
          ) : states === minimum ? (
            <p>Its size matches the smallest DFA for {language.id}, {plural(minimum, "state")}.</p>
          ) : (
            <p>
              It is smaller than the smallest DFA for {language.id} ({plural(minimum, "state")}), so it cannot be the right language: it is missing
              distinctions the language needs.
            </p>
          ))}
      </div>

      <dl className="max-w-3xl space-y-5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-2 sm:grid-cols-[240px_minmax(0,1fr)_72px]">
            <dt className="text-sm text-ink-2">{r.label}</dt>
            <dd className="order-3 col-span-2 sm:order-none sm:col-span-1">
              <Meter value={Math.max(0.015, scale(r.value))} color={r.color} label={`${r.label}: ${r.value} states`} className="h-3" />
            </dd>
            <dd className="text-right font-display text-2xl font-semibold tabular-nums text-ink">{r.value.toLocaleString("en-US")}</dd>
          </div>
        ))}
        {pta && <p className="text-xs text-muted">Bar lengths use a log scale so the prefix tree fits.</p>}
      </dl>

      <Link
        to={`/explore/${language.id}/min_dfa`}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-5 text-[15px] font-medium text-ink transition-colors hover:border-ink-2 hover:bg-panel-2/60"
      >
        Watch {language.id} being minimized step by step
      </Link>
    </div>
  );
}
