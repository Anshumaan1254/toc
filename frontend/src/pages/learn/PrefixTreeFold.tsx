import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { FoldVertical, UnfoldVertical } from "lucide-react";
import { useWidth } from "@/components/charts/Charts";
import { layoutGraph, toGraphModel } from "@/components/graph/layout";
import { runDfa } from "@/lib/automata";
import type { DfaPayload } from "@/lib/types";

const MAX_NODES = 150;
const M = 14; // margin inside the drawing, px

interface TrieNode {
  id: string; // the prefix itself; "" is the root (ε)
  parent: string | null;
  depth: number;
  label: boolean | null; // an example ends here
  children: string[];
  x: number;
  y: number;
  state: string; // where the learned DFA is after reading this prefix
}

/** The prefix tree acceptor of the examples (cut to the first levels if it is huge). */
function buildTrie(samples: { string: string; label: boolean }[], alphabet: string[]) {
  const nodes = new Map<string, TrieNode>();
  const make = (id: string, parent: string | null, depth: number) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, parent, depth, label: null, children: [], x: 0, y: 0, state: "" });
      if (parent !== null) nodes.get(parent)!.children.push(id);
    }
    return nodes.get(id)!;
  };
  make("", null, 0);
  for (const { string: s, label } of samples) {
    let prefix = "";
    for (const c of s) {
      const next = prefix + c;
      make(next, prefix, prefix.length + 1);
      prefix = next;
    }
    nodes.get(s)!.label = label;
  }
  const order = (a: string, b: string) => alphabet.indexOf(a.slice(-1)) - alphabet.indexOf(b.slice(-1));
  for (const n of nodes.values()) n.children.sort(order);
  const total = nodes.size;
  // Cut by depth so the drawing stays legible.
  const perDepth = new Map<number, number>();
  for (const n of nodes.values()) perDepth.set(n.depth, (perDepth.get(n.depth) ?? 0) + 1);
  let maxDepth = 0;
  let running = 0;
  for (let d = 0; perDepth.has(d); d++) {
    running += perDepth.get(d)!;
    if (running > MAX_NODES && d > 1) break;
    maxDepth = d;
  }
  const kept = [...nodes.values()].filter((n) => n.depth <= maxDepth);
  for (const n of kept) n.children = n.children.filter((c) => nodes.get(c)!.depth <= maxDepth);
  return { nodes: new Map(kept.map((n) => [n.id, n])), total, maxDepth, cut: kept.length < total };
}

/**
 * The examples' prefix tree folding into the learned machine. Every prefix of every example is a
 * node; the learner merged nodes until the tree became the DFA. The fold is exact: a prefix lands
 * in the state the learned DFA reaches after reading it, so the colours (one per final state) show
 * which prefixes the learner decided behave alike.
 */
