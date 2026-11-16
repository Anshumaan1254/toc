import dagre from "@dagrejs/dagre";
import type { AutomatonPayload } from "@/lib/types";

export interface GraphModel {
  nodes: { id: string; start: boolean; accepting: boolean; trap: boolean }[];
  edges: { from: string; to: string; symbols: string[]; epsilon: boolean }[];
}

/** Collapse an automaton into nodes + one edge per (from, to) pair with all its symbols. */
export function toGraphModel(a: AutomatonPayload): GraphModel {
  const starts = new Set(a.kind === "dfa" ? [a.start] : a.start);
  const accepting = new Set(a.accepting);
  const pairs = new Map<string, { from: string; to: string; symbols: string[]; epsilon: boolean }>();
  const add = (from: string, to: string, symbol: string, epsilon = false) => {
    const key = `${from}\u0000${to}`;
    const entry = pairs.get(key) ?? { from, to, symbols: [], epsilon: false };
    if (!entry.symbols.includes(symbol)) entry.symbols.push(symbol);
    entry.epsilon ||= epsilon;
    pairs.set(key, entry);
  };
  if (a.kind === "dfa") {
    for (const p of a.states) for (const s of a.alphabet) {
      const q = a.transitions[p]?.[s];
      if (q !== undefined) add(p, q, s);
    }
  } else {
    for (const p of a.states) {
      for (const s of a.alphabet) for (const q of a.transitions[p]?.[s] ?? []) add(p, q, s);
      for (const q of a.epsilon[p] ?? []) add(p, q, "ε", true);
    }
  }
  const trap = (id: string) => {
    if (a.kind !== "dfa" || accepting.has(id)) return false;
    const row = a.transitions[id] ?? {};
    return a.alphabet.every((s) => row[s] === id);
  };
  return {
    nodes: a.states.map((id) => ({ id, start: starts.has(id), accepting: accepting.has(id), trap: trap(id) })),
    edges: [...pairs.values()],
  };
}

export interface LaidNode {
  id: string;
  x: number;
  y: number;
  start: boolean;
  accepting: boolean;
  trap: boolean;
}

export interface LaidEdge {
  key: string;
  from: string;
  to: string;
  label: string;
  d: string;
  lx: number;
  ly: number;
  self: boolean;
  epsilon: boolean;
}

export interface Layout {
  nodes: LaidNode[];
  edges: LaidEdge[];
  width: number;
  height: number;
  r: number;
  startArrows: { x1: number; y1: number; x2: number; y2: number }[];
}

type Pt = { x: number; y: number };
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt) => Math.hypot(a.x, a.y) || 1;
const unit = (a: Pt): Pt => mul(a, 1 / len(a));
const f = (n: number) => Math.round(n * 10) / 10;

