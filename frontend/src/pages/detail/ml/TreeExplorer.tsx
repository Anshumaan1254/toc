import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { int, pct, showString } from "@/lib/meta";
import type { TreeNode } from "@/lib/types";
import { Segmented } from "@/components/ui/primitives";
import { splitQuestion } from "./features";
import { followPath, hasChildren, walkTree, type DecisionStep } from "./tree";

const NODE_W = 184;
const NODE_H = 58;
const COL_GAP = 58;
const ROW_GAP = 12;
const PAD = 12;

interface Placed {
  node: TreeNode;
  depth: number;
  x: number;
  y: number;
  parent: Placed | null;
  side: "no" | "yes" | null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * The decision tree as a left-to-right node-link diagram. Edge thickness follows how many training
 * strings flow down that branch; each node shows its question, how many strings reach it and the share
 * of them in the language. Nodes open and close on click (or Enter); the path of the last string run
 * through the model glows in the lamp colour.
 */
export function TreeExplorer({ tree, path, pathString, totalDepth }: { tree: TreeNode; path: DecisionStep[] | null; pathString: string | null; totalDepth?: number }) {
  const reduce = useReducedMotion();
  const payloadDepth = useMemo(() => {
    let d = 0;
    walkTree(tree, (_, depth) => (d = Math.max(d, depth)));
    return d;
  }, [tree]);
  const depthOptions = useMemo(() => Array.from({ length: payloadDepth }, (_, i) => i + 1), [payloadDepth]);
  const initialLevels = useMemo(() => Math.min(typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches ? 2 : 3, payloadDepth), [payloadDepth]);
  const [levels, setLevels] = useState(initialLevels);
  const [expanded, setExpanded] = useState<Set<number>>(() => expandTo(tree, initialLevels));
  const followed = useMemo(() => (path ? followPath(tree, path) : null), [tree, path]);
  const onPath = useMemo(() => new Set(followed?.ids ?? []), [followed]);

  // A new string opens the tree along its path.
  useEffect(() => {
    if (!followed) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      followed.ids.slice(0, -1).forEach((id) => next.add(id));
      return next;
    });
  }, [followed]);

  const setDepth = (d: number) => {
    setLevels(d);
    const next = expandTo(tree, d);
    followed?.ids.slice(0, -1).forEach((id) => next.add(id));
    setExpanded(next);
  };

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---------------------------------------------------------------- layout
  const { placed, width, height } = useMemo(() => {
    const out: Placed[] = [];
    let slot = 0;
    const visit = (node: TreeNode, depth: number, parent: Placed | null, side: "no" | "yes" | null): Placed => {
      const kids = expanded.has(node.id) ? [node.left, node.right].filter((k): k is TreeNode => !!k) : [];
      const me: Placed = { node, depth, x: PAD + depth * (NODE_W + COL_GAP), y: 0, parent, side };
      out.push(me);
      if (kids.length === 0) {
        me.y = PAD + slot * (NODE_H + ROW_GAP);
        slot += 1;
      } else {
        const placedKids = kids.map((k) => visit(k, depth + 1, me, k === node.left ? "no" : "yes"));
        me.y = (placedKids[0].y + placedKids[placedKids.length - 1].y) / 2;
      }
      return me;
    };
    visit(tree, 0, null, null);
    const maxDepth = Math.max(...out.map((p) => p.depth));
    return { placed: out, width: PAD * 2 + 12 + (maxDepth + 1) * NODE_W + maxDepth * COL_GAP, height: PAD * 2 + slot * (NODE_H + ROW_GAP) - ROW_GAP };
  }, [tree, expanded]);

  const root = tree.samples || 1;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 240, damping: 30 };

  const onKey = (e: KeyboardEvent, id: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(id);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {payloadDepth > 1 ? (
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <span>Levels open</span>
            <Segmented<string> label="Levels of the tree to open" options={depthOptions.map((d) => ({ value: String(d), label: String(d) }))} value={String(levels)} onChange={(v) => setDepth(Number(v))} />
          </div>
        ) : (
          <p className="text-sm text-ink-2">One question decides everything.</p>
        )}
        <p className="text-sm text-muted">
          {followed && pathString !== null ? (
            <>
              <span className="mr-1.5 inline-block h-2 w-5 rounded-full bg-lamp align-middle" aria-hidden />
              path of <span className="font-mono text-ink-2">{truncate(showString(pathString), 18)}</span>
              {path && followed.matched < path.length && <> (continues {path.length - followed.matched} levels below what is drawn)</>}
            </>
          ) : (
            <>Click a question to open or close it.</>
          )}
        </p>
      </div>
      <div className="relative overflow-x-auto rounded-2xl border border-line bg-panel/50" data-lenis-prevent>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Decision tree; each node is a button that opens or closes its branches" className="block">
          {placed.map((p) => {
            if (!p.parent) return null;
            const x1 = p.parent.x + NODE_W;
            const y1 = p.parent.y + NODE_H / 2;
            const x2 = p.x;
            const y2 = p.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const on = onPath.has(p.node.id) && onPath.has(p.parent.node.id);
            const w = 1 + (p.node.samples / root) * 14;
            return (
              <g key={`e-${p.node.id}`}>
                <motion.path
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, opacity: 1 }}
                  transition={spring}
                  fill="none"
                  stroke={on ? "var(--lamp)" : "var(--ink-2)"}
                  strokeOpacity={on ? 0.85 : 0.22}
                  strokeWidth={w}
                  strokeLinecap="round"
                />
                <motion.text
                  initial={false}
                  animate={{ x: x2 - 8, y: y2 - 7 }}
                  transition={spring}
                  textAnchor="end"
                  fontSize={10.5}
                  fill={on ? "var(--lamp)" : "var(--muted)"}
                  fontWeight={on ? 600 : 400}
                >
                  {p.side}
                </motion.text>
              </g>
            );
          })}
          {placed.map((p) => {
            const n = p.node;
            const on = onPath.has(n.id);
            const kids = hasChildren(n);
            const open = expanded.has(n.id);
            const leaf = !!n.leaf;
            const question = leaf ? null : n.feature !== undefined && n.threshold !== undefined ? splitQuestion(n.feature, n.threshold) : "…";
            const label = leaf
              ? `Leaf: ${n.prediction ? "accept" : "reject"}. ${int(n.samples)} training strings, ${pct(n.p_accept, 0)} in the language.`
              : `${question} ${int(n.samples)} training strings reach it, ${pct(n.p_accept, 0)} in the language.${kids ? (open ? " Open." : " Closed.") : n.truncated ? " The tree continues below; not sent by the server." : ""}`;
            const barW = NODE_W - 24;
            return (
              <motion.g
                key={n.id}
                initial={reduce ? false : { opacity: 0, x: p.parent ? p.parent.x : p.x, y: p.parent ? p.parent.y : p.y }}
                animate={{ opacity: 1, x: p.x, y: p.y }}
                transition={spring}
                role={kids ? "button" : undefined}
                tabIndex={kids ? 0 : undefined}
                aria-label={label}
                aria-expanded={kids ? open : undefined}
                onClick={kids ? () => toggle(n.id) : undefined}
                onKeyDown={kids ? (e) => onKey(e, n.id) : undefined}
                className={kids ? "cursor-pointer outline-none [&:focus-visible>rect:first-of-type]:stroke-[color:var(--lamp)] [&:focus-visible>rect:first-of-type]:[stroke-width:2.5]" : undefined}
              >
                <title>{label}</title>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill="var(--panel)"
                  stroke={on ? "var(--lamp)" : leaf ? (n.prediction ? "var(--accept)" : "var(--reject)") : "var(--line-strong)"}
                  strokeWidth={on ? 2 : 1}
                  style={on ? { filter: "drop-shadow(0 0 8px color-mix(in srgb, var(--lamp) 55%, transparent))" } : undefined}
                />
                {leaf ? (
                  <text x={12} y={21} fontSize={12.5} fontWeight={600} fill="var(--ink)">
                    Leaf: {n.prediction ? "accept" : "reject"}
                  </text>
                ) : (
                  <text x={12} y={21} fontSize={12.5} fill="var(--ink)">
                    {truncate(question ?? "", 25)}
                  </text>
                )}
                <text x={12} y={37} fontSize={11} fill="var(--muted)" className="tabular">
                  {int(n.samples)} strings, {pct(n.p_accept, 0)} in
                </text>
                <rect x={12} y={44} width={barW} height={5} rx={2.5} fill="var(--reject)" opacity={0.75} />
                <rect x={12} y={44} width={Math.max(0, barW * n.p_accept - (n.p_accept > 0 && n.p_accept < 1 ? 1 : 0))} height={5} rx={2.5} fill="var(--accept)" />
                {n.p_accept > 0 && n.p_accept < 1 && <rect x={12 + barW * n.p_accept - 1} y={43} width={2} height={7} fill="var(--panel)" />}
                {kids && (
                  <g transform={`translate(${NODE_W}, ${NODE_H / 2})`}>
                    <circle r={9} fill={open ? "var(--panel-2)" : "var(--panel)"} stroke={on ? "var(--lamp)" : "var(--line-strong)"} strokeWidth={1.2} />
                    <text y={4} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={open ? "var(--ink-2)" : "var(--lamp)"}>
                      {open ? "−" : "+"}
                    </text>
                  </g>
                )}
                {!kids && n.truncated && (
                  <g transform={`translate(${NODE_W}, ${NODE_H / 2})`}>
                    <circle r={9} fill="var(--panel)" stroke="var(--line)" strokeDasharray="2 2" />
                    <text y={4} textAnchor="middle" fontSize={11} fill="var(--muted)">
                      …
                    </text>
                  </g>
                )}
              </motion.g>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 text-xs text-muted">
        Branch thickness = how many training strings flow through it. Bars under each question: mint for strings in the language, coral for the rest.
        {totalDepth !== undefined && totalDepth > payloadDepth && <> The server sends the first {payloadDepth} levels of a tree that is {totalDepth} levels deep; nodes marked … continue below.</>}
      </p>
    </div>
  );
}

function expandTo(tree: TreeNode, levels: number): Set<number> {
  const out = new Set<number>();
  walkTree(tree, (n, depth) => {
    if (depth < levels && hasChildren(n)) out.add(n.id);
  });
  return out;
}
