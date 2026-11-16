/**
 * Signal wires between the pipeline stations.
 *
 * Adapted from Magic UI's AnimatedBeam (https://magicui.design/docs/components/animated-beam, MIT):
 * same idea (an SVG overlay on the container, a path measured between two elements, a bright pulse
 * travelling along it), changed so that it works vertically as well as horizontally (the pulse is a
 * dash moving along the path, not a gradient sliding along the x axis), fires once per run instead of
 * looping, and stays still under reduced motion.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { animate } from "motion/react";

interface Wire {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function SignalBeams({
  containerRef,
  nodes,
  lit,
  fire,
  fireKey,
  reduce,
}: {
  containerRef: RefObject<HTMLElement | null>;
  nodes: RefObject<HTMLElement | null>[];
  /** Number of wires (from the left/top) that have carried the signal in this run. */
  lit: number;
  /** Index of the wire to pulse now (-1 = none). */
  fire: number;
  /** Changes whenever a pulse should start. */
  fireKey: string;
  reduce: boolean;
}) {
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pulseRefs = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const compute = () => {
      const c = container.getBoundingClientRect();
      const out: Wire[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i].current?.getBoundingClientRect();
        const b = nodes[i + 1].current?.getBoundingClientRect();
        if (!a || !b) continue;
        const horizontal = b.left >= a.right - 2;
        if (horizontal) {
          const x1 = a.right - c.left;
          const y1 = a.top + a.height / 2 - c.top;
          const x2 = b.left - c.left;
          const y2 = b.top + b.height / 2 - c.top;
          const mx = (x1 + x2) / 2;
          out.push({ d: `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`, x1, y1, x2, y2 });
        } else {
          const x1 = a.left + a.width / 2 - c.left;
          const y1 = a.bottom - c.top;
          const x2 = b.left + b.width / 2 - c.left;
          const y2 = b.top - c.top;
          const my = (y1 + y2) / 2;
          out.push({ d: `M ${x1},${y1} C ${x1},${my} ${x2},${my} ${x2},${y2}`, x1, y1, x2, y2 });
        }
      }
      setWires((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
      setSize((prev) => (prev.w === c.width && prev.h === c.height ? prev : { w: c.width, h: c.height }));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    nodes.forEach((n) => n.current && ro.observe(n.current));
    return () => ro.disconnect();
  }, [containerRef, nodes]);

  // One pulse per run and stage: a short bright dash runs from the output port to the input port.
  useEffect(() => {
    if (reduce || fire < 0) return;
    const path = pulseRefs.current[fire];
    if (!path) return;
    const total = path.getTotalLength();
    const seg = Math.max(14, Math.min(36, total * 0.45));
    path.style.strokeDasharray = `${seg} ${total + seg}`;
    path.style.opacity = "1";
    const controls = animate(seg, -total, {
      duration: 0.55,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (v) => {
        path.style.strokeDashoffset = String(v);
      },
      onComplete: () => {
        path.style.opacity = "0";
      },
    });
    return () => controls.stop();
  }, [fire, fireKey, reduce, wires.length]);

  if (!size.w) return null;
  return (
    <svg
      aria-hidden
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible"
      fill="none"
    >
      {wires.map((w, i) => {
        const on = i < lit;
        return (
          <g key={i}>
            <path
              d={w.d}
              stroke={on ? "var(--lamp)" : "var(--line-strong)"}
              strokeOpacity={on ? 0.7 : 1}
              strokeWidth={on ? 2 : 1.5}
              strokeDasharray={on ? undefined : "3 5"}
              strokeLinecap="round"
              style={{ transition: "stroke 300ms, stroke-opacity 300ms" }}
            />
            <path
              ref={(el) => {
                pulseRefs.current[i] = el;
              }}
              d={w.d}
              stroke="var(--lamp)"
              strokeWidth={3.5}
              strokeLinecap="round"
              style={{ opacity: 0, filter: "drop-shadow(0 0 6px var(--lamp))" }}
            />
            {[
              [w.x1, w.y1],
              [w.x2, w.y2],
            ].map(([x, y], j) => (
              <circle
                key={j}
                cx={x}
                cy={y}
                r={4}
                fill={on ? "var(--lamp)" : "var(--panel)"}
                stroke={on ? "var(--lamp)" : "var(--line-strong)"}
                strokeWidth={1.5}
                style={{ transition: "fill 300ms, stroke 300ms" }}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
