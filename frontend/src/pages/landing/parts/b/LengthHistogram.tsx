import { useId, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useWidth } from "@/components/charts/Charts";
import { int } from "@/lib/meta";

const niceStep = (max: number) => {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
};
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v));

/**
 * Strings per length, all ten languages together. The training pool (0-20) is drawn in the
 * quiet ink; the long pool (21-40, never trained on) is hatched. A marker shows
 * where training stops.
 */
export function LengthHistogram({ main, long, trainMax, exhaustiveMax }: { main: Record<string, number>; long: Record<string, number>; trainMax: number; exhaustiveMax: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const lengths = [...new Set([...Object.keys(main), ...Object.keys(long)].map(Number))].sort((a, b) => a - b);
  const total = (n: number) => (main[n] ?? 0) + (long[n] ?? 0);
  const max = Math.max(...lengths.map(total), 1);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const height = width < 520 ? 250 : 320;
  const m = { top: 44, right: 6, bottom: 30, left: 40 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const band = lengths.length ? w / lengths.length : 0;
  const x = (n: number) => m.left + lengths.indexOf(n) * band;
  const y = (v: number) => m.top + h - (v / top) * h;
  const split = m.left + (lengths.indexOf(trainMax) + 1) * band;
  const exEnd = m.left + (lengths.indexOf(exhaustiveMax) + 1) * band;
  const hv = hover === null ? null : { n: hover, main: main[hover] ?? 0, long: long[hover] ?? 0 };
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Strings per length from 0 to ${lengths[lengths.length - 1]}, all languages. Lengths up to ${trainMax} form the training pool; longer strings are held out.`}>
          <defs>
            <pattern id={hatchId} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={5} height={5} fill="color-mix(in srgb, var(--ink-2) 45%, transparent)" />
              <line x1={0} y1={0} x2={0} y2={5} stroke="var(--bg)" strokeWidth={1.6} strokeOpacity={0.55} />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={m.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                {short(t)}
              </text>
            </g>
          ))}
          {/* bracket over the exhaustive lengths */}
          <g opacity={inView || reduce ? 1 : 0} style={{ transition: "opacity 0.6s 0.6s" }}>
            <path d={`M${m.left + 2},${m.top - 12} V${m.top - 18} H${exEnd - 2} V${m.top - 12}`} fill="none" stroke="var(--ink-2)" strokeWidth={1} />
            <text x={(m.left + exEnd) / 2} y={m.top - 24} textAnchor="middle" fontSize={11.5} fill="var(--ink-2)">
              every string
            </text>
          </g>
          {lengths.map((n, i) => {
            const v = total(n);
            const isLong = (long[n] ?? 0) > 0 && (main[n] ?? 0) === 0;
            const bw = Math.max(1, band - 2);
            const yy = y(v);
            const bh = Math.max(0, y(0) - yy);
            return (
              <g key={n} onMouseEnter={() => setHover(n)}>
                <rect x={x(n)} y={m.top} width={band} height={h} fill="transparent" />
                <motion.rect
                  x={x(n) + 1}
                  width={bw}
                  rx={Math.min(3, bw / 3)}
                  fill={isLong ? `url(#${hatchId})` : "var(--ink-2)"}
                  fillOpacity={isLong ? 1 : hover === n ? 0.9 : 0.62}
                  stroke={isLong ? "color-mix(in srgb, var(--ink-2) 70%, transparent)" : "none"}
                  strokeWidth={isLong ? 1 : 0}
                  initial={reduce ? false : { y: y(0), height: 0 }}
                  animate={inView || reduce ? { y: yy, height: bh } : { y: y(0), height: 0 }}
                  transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.022, ease: [0.2, 0.8, 0.2, 1] }}
                />
                {n % 5 === 0 && (
                  <text x={x(n) + band / 2} y={height - 10} textAnchor="middle" fontSize={11} fill="var(--muted)" className="tabular">
                    {n}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={m.left} x2={width - m.right} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
          {/* where training stops */}
          <g opacity={inView || reduce ? 1 : 0} style={{ transition: "opacity 0.6s 0.9s" }}>
            <line x1={split} x2={split} y1={m.top - 6} y2={y(0)} stroke="var(--lamp)" strokeWidth={1.5} strokeDasharray="4 4" />
            {width - split > 200 ? (
              <text x={split + 8} y={m.top + 10} fontSize={11.5} fill="var(--lamp)" fontWeight={500}>
                training stops at length {trainMax}
              </text>
            ) : (
              <text x={split + 8} y={m.top + 10} fontSize={11} fill="var(--lamp)" fontWeight={500}>
                <tspan x={split + 8}>training stops</tspan>
                <tspan x={split + 8} dy={14}>
                  at length {trainMax}
                </tspan>
              </text>
            )}
          </g>
        </svg>
      )}
      {hv && (
        <div className="pointer-events-none absolute right-0 top-0 z-20 min-w-40 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-[var(--shadow)]" role="presentation">
          <div className="font-medium text-ink">Length {hv.n}</div>
          <div className="tabular text-ink-2">{int(hv.main + hv.long)} strings</div>
          <div className="text-muted">{hv.long > 0 ? "long pool, never trained on" : "train, validation and test pool"}</div>
        </div>
      )}
    </div>
  );
}
