import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { PIPELINES } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { useMediaQuery } from "./hooks";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Spread label positions so no two sit closer than `gap`, keeping their order. */
function spread(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => o.y);
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + gap);
  const overflow = out[out.length - 1] - hi;
  if (overflow > 0) for (let k = out.length - 1; k >= 0; k--) out[k] = Math.min(out[k], (k === out.length - 1 ? hi : out[k + 1] - gap));
  if (out[0] < lo) {
    out[0] = lo;
    for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + gap);
  }
  const res = new Array<number>(ys.length);
  order.forEach((o, k) => (res[o.i] = out[k]));
  return res;
}

/**
 * The wall at the training length: one line per pipeline from its accuracy on the test split
 * (lengths up to the training maximum) to its accuracy on the long pool, against the ground-truth
 * DFA's flat 100% and the 50% a coin flip would get. Lines draw left to right once.
 */
export function SlopeChart({
  summary,
  language,
  testLabel,
  longLabel,
}: {
  summary: Summary;
  language: string;
  testLabel: string;
  longLabel: string;
}) {
  const wide = useMediaQuery("(min-width: 768px)");
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -25% 0px" });
  const on = !!reduce || inView;

  const W = wide ? 640 : 360;
  const H = 420;
  const m = { top: 56, bottom: 52, left: wide ? 124 : 84, right: wide ? 124 : 84 };
  const x0 = m.left;
  const x1 = W - m.right;
  const per = summary.ml[language];
  const series = PIPELINES.filter((p) => per?.[p.id]).map((p) => ({ ...p, test: per[p.id].test.accuracy, long: per[p.id].long.accuracy }));
  const lowest = Math.min(0.5, ...series.map((s) => Math.min(s.test, s.long)));
  const domLo = Math.max(0, Math.floor((lowest - 0.06) * 10) / 10);
  const y = (v: number) => m.top + (1 - (v - domLo) / (1 - domLo)) * (H - m.top - m.bottom);
  const yDfa = y(1);
  const yCoin = y(0.5);

  const leftY = spread(
    series.map((s) => y(s.test)),
    15,
    yDfa + 16,
    H - m.bottom,
  );
  const rightY = spread(
    series.map((s) => y(s.long)),
    15,
    yDfa + 16,
    H - m.bottom,
  );
  const fs = wide ? 12.5 : 11.5;
  const xMid = (x0 + x1) / 2;
  const draw = (delay: number) =>
    reduce ? { initial: false as const } : { initial: { pathLength: 0 }, animate: on ? { pathLength: 1 } : { pathLength: 0 }, transition: { duration: 0.9, delay, ease: [0.65, 0, 0.35, 1] as const } };
  const appear = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: on ? 1 : 0 }, transition: { duration: 0.35, delay } };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Accuracy on ${language}: ${series.map((s) => `${s.name} ${pct(s.test)} on ${testLabel}, ${pct(s.long)} on ${longLabel}`).join("; ")}; the ground-truth DFA stays at 100%.`}
    >
      {/* the training boundary, drawn as a vertical dimension line */}
      <g stroke="var(--ink-2)" strokeOpacity={0.7}>
        <line x1={xMid} x2={xMid} y1={m.top - 14} y2={H - m.bottom + 6} strokeWidth={1} />
        <line x1={xMid - 5} x2={xMid + 5} y1={m.top - 14} y2={m.top - 14} strokeWidth={1} />
        <line x1={xMid - 5} x2={xMid + 5} y1={H - m.bottom + 6} y2={H - m.bottom + 6} strokeWidth={1} />
      </g>
      <text x={xMid} y={m.top - 24} textAnchor="middle" fontSize={fs - 0.5} fill="var(--ink-2)" fontFamily="var(--font-mono, ui-monospace, monospace)">
        {wide ? "models never saw strings longer than this" : "models never saw longer strings"}
      </text>

      {/* chance */}
      <line x1={x0} x2={x1} y1={yCoin} y2={yCoin} stroke="var(--ink-2)" strokeOpacity={0.75} strokeDasharray="5 5" />
      <line x1={x0 - 6} x2={x0} y1={yCoin} y2={yCoin} stroke="var(--ink-2)" />
      <text x={x0 + 8} y={yCoin + 16} fontSize={fs - 1} fill="var(--ink-2)">
        coin flip, 50%
      </text>

      {/* the two positions */}
      {[x0, x1].map((x) => (
        <line key={x} x1={x} x2={x} y1={yDfa - 8} y2={H - m.bottom} stroke="var(--line)" />
      ))}
      <text x={x0} y={H - m.bottom + 24} textAnchor="middle" fontSize={fs} fill="var(--ink-2)">
        {testLabel}
      </text>
      <text x={x1} y={H - m.bottom + 24} textAnchor="middle" fontSize={fs} fill="var(--ink-2)">
        {longLabel}
      </text>

      {/* the DFA never moves */}
      <motion.path d={`M${x0},${yDfa} L${x1},${yDfa}`} stroke="var(--ink)" strokeWidth={2.25} fill="none" strokeLinecap="round" {...draw(0)} />
      <motion.g {...appear(0.2)}>
        <circle cx={x0} cy={yDfa} r={4} fill="var(--ink)" />
        <circle cx={x1} cy={yDfa} r={4} fill="var(--ink)" />
        <text x={x0 - 10} y={yDfa + 4} textAnchor="end" fontSize={fs} fill="var(--ink)" fontWeight={600}>
          DFA 100%
        </text>
        <text x={x1 + 10} y={yDfa + 4} fontSize={fs} fill="var(--ink)" fontWeight={600}>
          DFA 100%
        </text>
      </motion.g>

      {series.map((s, i) => (
        <g key={s.id}>
          <motion.path
            d={`M${x0},${y(s.test)} L${x1},${y(s.long)}`}
            stroke={s.color}
            strokeWidth={2.25}
            fill="none"
            strokeLinecap="round"
            {...draw(0.1 + i * 0.08)}
          />
          <motion.g {...appear(0.15 + i * 0.08)}>
            <circle cx={x0} cy={y(s.test)} r={3.75} fill={s.color} />
            <text x={x0 - 10} y={leftY[i] + 4} textAnchor="end" fontSize={fs} fill="var(--ink-2)">
              <tspan fill={s.color} fontWeight={600}>{s.short}</tspan> {pct(s.test)}
            </text>
          </motion.g>
          <motion.g {...appear(0.9 + i * 0.08)}>
            <circle cx={x1} cy={y(s.long)} r={3.75} fill={s.color} />
            <text x={x1 + 10} y={rightY[i] + 4} fontSize={fs} fill="var(--ink-2)">
              <tspan fill={s.color} fontWeight={600}>{s.short}</tspan> {pct(s.long)}
            </text>
          </motion.g>
        </g>
      ))}
    </svg>
  );
}
