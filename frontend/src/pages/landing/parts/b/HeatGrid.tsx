import { useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface HeatRow {
  id: string;
  label: ReactNode;
  /** Plain-text name for tooltips. */
  name: string;
}

export interface HeatCol {
  id: string;
  label: ReactNode;
  name: string;
  /** Leave a gutter before this column (separates groups such as the long pool). */
  gapBefore?: boolean;
}

/**
 * A matrix of rounded cells with the value printed inside, coloured by a caller-supplied scale
 * (sequential or diverging), with a hover / focus tooltip. Cells reveal column by column the
 * first time the grid scrolls into view. Pair it with a ChartFrame table view.
 */
export function HeatGrid({
  rows,
  cols,
  value,
  format,
  fill,
  ink,
  ariaLabel,
  rowHeader,
  cellClassName,
  detail,
}: {
  rows: HeatRow[];
  cols: HeatCol[];
  value: (row: string, col: string) => number | null;
  format: (v: number) => string;
  fill: (v: number) => string;
  ink: (v: number) => string;
  ariaLabel: string;
  rowHeader?: ReactNode;
  cellClassName?: string;
  /** Extra tooltip line for a cell. */
  detail?: (row: string, col: string) => string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const template = `minmax(4.5rem, auto) ${cols.map((c) => (c.gapBefore ? "0.75rem minmax(0, 1fr)" : "minmax(0, 1fr)")).join(" ")}`;
  const hovered = hover ? { row: rows[hover.r], col: cols[hover.c] } : null;
  const hv = hovered ? value(hovered.row.id, hovered.col.id) : null;
  return (
    <div ref={ref} className="relative" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: template }} aria-hidden>
        <div className="flex items-end pb-1 pr-2 text-xs text-muted">{rowHeader}</div>
        {cols.map((c) => (
          <ColHead key={c.id} gap={c.gapBefore}>
            {c.label}
          </ColHead>
        ))}
        {rows.map((r, ri) => (
          <RowCells key={r.id}>
            <div className="flex items-center pr-3 font-mono text-[13px] text-ink-2">{r.label}</div>
            {cols.map((c, ci) => {
              const v = value(r.id, c.id);
              const on = hover?.r === ri && hover?.c === ci;
              return (
                <Gap key={c.id} gap={c.gapBefore}>
                  <motion.div
                    className={cn(
                      "tabular grid h-9 place-items-center rounded-md text-[13px] font-medium transition-shadow md:h-10",
                      on && "ring-2 ring-[color:var(--lamp)]",
                      cellClassName,
                    )}
                    style={{ background: v === null ? "var(--panel-2)" : fill(v), color: v === null ? "var(--muted)" : ink(v) }}
                    initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                    animate={inView || reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.45, delay: reduce ? 0 : ci * 0.07 + ri * 0.025, ease: [0.2, 0.8, 0.2, 1] }}
                    onMouseEnter={() => setHover({ r: ri, c: ci })}
                  >
                    {v === null ? "–" : format(v)}
                  </motion.div>
                </Gap>
              );
            })}
          </RowCells>
        ))}
      </div>
      {hovered && hv !== null && (
        <div className="pointer-events-none absolute right-0 top-0 z-20 min-w-44 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-[var(--shadow)]" role="presentation">
          <div className="font-medium text-ink">
            {hovered.row.name}, {hovered.col.name}
          </div>
          <div className="tabular text-ink-2">{format(hv)}</div>
          {detail && detail(hovered.row.id, hovered.col.id) && <div className="text-muted">{detail(hovered.row.id, hovered.col.id)}</div>}
        </div>
      )}
    </div>
  );
}

function RowCells({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function ColHead({ children, gap }: { children: ReactNode; gap?: boolean }) {
  return (
    <>
      {gap && <div />}
      <div className="pb-1 text-center text-xs leading-tight text-ink-2">{children}</div>
    </>
  );
}

function Gap({ children, gap }: { children: ReactNode; gap?: boolean }) {
  return (
    <>
      {gap && <div />}
      {children}
    </>
  );
}
