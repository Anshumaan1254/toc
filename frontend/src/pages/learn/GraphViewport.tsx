import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { useReducedMotion } from "motion/react";
import { Crosshair, Maximize2 } from "lucide-react";
import { useWidth } from "@/components/charts/Charts";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { layoutGraph, toGraphModel } from "@/components/graph/layout";
import type { DfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_H = 420; // tallest slice of the machine shown at once, in px
const MAX_SCALE = 1.45;
const READABLE_R = 15; // on-screen state radius (px) below which the view zooms in and pans instead

/**
 * Shows a learned DFA at a size you can read. Small machines are fitted to the panel. Big ones
 * (L* often extracts 15-24 states) are drawn at a readable scale inside a window that pans: drag
 * it, use the arrow keys, or let the camera follow the read head while a string runs. The page
 * itself keeps scrolling with the wheel, so the view never traps the scroll.
 */
export function GraphViewport({
  dfa,
  active,
  edge,
  tokenKey,
  verdict,
  dimmed,
  focus,
  ariaLabel,
}: {
  dfa: DfaPayload;
  active: string[];
  edge: { from: string; to: string } | null;
  tokenKey?: string | number;
  verdict: "accept" | "reject" | null;
  dimmed: string[];
  /** States the camera should keep in view (the read head, or a highlighted pair). */
  focus: string[];
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();
  const n = dfa.states.length;
  const r = n > 24 ? 17 : n > 12 ? 20 : 23; // AutomatonGraph's own default radius, so positions match
  const layout = useMemo(() => layoutGraph(toGraphModel(dfa), { rankdir: "LR", r }), [dfa, r]);
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const fit = boxW > 0 ? Math.min(MAX_SCALE, boxW / layout.width, MAX_H / layout.height) : 0;
  const zoomable = fit > 0 && fit * r < READABLE_R - 2;
  const [overview, setOverview] = useState(false);
  const panning = zoomable && !overview;
  const scale = panning ? READABLE_R / r : fit;
  const w = layout.width * scale;
  const h = layout.height * scale;
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);

  // The camera: keep the focused states centred while panning.
  const focusKey = focus.join("\u0000");
  const target = useMemo(() => {
    const pts = layout.nodes.filter((nd) => focus.includes(nd.id));
    const use = pts.length ? pts : layout.nodes.filter((nd) => nd.start);
    if (!use.length) return null;
    return { x: use.reduce((s, p) => s + p.x, 0) / use.length, y: use.reduce((s, p) => s + p.y, 0) / use.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, focusKey]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !panning || !target || drag.current) return;
    el.scrollTo({ left: target.x * scale - el.clientWidth / 2, top: target.y * scale - el.clientHeight / 2, behavior: reduce ? "auto" : "smooth" });
  }, [target, scale, panning, reduce]);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!panning || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = scroller.current;
    if (!el) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el || d.id !== e.pointerId) return;
    el.scrollLeft = d.left - (e.clientX - d.x);
    if (e.pointerType === "mouse") el.scrollTop = d.top - (e.clientY - d.y);
  };
  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!panning || !el) return;
    const step = 90;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    el.scrollBy({ left: m[0], top: m[1], behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        ref={scroller}
        role={panning ? "group" : undefined}
        aria-label={panning ? "Machine view: drag or use the arrow keys to look around" : undefined}
        tabIndex={panning ? 0 : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn("relative overflow-hidden rounded-xl", panning && "cursor-grab touch-pan-y active:cursor-grabbing")}
        style={{ height: fit > 0 ? Math.min(h, MAX_H) + 8 : 220 }}
      >
        {fit > 0 && (
          <div className={cn(!panning && "mx-auto")} style={{ width: w, paddingTop: 4 }}>
            <AutomatonGraph
              automaton={dfa}
              active={active}
              activeEdge={edge}
              tokenKey={tokenKey}
              verdict={verdict}
              dimmed={dimmed}
              zoomable={false}
              radius={r}
              maxHeight={h + 2}
              ariaLabel={ariaLabel}
            />
          </div>
        )}
      </div>
      {zoomable && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
          <p className="rounded-full bg-panel/85 px-2.5 py-1 text-xs text-muted backdrop-blur">
            {panning ? `${n} states: drag to look around` : `All ${n} states`}
          </p>
          <button
            type="button"
            onClick={() => setOverview((v) => !v)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/90 px-3 py-1.5 text-xs font-medium text-ink-2 shadow-[var(--shadow)] backdrop-blur transition-colors hover:text-ink"
          >
            {panning ? <Maximize2 size={13} aria-hidden /> : <Crosshair size={13} aria-hidden />}
            {panning ? "Show the whole machine" : "Zoom in and follow the read head"}
          </button>
        </div>
      )}
    </div>
  );
}
