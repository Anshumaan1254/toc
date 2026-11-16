import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ helpers
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export interface Series {
  id: string;
  name: string;
  color: string;
  values: (number | null)[];
}

interface Hover {
  x: number;
  y: number;
  title: string;
  lines: { label: string; value: string; color?: string }[];
}

function Tooltip({ hover }: { hover: Hover | null }) {
  if (!hover) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-36 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-[var(--shadow)]"
      style={{ left: hover.x, top: hover.y - 8 }}
      role="presentation"
    >
      <div className="mb-1 font-medium text-ink">{hover.title}</div>
      {hover.lines.map((l) => (
        <div key={l.label} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="flex items-center gap-1.5">
            {l.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />}
            {l.label}
          </span>
          <span className="tabular font-medium text-ink">{l.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items, className }: { items: { name: string; color: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2", className)} aria-label="Legend">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.name}
        </li>
      ))}
    </ul>
  );
}

/** Title + legend + chart + an accessible table view (every chart has its table twin). */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: { name: string; color: string }[];
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className={cn("space-y-3", className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-semibold text-ink">{title}</div>
          {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
        </div>
        {table && (
          <button type="button" onClick={() => setShowTable((v) => !v)} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:text-ink" aria-pressed={showTable}>
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </figcaption>
      {legend && legend.length > 1 && <Legend items={legend} />}
      {showTable && table ? (
        <div className="overflow-x-auto rounded-xl border border-line" data-lenis-prevent>
          <table className="tabular w-full text-left text-sm">
            <thead className="bg-panel-2/60 text-ink-2">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((v, j) => (
                    <td key={j} className="px-3 py-1.5 text-ink">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

// ------------------------------------------------------------------ grouped vertical bars
export function GroupedBars({
  categories,
  series,
  height = 260,
  domain,
  format = (v) => v.toFixed(3),
  yLabel,
  ariaLabel,
}: {
  categories: string[];
  series: Series[];
  height?: number;
  domain?: [number, number];
  format?: (v: number) => string;
  yLabel?: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<Hover | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const [lo, hi] = domain ?? [Math.min(0, ...all), Math.max(...all, 1e-9)];
  const m = { top: 12, right: 8, bottom: 30, left: 44 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const band = categories.length ? w / categories.length : 0;
  const inner = band * 0.78;
  const barW = series.length ? inner / series.length : 0;
  const y = (v: number) => m.top + h - ((v - lo) / (hi - lo)) * h;
  const ticks = niceTicks(lo, hi, 4);
  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={m.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {yLabel && (
            <text x={12} y={m.top + h / 2} transform={`rotate(-90 12 ${m.top + h / 2})`} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {yLabel}
            </text>
          )}
          {categories.map((c, ci) => {
            const x0 = m.left + ci * band + (band - inner) / 2;
            return (
              <g key={c}>
                {series.map((s, si) => {
                  const v = s.values[ci];
                  if (v === null || v === undefined) return null;
                  const top = y(Math.max(v, lo));
                  const bh = Math.max(0, y(lo) - top);
                  const x = x0 + si * barW + 1;
                  return (
                    <motion.rect
                      key={s.id}
                      x={x}
                      width={Math.max(1, barW - 2)}
                      rx={Math.min(4, barW / 3)}
                      fill={s.color}
                      initial={reduce ? false : { y: y(lo), height: 0 }}
                      animate={inView || reduce ? { y: top, height: bh } : { y: y(lo), height: 0 }}
                      transition={{ duration: 0.7, delay: ci * 0.04 + si * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
                      onMouseMove={() =>
                        setHover({ x: x + barW / 2, y: top, title: c, lines: series.map((ss) => ({ label: ss.name, value: ss.values[ci] === null ? "–" : format(ss.values[ci] as number), color: ss.color })) })
                      }
                    />
                  );
                })}
                <text x={m.left + ci * band + band / 2} y={height - 10} textAnchor="middle" fontSize={11.5} fill="var(--ink-2)">
                  {c}
                </text>
              </g>
            );
          })}
          <line x1={m.left} x2={width - m.right} y1={y(lo)} y2={y(lo)} stroke="var(--line-strong)" />
        </svg>
      )}
      <Tooltip hover={hover} />
    </div>
  );
}

// ------------------------------------------------------------------ horizontal bars (ranked / signed)
export function HBars({
  items,
  format = (v) => v.toFixed(3),
  colorFor,
  signed = false,
  ariaLabel,
  barHeight = 22,
}: {
  items: { label: string; value: number; color?: string; note?: string }[];
  format?: (v: number) => string;
  colorFor?: (v: number, i: number) => string;
  signed?: boolean;
  ariaLabel: string;
  barHeight?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const labelW = Math.min(190, Math.max(110, width * 0.36));
  const valueW = 64;
  const plotW = Math.max(0, width - labelW - valueW);
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1e-9);
  const zero = signed ? labelW + plotW / 2 : labelW;
  const scale = (v: number) => (Math.abs(v) / max) * (signed ? plotW / 2 : plotW);
  const height = items.length * (barHeight + 6) + 6;
  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {signed && <line x1={zero} x2={zero} y1={0} y2={height} stroke="var(--line-strong)" />}
          {items.map((it, i) => {
            const yy = 4 + i * (barHeight + 6);
            const len = scale(it.value);
            const x = signed && it.value < 0 ? zero - len : zero;
            const color = it.color ?? colorFor?.(it.value, i) ?? "var(--series-lr)";
            return (
              <g key={it.label + i}>
                <title>{`${it.label}: ${format(it.value)}${it.note ? ` (${it.note})` : ""}`}</title>
                <text x={labelW - 8} y={yy + barHeight / 2 + 4} textAnchor="end" fontSize={11.5} fill="var(--ink-2)" className="font-mono">
                  {it.label.length > 26 ? `${it.label.slice(0, 25)}…` : it.label}
                </text>
                <motion.rect
                  y={yy}
                  height={barHeight}
                  rx={4}
                  fill={color}
                  initial={reduce ? false : { width: 0, x: zero }}
                  animate={inView || reduce ? { width: Math.max(1, len), x } : { width: 0, x: zero }}
                  transition={{ duration: 0.6, delay: i * 0.03 }}
                />
                <text x={signed ? width - 4 : Math.min(width - 4, labelW + len + valueW - 4)} y={yy + barHeight / 2 + 4} textAnchor="end" fontSize={11.5} fill="var(--ink)" className="tabular">
                  {format(it.value)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ heatmap (sequential)
export function Heatmap({
  rows,
  cols,
  values,
  format = (v) => v.toFixed(2),
  domain = [0, 1],
  ariaLabel,
  cellHeight = 34,
  colorScale,
}: {
  rows: string[];
  cols: string[];
  values: (number | null)[][];
  format?: (v: number) => string;
  domain?: [number, number];
  ariaLabel: string;
  cellHeight?: number;
  colorScale?: (t: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const labelW = 64;
  const headH = 26;
  const cw = cols.length ? (width - labelW) / cols.length : 0;
  const scale = colorScale ?? ((t: number) => `color-mix(in srgb, var(--series-lr) ${Math.round(12 + t * 80)}%, var(--panel))`);
  const height = headH + rows.length * cellHeight;
  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {cols.map((c, j) => (
            <text key={c} x={labelW + j * cw + cw / 2} y={16} textAnchor="middle" fontSize={11.5} fill="var(--ink-2)">
              {c}
            </text>
          ))}
          {rows.map((r, i) => (
            <g key={r}>
              <text x={labelW - 10} y={headH + i * cellHeight + cellHeight / 2 + 4} textAnchor="end" fontSize={12} fill="var(--ink-2)" className="font-mono">
                {r}
              </text>
              {cols.map((c, j) => {
                const v = values[i]?.[j];
                const t = v === null || v === undefined ? 0 : (v - domain[0]) / (domain[1] - domain[0] || 1);
                const tt = Math.max(0, Math.min(1, t));
                const x = labelW + j * cw;
                const yy = headH + i * cellHeight;
                return (
                  <g key={c} onMouseMove={() => v !== null && v !== undefined && setHover({ x: x + cw / 2, y: yy, title: `${r} · ${c}`, lines: [{ label: "value", value: format(v) }] })}>
                    <rect x={x + 1} y={yy + 1} width={Math.max(0, cw - 2)} height={cellHeight - 2} rx={4} fill={v === null || v === undefined ? "var(--panel-2)" : scale(tt)} />
                    <text x={x + cw / 2} y={yy + cellHeight / 2 + 4} textAnchor="middle" fontSize={11.5} className="tabular" fill={tt > 0.62 ? "#ffffff" : "var(--ink)"}>
                      {v === null || v === undefined ? "–" : format(v)}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      )}
      <Tooltip hover={hover} />
    </div>
  );
}

// ------------------------------------------------------------------ confusion matrix
export function ConfusionMatrix({ cm, className }: { cm: { tn: number; fp: number; fn: number; tp: number }; className?: string }) {
  const total = cm.tn + cm.fp + cm.fn + cm.tp || 1;
  const cells = [
    { label: "True reject", sub: "actual 0 · predicted 0", v: cm.tn, good: true },
    { label: "False accept", sub: "actual 0 · predicted 1", v: cm.fp, good: false },
    { label: "False reject", sub: "actual 1 · predicted 0", v: cm.fn, good: false },
    { label: "True accept", sub: "actual 1 · predicted 1", v: cm.tp, good: true },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-1.5", className)} role="table" aria-label="Confusion matrix">
      {cells.map((c) => {
        const share = c.v / total;
        return (
          <div
            key={c.label}
            role="cell"
            className="rounded-xl border border-line p-3"
            style={{ background: `color-mix(in srgb, ${c.good ? "var(--accept)" : "var(--reject)"} ${Math.round(6 + share * 70)}%, var(--panel))` }}
          >
            <div className="tabular font-display text-2xl font-semibold text-ink">{c.v.toLocaleString("en-US")}</div>
            <div className="text-sm text-ink">{c.label}</div>
            <div className="text-xs text-ink-2">{c.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ line chart (optionally log-x)
export function LineChart({
  series,
  xs,
  height = 220,
  logX = false,
  domain = [0.4, 1],
  format = (v) => v.toFixed(2),
  xFormat = (v) => String(v),
  ariaLabel,
}: {
  series: Series[];
  xs: number[];
  height?: number;
  logX?: boolean;
  domain?: [number, number];
  format?: (v: number) => string;
  xFormat?: (v: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const m = { top: 10, right: 10, bottom: 26, left: 40 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const tx = (v: number) => (logX ? Math.log10(v) : v);
  const [x0, x1] = [tx(Math.min(...xs)), tx(Math.max(...xs))];
  const X = (v: number) => m.left + ((tx(v) - x0) / (x1 - x0 || 1)) * w;
  const Y = (v: number) => m.top + h - ((v - domain[0]) / (domain[1] - domain[0])) * h;
  const ticks = niceTicks(domain[0], domain[1], 3);
  const paths = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        d: s.values
          .map((v, i) => (v === null ? null : `${X(xs[i]).toFixed(1)},${Y(v).toFixed(1)}`))
          .filter(Boolean)
          .map((p, i) => `${i ? "L" : "M"}${p}`)
          .join(" "),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, xs, width, height],
  );
  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={Y(t)} y2={Y(t)} stroke="var(--line)" />
              <text x={m.left - 6} y={Y(t) + 4} textAnchor="end" fontSize={10.5} fill="var(--muted)" className="tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {xs.map((v) => (
            <text key={v} x={X(v)} y={height - 8} textAnchor="middle" fontSize={10.5} fill="var(--muted)" className="tabular">
              {xFormat(v)}
            </text>
          ))}
          {paths.map((s, i) => (
            <g key={s.id}>
              <motion.path
                d={s.d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                initial={reduce ? false : { pathLength: 0 }}
                animate={inView || reduce ? { pathLength: 1 } : { pathLength: 0 }}
                transition={{ duration: 0.9, delay: i * 0.08 }}
              />
              {s.values.map((v, j) =>
                v === null ? null : <circle key={j} cx={X(xs[j])} cy={Y(v)} r={3.2} fill={s.color} stroke="var(--panel)" strokeWidth={1.5}><title>{`${s.name}: ${format(v)} at ${xFormat(xs[j])}`}</title></circle>,
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
