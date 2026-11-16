import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { AutomatonPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { layoutGraph, toGraphModel } from "./layout";

const GROUP_COLORS = [
  "var(--series-lr)",
  "var(--series-dt)",
  "var(--series-rf)",
  "var(--series-stack)",
  "var(--series-rpni)",
  "var(--series-edsm)",
  "#6250d6",
  "#e34948",
];

export interface AutomatonGraphProps {
  automaton: AutomatonPayload;
  /** States currently lit by the read head (one for a DFA, a set for an NFA). */
  active?: string[];
  /** The transition just taken; the token travels along it whenever `tokenKey` changes. */
  activeEdge?: { from: string; to: string } | null;
  tokenKey?: string | number;
  /** Partition block per state (Moore rounds); tints states by block. */
  groups?: Record<string, number>;
  /** Colours the halo of the active states once the run is over. */
  verdict?: "accept" | "reject" | null;
  dimmed?: string[];
  notes?: Record<string, string>;
  rankdir?: "LR" | "TB";
  radius?: number;
  zoomable?: boolean;
  animateIn?: boolean;
  className?: string;
  /** Max rendered height in px (the SVG scales to the container width). */
  maxHeight?: number;
  ariaLabel?: string;
  onStateClick?: (id: string) => void;
}

export function AutomatonGraph({
  automaton,
  active = [],
  activeEdge = null,
  tokenKey,
  groups,
  verdict = null,
  dimmed = [],
  notes,
  rankdir = "LR",
  radius,
  zoomable = true,
  animateIn = true,
  className,
  maxHeight = 520,
  ariaLabel,
  onStateClick,
}: AutomatonGraphProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const model = useMemo(() => toGraphModel(automaton), [automaton]);
  const r = radius ?? (model.nodes.length > 24 ? 17 : model.nodes.length > 12 ? 20 : 23);
  const layout = useMemo(() => layoutGraph(model, { rankdir, r }), [model, rankdir, r]);
  const activeSet = useMemo(() => new Set(active), [active]);
  const dimSet = useMemo(() => new Set(dimmed), [dimmed]);
  const pathRefs = useRef(new Map<string, SVGPathElement>());
  const tokenRef = useRef<SVGCircleElement>(null);

  // ---------------------------------------------------------------- zoom & pan
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  useEffect(() => setView({ k: 1, x: 0, y: 0 }), [layout]);
  const zoom = (factor: number) =>
    setView((v) => {
      const k = Math.min(4, Math.max(0.5, v.k * factor));
      const cx = layout.width / 2;
      const cy = layout.height / 2;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!zoomable || view.k === 1) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const svg = e.currentTarget.getBoundingClientRect();
    const scale = layout.width / svg.width;
    setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x) * scale, y: drag.current!.vy + (e.clientY - drag.current!.y) * scale }));
  };
  const endDrag = () => (drag.current = null);

  // ---------------------------------------------------------------- token travelling along the active edge
  const activeKey = activeEdge ? `${activeEdge.from}\u0000${activeEdge.to}` : null;
  useEffect(() => {
    const token = tokenRef.current;
    if (!token) return;
    if (!activeKey) {
      token.style.opacity = "0";
      return;
    }
    const path = pathRefs.current.get(activeKey);
    if (!path) return;
    const total = path.getTotalLength();
    if (reduce) {
      const end = path.getPointAtLength(total);
      token.setAttribute("cx", String(end.x));
      token.setAttribute("cy", String(end.y));
      token.style.opacity = "0";
      return;
    }
    token.style.opacity = "1";
    const controls = animate(0, total, {
      duration: 0.45,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (v) => {
        const p = path.getPointAtLength(v);
        token.setAttribute("cx", String(p.x));
        token.setAttribute("cy", String(p.y));
      },
      onComplete: () => {
        token.style.opacity = "0";
      },
    });
    return () => controls.stop();
  }, [activeKey, tokenKey, reduce]);

  const summary =
    ariaLabel ??
    `${automaton.kind.toUpperCase()} with ${model.nodes.length} states; start ${model.nodes.filter((n) => n.start).map((n) => n.id).join(", ")}; accepting ${model.nodes.filter((n) => n.accepting).map((n) => n.id).join(", ") || "none"}.`;
  const drawIn = animateIn && !reduce;
  const haloColor = verdict === "accept" ? "var(--accept)" : verdict === "reject" ? "var(--reject)" : "var(--lamp)";

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={summary}
        className={cn("block h-auto w-full select-none", zoomable && view.k > 1 && "cursor-grab active:cursor-grabbing")}
        style={{ maxHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <defs>
          {(["line", "lamp"] as const).map((kind) => (
            <marker
              key={kind}
              id={`arrow-${kind}-${uid}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L10,5 L0,9 z" fill={kind === "lamp" ? "var(--lamp)" : "var(--ink-2)"} />
            </marker>
          ))}
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {layout.startArrows.map((s, i) => (
            <motion.line
              key={`start-${i}`}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke="var(--ink-2)"
              strokeWidth={1.6}
              markerEnd={`url(#arrow-line-${uid})`}
              initial={drawIn ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5 }}
            />
          ))}

          {layout.edges.map((e, i) => {
            const on = activeKey === e.key;
            const muted = dimSet.has(e.from) || dimSet.has(e.to);
            return (
              <g key={e.key} opacity={muted ? 0.35 : 1}>
                <motion.path
                  ref={(el: SVGPathElement | null) => {
                    if (el) pathRefs.current.set(e.key, el);
                    else pathRefs.current.delete(e.key);
                  }}
                  d={e.d}
                  fill="none"
                  stroke={on ? "var(--lamp)" : "var(--ink-2)"}
                  strokeOpacity={on ? 1 : 0.62}
                  strokeWidth={on ? 2.4 : 1.4}
                  strokeDasharray={e.epsilon ? "5 4" : undefined}
                  markerEnd={`url(#arrow-${on ? "lamp" : "line"}-${uid})`}
                  initial={drawIn ? { pathLength: 0, opacity: 0 } : false}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.6, delay: drawIn ? 0.15 + i * 0.025 : 0 }}
                />
                <text
                  x={e.lx}
                  y={e.ly}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={12}
                  fill={on ? "var(--lamp)" : "var(--ink-2)"}
                  stroke="var(--bg)"
                  strokeWidth={4}
                  paintOrder="stroke"
                  fontWeight={on ? 600 : 400}
                >
                  {e.label}
                </text>
              </g>
            );
          })}

          {layout.nodes.map((n, i) => {
            const on = activeSet.has(n.id);
            const block = groups?.[n.id];
            const tint = block !== undefined && block < GROUP_COLORS.length ? GROUP_COLORS[block] : null;
            const muted = dimSet.has(n.id) || (n.trap && !on);
            const label = n.id.length > 9 ? `${n.id.slice(0, 8)}…` : n.id;
            return (
              <motion.g
                key={n.id}
                initial={drawIn ? { opacity: 0, scale: 0.4 } : false}
                animate={{ opacity: muted ? 0.55 : 1, scale: 1 }}
                transition={{ duration: 0.4, delay: drawIn ? i * 0.035 : 0 }}
                style={{ transformOrigin: `${n.x}px ${n.y}px`, transformBox: "view-box" }}
                onClick={onStateClick ? () => onStateClick(n.id) : undefined}
                className={onStateClick ? "cursor-pointer" : undefined}
              >
                <title>{notes?.[n.id] ? `${n.id}: ${notes[n.id]}` : n.id}</title>
                <motion.circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 6}
                  fill={haloColor}
                  filter={`url(#glow-${uid})`}
                  initial={false}
                  animate={{ opacity: on ? 0.55 : 0, scale: on ? 1 : 0.6 }}
                  transition={{ duration: 0.25 }}
                  style={{ transformOrigin: `${n.x}px ${n.y}px`, transformBox: "view-box" }}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={tint ? `color-mix(in srgb, ${tint} 26%, var(--state-fill))` : "var(--state-fill)"}
                  stroke={on ? haloColor : tint ?? "var(--ink-2)"}
                  strokeWidth={on ? 2.6 : 1.6}
                />
                {n.accepting && (
                  <circle cx={n.x} cy={n.y} r={r - 4.5} fill="none" stroke={on ? haloColor : tint ?? "var(--ink-2)"} strokeWidth={1.3} />
                )}
                <text
                  x={n.x}
                  y={n.y + 4}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={label.length > 5 ? 10 : 12.5}
                  fontWeight={on ? 600 : 500}
                  fill={on ? "var(--ink)" : "var(--ink)"}
                >
                  {label}
                </text>
              </motion.g>
            );
          })}

          <circle ref={tokenRef} r={5.5} cx={0} cy={0} fill="var(--lamp)" style={{ opacity: 0, filter: "drop-shadow(0 0 6px var(--lamp))" }} />
        </g>
      </svg>

      {zoomable && layout.nodes.length > 6 && (
        <div className="absolute right-2 top-2 flex gap-1" role="group" aria-label="Zoom">
          {[
            { label: "Zoom in", icon: <Plus size={14} />, on: () => zoom(1.25) },
            { label: "Zoom out", icon: <Minus size={14} />, on: () => zoom(0.8) },
            { label: "Fit to view", icon: <Maximize2 size={14} />, on: () => setView({ k: 1, x: 0, y: 0 }) },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.on}
              aria-label={b.label}
              title={b.label}
              className="grid h-7 w-7 place-items-center rounded-md border border-line bg-panel/80 text-ink-2 backdrop-blur hover:text-ink"
            >
              {b.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