export function PrefixTreeFold({ dfa, samples, learnerName }: { dfa: DfaPayload; samples: { string: string; label: boolean }[]; learnerName: string }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const [boxRef, W] = useWidth<HTMLDivElement>();
  const viewRef = useRef<HTMLDivElement>(null);
  const inView = useInView(viewRef, { once: true, amount: 0.45 });
  const [folded, setFolded] = useState(false);
  const [touched, setTouched] = useState(false);

  const trie = useMemo(() => buildTrie(samples, dfa.alphabet), [samples, dfa.alphabet]);

  const leaves = [...trie.nodes.values()].filter((n) => n.children.length === 0).length;
  const H = Math.max(250, Math.min(340, leaves * 12 + 2 * M));

  const geometry = useMemo(() => {
    if (W <= 0) return null;
    // tree: depth -> x, leaves spread evenly on y, parents centred over their children
    const nodes = trie.nodes;
    let slot = 0;
    const gap = leaves > 1 ? (H - 2 * M) / (leaves - 1) : 0;
    const place = (id: string): number => {
      const n = nodes.get(id)!;
      n.x = M + (trie.maxDepth ? (n.depth / trie.maxDepth) * (W - 2 * M) : (W - 2 * M) / 2);
      if (n.children.length === 0) {
        n.y = leaves > 1 ? M + slot * gap : H / 2;
        slot += 1;
      } else {
        const ys = n.children.map(place);
        n.y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      n.state = runDfa(dfa, id).final ?? dfa.start;
      return n.y;
    };
    place("");

    // machine: the learned DFA's own layout, fitted into the same box
    const lay = layoutGraph(toGraphModel(dfa), { rankdir: "LR", r: 22 });
    const s = Math.min((W - 2 * M - 16) / lay.width, (H - 2 * M - 24) / lay.height, 1.6);
    const ox = (W - lay.width * s) / 2;
    const oy = (H - lay.height * s) / 2 + 6;
    const statePos = new Map(lay.nodes.map((n) => [n.id, { x: ox + n.x * s, y: oy + n.y * s, accepting: n.accepting }]));

    // folded position: a sunflower disc of dots inside the state's circle
    const members = new Map<string, string[]>();
    for (const n of nodes.values()) members.set(n.state, [...(members.get(n.state) ?? []), n.id]);
    const stateR = 22 * s;
    const folded = new Map<string, { x: number; y: number; r: number }>();
    for (const [state, ids] of members) {
      const c = statePos.get(state);
      if (!c) continue;
      const k = ids.length;
      const disc = stateR * 0.74;
      const step = disc / Math.sqrt(k);
      const r = Math.max(1.6, Math.min(3.6, step * 0.5));
      ids.forEach((id, i) => {
        const rad = k === 1 ? 0 : step * Math.sqrt(i + 0.5);
        const a = i * 2.399963;
        folded.set(id, { x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a), r });
      });
    }
    // Do the examples land on the right side? (They must, for a machine that fits them.)
    const accepting = new Set(dfa.accepting);
    let right = 0;
    let ends = 0;
    for (const n of nodes.values()) {
      if (n.label === null) continue;
      ends += 1;
      if (accepting.has(n.state) === n.label) right += 1;
    }
    return { lay, s, ox, oy, statePos, folded, members, stateR, right, ends };
  }, [W, H, trie, leaves, dfa]);

  // The tree is always drawn; a moment after it is first seen it folds into the machine.
  useEffect(() => {
    if (!inView || touched) return;
    if (reduce) {
      setFolded(true);
      return;
    }
    const t = window.setTimeout(() => setFolded(true), 1700 + trie.maxDepth * 60);
    return () => window.clearTimeout(t);
  }, [inView, reduce, touched, trie.maxDepth]);

  const nodes = [...trie.nodes.values()];
  const dotR = nodes.length > 90 ? 2.6 : nodes.length > 45 ? 3.2 : 4;

  return (
    <div className="space-y-3">
      <div ref={viewRef} className="relative overflow-hidden rounded-2xl border border-line bg-panel/60">
        <div className="grid-paper absolute inset-0 opacity-60" aria-hidden />
        <div ref={boxRef} className="relative">
          {geometry && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              className="block"
              role="img"
              aria-label={`Prefix tree of your examples with ${trie.total} states, folded by ${learnerName} into ${dfa.states.length} states. ${[...geometry.members.entries()]
                .map(([st, ids]) => `${ids.length} prefixes land in ${st}`)
                .join("; ")}.`}
            >
              <defs>
                <marker id={`ptf-arrow-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,1 L10,5 L0,9 z" fill="var(--ink-2)" />
                </marker>
              </defs>

              {/* the machine's transitions, once folded */}
              <motion.g
                initial={false}
                animate={{ opacity: folded ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.5, delay: folded && !reduce ? 0.75 : 0 }}
                transform={`translate(${geometry.ox},${geometry.oy}) scale(${geometry.s})`}
              >
                {geometry.lay.startArrows.map((a, i) => (
                  <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="var(--ink-2)" strokeWidth={1.4 / geometry.s} markerEnd={`url(#ptf-arrow-${uid})`} />
                ))}
                {geometry.lay.edges.map((e) => (
                  <g key={e.key}>
                    <path d={e.d} fill="none" stroke="var(--ink-2)" strokeOpacity={0.7} strokeWidth={1.3 / geometry.s} markerEnd={`url(#ptf-arrow-${uid})`} />
                    <text
                      x={e.lx}
                      y={e.ly}
                      textAnchor="middle"
                      fontSize={11 / Math.max(0.6, geometry.s)}
                      className="font-mono"
                      fill="var(--ink-2)"
                      stroke="var(--bg)"
                      strokeWidth={3 / geometry.s}
                      paintOrder="stroke"
                    >
                      {e.label}
                    </text>
                  </g>
                ))}
              </motion.g>

              {/* the tree's branches, until folded */}
              <motion.g initial={false} animate={{ opacity: folded ? 0 : 1 }} transition={{ duration: reduce ? 0 : 0.35 }}>
                {nodes
                  .filter((n) => n.parent !== null)
                  .map((n) => {
                    const p = trie.nodes.get(n.parent!)!;
                    return (
                      <line key={n.id} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="var(--line-strong)" strokeWidth={1.1} />
                    );
                  })}
              </motion.g>

              {/* the machine's states, once folded */}
              <motion.g initial={false} animate={{ opacity: folded ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.45, delay: folded && !reduce ? 0.6 : 0 }}>
                {[...geometry.statePos.entries()].map(([id, c]) => {
                  const r = geometry.stateR;
                  return (
                    <g key={id}>
                      <circle cx={c.x} cy={c.y} r={r} fill="var(--state-fill)" fillOpacity={0.6} stroke="var(--ink-2)" strokeWidth={1.6} />
                      {c.accepting && <circle cx={c.x} cy={c.y} r={r + 4} fill="none" stroke="var(--ink-2)" strokeWidth={1.1} />}
                      <text x={c.x} y={c.y + r + (c.accepting ? 17 : 13)} textAnchor="middle" fontSize={11} fontWeight={600} className="font-mono" fill="var(--ink)" stroke="var(--bg)" strokeWidth={3} paintOrder="stroke">
                        {id}
                      </text>
                    </g>
                  );
                })}
              </motion.g>

              {/* every prefix: a dot that travels from the tree into its state */}
              {nodes.map((n) => {
                const f = geometry.folded.get(n.id) ?? { x: n.x, y: n.y, r: dotR };
                const ends = n.label !== null;
                const treeR = n.id === "" ? dotR + 1.6 : ends ? dotR + 0.6 : dotR - 0.6;
                return (
                  <motion.circle
                    key={n.id}
                    initial={false}
                    animate={{
                      cx: folded ? f.x : n.x,
                      cy: folded ? f.y : n.y,
                      r: folded ? f.r : treeR,
                    }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : {
                            cx: { duration: 0.9, ease: [0.65, 0, 0.25, 1], delay: folded ? n.depth * 0.025 : 0 },
                            cy: { duration: 0.9, ease: [0.65, 0, 0.25, 1], delay: folded ? n.depth * 0.025 : 0 },
                            r: { duration: 0.6, delay: folded ? 0.2 : 0 },
                          }
                    }
                    fill={ends ? (n.label ? "var(--accept)" : "var(--reject)") : "var(--ink-2)"}
                    fillOpacity={ends ? 1 : 0.5}
                    stroke={n.id === "" ? "var(--lamp)" : "none"}
                    strokeWidth={n.id === "" ? 1.6 : 0}
                  >
                    <title>{`${n.id === "" ? "ε" : n.id} lands in ${n.state}${ends ? (n.label ? " (an accepted example)" : " (a rejected example)") : ""}`}</title>
                  </motion.circle>
                );
              })}
            </svg>
          )}
          {!geometry && <div style={{ height: H }} />}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {folded
            ? geometry && geometry.right === geometry.ends
              ? `Every prefix now sits in the state the machine reaches after reading it. All ${geometry.ends} examples landed on the right side: mint in accepting states, coral in rejecting ones.`
              : `Every prefix now sits in the state the machine reaches after reading it.${geometry ? ` ${geometry.ends - geometry.right} of ${geometry.ends} examples landed on the wrong side.` : ""}`
            : `Each dot is a prefix of an example, growing from ε at the amber root. Mint dots end an accepted example, coral dots a rejected one.${
                trie.cut ? ` Showing the first ${trie.maxDepth} levels of ${trie.total} states.` : ""
              }`}
        </p>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              setFolded((v) => !v);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-line bg-panel/90 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            {folded ? <UnfoldVertical size={13} aria-hidden /> : <FoldVertical size={13} aria-hidden />}
            {folded ? "Unfold the prefix tree" : "Fold it into the machine"}
          </button>
      </div>
    </div>
  );
}
