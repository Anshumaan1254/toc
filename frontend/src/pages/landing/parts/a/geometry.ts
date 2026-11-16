import { layoutGraph, toGraphModel, type Layout } from "@/components/graph/layout";
import type { AutomatonPayload } from "@/lib/types";

const cache = new WeakMap<AutomatonPayload, Map<string, Layout>>();

/**
 * Where a state is drawn on screen. Recomputes AutomatonGraph's own (deterministic) dagre
 * layout with the same radius and maps it through the rendered SVG's box
 * (preserveAspectRatio "xMidYMid meet").
 */
export function statePoint(
  automaton: AutomatonPayload,
  state: string,
  container: HTMLElement | null,
  r: number,
  rankdir: "LR" | "TB" = "LR",
): { x: number; y: number } | null {
  const svg = container?.querySelector<SVGSVGElement>('svg[role="img"]');
  if (!svg) return null;
  let byKey = cache.get(automaton);
  if (!byKey) {
    byKey = new Map();
    cache.set(automaton, byKey);
  }
  const key = `${rankdir}:${r}`;
  let layout = byKey.get(key);
  if (!layout) {
    layout = layoutGraph(toGraphModel(automaton), { rankdir, r });
    byKey.set(key, layout);
  }
  const node = layout.nodes.find((n) => n.id === state);
  if (!node) return null;
  const box = svg.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  const scale = Math.min(box.width / layout.width, box.height / layout.height);
  const ox = box.left + (box.width - layout.width * scale) / 2;
  const oy = box.top + (box.height - layout.height * scale) / 2;
  return { x: ox + node.x * scale, y: oy + node.y * scale };
}
