import { useEffect, useMemo, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { seededRandom } from "@/lib/automata";
import { PIPELINE_BY_ID, pct } from "@/lib/meta";
import type { MlExplanation, ModelDetail, PipelineId, TreeNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { splitQuestion } from "./features";
import { followPath, type DecisionStep } from "./tree";
import { atLeast, MODEL_MS, type Phase } from "./useRunSequence";

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Steps through 1..n while the phase is "model" (n when past it, 0 before). */
function useStepper(n: number, phase: Phase, reduce: boolean, spanMs = MODEL_MS * 0.8): number {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!atLeast(phase, "model")) {
      setK(0);
      return;
    }
    if (phase !== "model" || reduce || n === 0) {
      setK(n);
      return;
    }
    setK(0);
    const per = spanMs / n;
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setK(Math.min(n, i));
      if (i >= n) window.clearInterval(t);
    }, per);
    return () => window.clearInterval(t);
  }, [n, phase, reduce, spanMs]);
  return k;
}

// ------------------------------------------------------------------ logistic regression: the sigmoid
function SigmoidGlyph({ logit, phase, reduce }: { logit: number | null; phase: Phase; reduce: boolean }) {
  const W = 240;
  const H = 132;
  const zMax = 8;
  const X = (z: number) => 14 + ((z + zMax) / (2 * zMax)) * (W - 28);
  const Y = (p: number) => 16 + (1 - p) * (H - 40);
  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const z = -zMax + (i / 80) * 2 * zMax;
      pts.push(`${i ? "L" : "M"}${X(z).toFixed(1)},${Y(sigmoid(z)).toFixed(1)}`);
    }
    return pts.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const z = useMotionValue(0);
  const cx = useTransform(z, (v) => X(v));
  const cy = useTransform(z, (v) => Y(sigmoid(v)));
  const target = logit === null ? 0 : Math.max(-zMax, Math.min(zMax, logit));
  useEffect(() => {
    if (!atLeast(phase, "model") || logit === null) {
      z.set(0);
      return;
    }
    if (phase === "model" && !reduce) {
      z.set(0);
      const c = animate(z, target, { duration: 0.9, ease: [0.3, 0.7, 0.2, 1] });
      return () => c.stop();
    }
    z.set(target);
  }, [phase, target, logit, reduce, z]);
  const shown = atLeast(phase, "model") && logit !== null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
        <line x1={X(0)} x2={X(0)} y1={12} y2={H - 22} stroke="var(--line)" />
        <line x1={10} x2={W - 10} y1={Y(0.5)} y2={Y(0.5)} stroke="var(--muted)" strokeDasharray="3 4" strokeWidth={1} />
        <text x={W - 10} y={Y(0.5) - 5} textAnchor="end" fontSize={10} fill="var(--muted)">
          50%
        </text>
        <path d={curve} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinecap="round" />
        <text x={14} y={H - 6} fontSize={10} fill="var(--muted)">
          reject
        </text>
        <text x={W - 14} y={H - 6} textAnchor="end" fontSize={10} fill="var(--muted)">
          accept
        </text>
        <text x={X(0)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)" className="font-mono">
          z = 0
        </text>
        <motion.line x1={cx} x2={cx} y1={cy} y2={H - 22} stroke="var(--lamp)" strokeWidth={1} strokeDasharray="2 3" initial={false} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.2 }} />
        <motion.circle
          cx={cx}
          cy={cy}
          r={6}
          fill="var(--lamp)"
          stroke="var(--panel)"
          strokeWidth={2}
          style={{ filter: "drop-shadow(0 0 6px var(--lamp))" }}
          initial={false}
          animate={{ opacity: shown ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        />
      </svg>
      <p className="mt-1 font-mono text-xs text-ink-2">
        {shown ? (
          <>
            z = <span className="text-ink">{logit!.toFixed(2)}</span> → σ(z) = <span className="text-ink">{pct(sigmoid(logit!))}</span>
          </>
        ) : (
          <>z = bias + Σ weight × feature</>
        )}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ decision tree: the path down the first levels
function MiniTree({ tree, path, phase, reduce, probability }: { tree: TreeNode; path: DecisionStep[] | null; phase: Phase; reduce: boolean; probability: number | null }) {
  const W = 240;
  const DEPTH = 3;
  const y = (d: number) => 14 + d * 36;
  const nodes = useMemo(() => {
    const out: { node: TreeNode; d: number; i: number; x: number; parent: { x: number; y: number } | null; side: "l" | "r" | null }[] = [];
    const visit = (n: TreeNode, d: number, i: number, parent: { x: number; y: number } | null, side: "l" | "r" | null) => {
      const x = ((i + 0.5) / 2 ** d) * (W - 16) + 8;
      out.push({ node: n, d, i, x, parent, side });
      if (d >= DEPTH) return;
      if (n.left) visit(n.left, d + 1, 2 * i, { x, y: y(d) }, "l");
      if (n.right) visit(n.right, d + 1, 2 * i + 1, { x, y: y(d) }, "r");
    };
    visit(tree, 0, 0, null, null);
    return out;
  }, [tree]);
  const shownDepth = Math.max(...nodes.map((n) => n.d));
  const H = y(shownDepth) + 36;
  const followed = useMemo(() => (path ? followPath(tree, path) : null), [tree, path]);
  const visibleIds = followed ? followed.ids.slice(0, DEPTH + 1) : [];
  const steps = path?.length ?? 0;
  const k = useStepper(Math.max(steps, 1), phase, reduce);
  const litNodes = new Set(atLeast(phase, "model") ? visibleIds.slice(0, Math.min(visibleIds.length, k + 1)) : []);
  const current = path && k > 0 ? path[Math.min(k, steps) - 1] : null;
  const done = atLeast(phase, "decision") || (phase === "model" && k >= steps);
  const last = nodes.find((n) => n.node.id === visibleIds[visibleIds.length - 1]);
  const deeper = Math.max(0, steps - DEPTH);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
        {nodes.map(({ node, d, x, parent }) =>
          parent ? (
            <line
              key={`e${node.id}`}
              x1={parent.x}
              y1={parent.y}
              x2={x}
              y2={y(d)}
              stroke={litNodes.has(node.id) ? "var(--lamp)" : "var(--line-strong)"}
              strokeWidth={litNodes.has(node.id) ? 2.2 : 1}
              style={{ transition: "stroke 160ms" }}
            />
          ) : null,
        )}
        {nodes.map(({ node, d, x }) => {
          const on = litNodes.has(node.id);
          const isLeaf = !!node.leaf;
          const cut = d === DEPTH && !isLeaf && (node.left || node.right || node.truncated);
          return (
            <g key={node.id}>
              {cut && <line x1={x} x2={x} y1={y(d) + 5} y2={y(d) + 14} stroke={on ? "var(--lamp)" : "var(--line-strong)"} strokeDasharray="2 2" />}
              <circle
                cx={x}
                cy={y(d)}
                r={d === 0 ? 6 : 5}
                fill={on ? "var(--lamp)" : isLeaf ? (node.prediction ? "var(--accept-soft)" : "var(--reject-soft)") : "var(--panel)"}
                stroke={on ? "var(--lamp)" : isLeaf ? (node.prediction ? "var(--accept)" : "var(--reject)") : "var(--ink-2)"}
                strokeWidth={1.4}
                style={{ transition: "fill 160ms, stroke 160ms", filter: on ? "drop-shadow(0 0 5px var(--lamp))" : undefined }}
              />
            </g>
          );
        })}
        {done && deeper > 0 && last && (
          <text x={last.x} y={y(DEPTH) + 26} textAnchor="middle" fontSize={10.5} fill="var(--lamp)">
            + {deeper} more
          </text>
        )}
      </svg>
      <p className="mt-1 min-h-[2.5em] text-xs leading-snug text-ink-2">
        {!atLeast(phase, "model") || !path ? (
          <>A chain of yes/no questions about the features, from the root down to a leaf.</>
        ) : done ? (
          <>
            {steps} question{steps === 1 ? "" : "s"}, then a leaf where {probability === null ? "–" : pct(probability)} of the training strings were accepted.
          </>
        ) : current ? (
          <>
            <span className="text-muted">Q{Math.min(k, steps)}</span> {splitQuestion(current.feature, current.threshold)}{" "}
            <span className="font-medium text-ink">{current.goes === ">" ? "yes" : "no"}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ random forest: every tree votes
function ForestVotes({ votes, trees, phase, reduce }: { votes: { accept: number; reject: number } | null; trees: number; phase: Phase; reduce: boolean }) {
  const n = votes ? votes.accept + votes.reject : trees;
  const cols = 20;
  const order = useMemo(() => {
    const rand = seededRandom(n * 31 + (votes?.accept ?? 0));
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [n, votes?.accept]);
  const acceptSet = useMemo(() => new Set(order.slice(0, votes?.accept ?? 0)), [order, votes?.accept]);
  const rank = useMemo(() => {
    const r = new Array<number>(n);
    order.forEach((cell, i) => (r[cell] = i));
    return r;
  }, [order, n]);
  const k = useStepper(n, phase, reduce);
  const rows = Math.ceil(n / cols);
  const cw = 12;
  const ch = 14;
  return (
    <div>
      <svg viewBox={`0 0 ${cols * cw} ${rows * ch}`} className="block w-full" aria-hidden>
        {Array.from({ length: n }, (_, i) => {
          const x = (i % cols) * cw;
          const yy = Math.floor(i / cols) * ch;
          const voted = votes !== null && rank[i] < k;
          const accept = acceptSet.has(i);
          const fill = voted ? (accept ? "var(--accept)" : "var(--reject)") : "var(--panel-2)";
          return (
            <g key={i} transform={`translate(${x + 1.5},${yy + 1})`}>
              <path d="M4.5 0 L9 8.5 L0 8.5 Z" fill={fill} stroke={voted ? fill : "var(--line-strong)"} strokeWidth={0.8} style={{ transition: "fill 120ms" }} />
              <rect x={3.8} y={8.5} width={1.4} height={3} fill={voted ? fill : "var(--line-strong)"} />
            </g>
          );
        })}
      </svg>
      <p className="mt-2 min-h-[2.5em] text-xs leading-snug text-ink-2">
        {votes && atLeast(phase, "model") ? (
          <>
            <span className="font-medium text-ink">{votes.accept}</span> of {n} trees lean accept,{" "}
            <span className="font-medium text-ink">{votes.reject}</span> lean reject.
          </>
        ) : (
          <>{n} trees, each trained on a different resample of the strings; every one gets a vote.</>
        )}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ stacking: three opinions, one meta-learner
function StackMerge({
  base,
  weights,
  intercept,
  phase,
}: {
  base: Record<string, number> | null;
  weights: Record<string, number>;
  intercept: number | null;
  phase: Phase;
}) {
  const ids = Object.keys(weights).filter((id): id is PipelineId => id in PIPELINE_BY_ID);
  const shown = atLeast(phase, "model") && base !== null;
  const z = shown && intercept !== null ? intercept + ids.reduce((s, id) => s + weights[id] * (base?.[id] ?? 0), 0) : null;
  return (
    <div>
      <div className="space-y-2.5">
        {ids.map((id, i) => {
          const p = base?.[id] ?? 0;
          return (
            <div key={id} className="grid grid-cols-[38px_1fr_42px] items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span className="h-2 w-2 rounded-full" style={{ background: PIPELINE_BY_ID[id].color }} aria-hidden />
                {PIPELINE_BY_ID[id].short}
              </span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-panel-2">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{
                    width: shown ? `${p * 100}%` : "0%",
                    background: PIPELINE_BY_ID[id].color,
                    transition: `width 520ms cubic-bezier(.2,.8,.2,1) ${shown && phase === "model" ? i * 180 : 0}ms`,
                  }}
                />
              </span>
              <span className="tabular text-right font-mono text-ink">{shown ? pct(p, 0) : "–"}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 min-h-[2.5em] text-xs leading-snug text-ink-2">
        {z !== null ? (
          <>
            The meta-learner weighs the three: <span className="font-mono text-ink">z = {z.toFixed(2)}</span> → σ(z) ={" "}
            <span className="font-mono text-ink">{pct(sigmoid(z))}</span>
          </>
        ) : (
          <>Three base models answer first; a logistic regression on their probabilities makes the call.</>
        )}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ the stage
export function ModelStage({
  model,
  ml,
  phase,
  reduce,
}: {
  model: ModelDetail;
  ml: MlExplanation | null;
  phase: Phase;
  reduce: boolean;
}) {
  const e = model.explanation;
  const type = e?.type ?? null;
  if (type === "logistic_regression") return <SigmoidGlyph logit={ml?.logit ?? null} phase={phase} reduce={reduce} />;
  if (type === "decision_tree" && e?.tree)
    return <MiniTree tree={e.tree} path={ml?.decision_path ?? null} phase={phase} reduce={reduce} probability={ml?.probability ?? null} />;
  if (type === "random_forest") {
    const trees = e?.trees ?? (typeof model.complexity.trees === "number" ? model.complexity.trees : 100);
    return <ForestVotes votes={ml?.tree_votes ?? null} trees={trees} phase={phase} reduce={reduce} />;
  }
  if (type === "stacking") {
    const weights: Record<string, number> = ml?.meta_weights ?? Object.fromEntries((e?.meta_weights ?? []).map((w) => [w.base_learner, w.weight]));
    return <StackMerge base={ml?.base_probabilities ?? null} weights={weights} intercept={e?.meta_intercept ?? null} phase={phase} />;
  }
  return (
    <p className={cn("text-sm text-ink-2")}>
      The model turns the feature vector into a probability of acceptance.
    </p>
  );
}