function catmullRom(points: Pt[]): string {
  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

export function layoutGraph(model: GraphModel, opts: { rankdir?: "LR" | "TB"; r?: number } = {}): Layout {
  const r = opts.r ?? 22;
  const rankdir = opts.rankdir ?? "LR";
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 42, ranksep: 84, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of model.nodes) g.setNode(n.id, { width: 2 * r + 8, height: 2 * r + 8 });
  for (const e of model.edges) {
    if (e.from === e.to) continue;
    const label = e.symbols.join(", ");
    g.setEdge(e.from, e.to, { width: 7 * label.length + 6, height: 14, labelpos: "c" });
  }
  dagre.layout(g);

  const pos = new Map<string, Pt>();
  for (const n of model.nodes) {
    const v = g.node(n.id);
    pos.set(n.id, { x: v.x, y: v.y });
  }
  const has = new Set(model.edges.map((e) => `${e.from}\u0000${e.to}`));
  const edges: LaidEdge[] = [];
  for (const e of model.edges) {
    const label = e.symbols.join(", ");
    const key = `${e.from}\u0000${e.to}`;
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    if (e.from === e.to) {
      // Loop on the side away from the flow (above for LR, left for TB).
      const up = rankdir === "LR";
      const s = (deg: number) => ({ x: a.x + r * Math.cos((deg * Math.PI) / 180), y: a.y + r * Math.sin((deg * Math.PI) / 180) });
      const p0 = up ? s(-125) : s(145);
      const p3 = up ? s(-55) : s(215);
      const c1 = up ? { x: a.x - 1.7 * r, y: a.y - 3.0 * r } : { x: a.x - 3.0 * r, y: a.y + 1.7 * r };
      const c2 = up ? { x: a.x + 1.7 * r, y: a.y - 3.0 * r } : { x: a.x - 3.0 * r, y: a.y - 1.7 * r };
      edges.push({
        key, from: e.from, to: e.to, label, self: true, epsilon: e.epsilon,
        d: `M${f(p0.x)},${f(p0.y)} C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p3.x)},${f(p3.y)}`,
        lx: up ? a.x : a.x - 2.55 * r - 4 - 3 * label.length, ly: up ? a.y - 2.55 * r - 5 : a.y + 4,
      });
      continue;
    }
    const reverse = has.has(`${e.to}\u0000${e.from}`);
    const points: Pt[] = (g.edge(e.from, e.to)?.points ?? []).map((p: Pt) => ({ x: p.x, y: p.y }));
    if (reverse || points.length < 3) {
      // Quadratic arc; opposite directions bow to opposite sides automatically.
      const dir = unit(sub(b, a));
      const normal = { x: -dir.y, y: dir.x };
      const dist = len(sub(b, a));
      const bend = reverse ? Math.min(0.22 * dist, 46) : 0;
      const ctrl = add(mul(add(a, b), 0.5), mul(normal, bend));
      const p0 = add(a, mul(unit(sub(ctrl, a)), r));
      const p2 = add(b, mul(unit(sub(ctrl, b)), r + 3));
      const mid = add(add(mul(p0, 0.25), mul(ctrl, 0.5)), mul(p2, 0.25));
      const lab = add(mid, mul(normal, reverse ? 10 : 0));
      edges.push({
        key, from: e.from, to: e.to, label, self: false, epsilon: e.epsilon,
        d: `M${f(p0.x)},${f(p0.y)} Q${f(ctrl.x)},${f(ctrl.y)} ${f(p2.x)},${f(p2.y)}`,
        lx: lab.x, ly: lab.y - (reverse ? 0 : 7),
      });
      continue;
    }
    // Longer routed edge: smooth spline through dagre's points, endpoints on the circles.
    const inner = points.slice(1, -1);
    const first = inner[0] ?? b;
    const last = inner[inner.length - 1] ?? a;
    const p0 = add(a, mul(unit(sub(first, a)), r));
    const pn = add(b, mul(unit(sub(last, b)), r + 3));
    const labelPt = g.edge(e.from, e.to) as { x?: number; y?: number };
    edges.push({
      key, from: e.from, to: e.to, label, self: false, epsilon: e.epsilon,
      d: catmullRom([p0, ...inner, pn]),
      lx: labelPt.x ?? inner[Math.floor(inner.length / 2)].x,
      ly: (labelPt.y ?? inner[Math.floor(inner.length / 2)].y) - 6,
    });
  }

  // Start arrows come from outside the graph.
  const startArrows = model.nodes
    .filter((n) => n.start)
    .map((n) => {
      const p = pos.get(n.id)!;
      return rankdir === "LR"
        ? { x1: p.x - r - 40, y1: p.y, x2: p.x - r - 3, y2: p.y }
        : { x1: p.x, y1: p.y - r - 40, x2: p.x, y2: p.y - r - 3 };
    });

  // Normalize to a tight bounding box with a margin.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const p of pos.values()) { grow(p.x - r, p.y - r); grow(p.x + r, p.y + r); }
  for (const e of edges) {
    grow(e.lx - 4 * e.label.length - 4, e.ly - 12);
    grow(e.lx + 4 * e.label.length + 4, e.ly + 6);
    if (e.self) {
      const p = pos.get(e.from)!;
      if (rankdir === "LR") grow(p.x, p.y - 2.75 * r); else grow(p.x - 2.75 * r, p.y);
    }
    for (const m of e.d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) grow(Number(m[1]), Number(m[2]));
  }
  for (const s of startArrows) { grow(s.x1, s.y1); grow(s.x2, s.y2); }
  const margin = 18;
  const dx = margin - minX;
  const dy = margin - minY;
  const shift = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(Number(x) + dx)},${f(Number(y) + dy)}`);

  return {
    r,
    width: maxX - minX + 2 * margin,
    height: maxY - minY + 2 * margin,
    nodes: model.nodes.map((n) => {
      const p = pos.get(n.id)!;
      return { ...n, x: p.x + dx, y: p.y + dy };
    }),
    edges: edges.map((e) => ({ ...e, d: shift(e.d), lx: e.lx + dx, ly: e.ly + dy })),
    startArrows: startArrows.map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })),
  };
}
