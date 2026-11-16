import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  label: string;
  /** Raw name shown small and monospaced under the label (e.g. the backend feature name). */
  code?: string;
  value: number;
  display: string;
  color: string;
  /** [low, high] of an uncertainty band (e.g. ± one standard deviation across trees); clamped to the plot. */
  whisker?: [number, number];
  /** Marks a row (e.g. a feature that is non-zero for the visitor's string). */
  flag?: string;
}

/**
 * Ranked horizontal bars as an HTML list: plain-language labels that wrap instead of truncating, the
 * value at the bar's tip, an optional signed axis (bars grow left or right of the middle) and optional
 * whiskers. Thin marks, 4px rounded data end, square at the baseline.
 */
export function BarRows({
  rows,
  signed = false,
  max,
  ariaLabel,
  dense = false,
}: {
  rows: BarDatum[];
  signed?: boolean;
  max?: number;
  ariaLabel: string;
  dense?: boolean;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -60px 0px" });
  const reduce = useReducedMotion();
  const top = max ?? Math.max(...rows.map((r) => Math.max(Math.abs(r.value), r.whisker ? Math.abs(r.whisker[1]) : 0)), 1e-12);
  const scale = (v: number) => Math.min(1, Math.abs(v) / top) * (signed ? 50 : 100);
  return (
    <ul ref={ref} aria-label={ariaLabel} className={cn(dense ? "space-y-2" : "space-y-3")}>
      {rows.map((r, i) => {
        const w = scale(r.value);
        const neg = signed && r.value < 0;
        return (
          <li
            key={r.key}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1",
              dense ? "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3.75rem]" : "sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4.25rem]",
            )}
            title={`${r.label}${r.code ? ` (${r.code})` : ""}: ${r.display}`}
          >
            <span className="order-1 min-w-0">
              <span className={cn("block leading-snug text-ink", dense ? "text-[13px]" : "text-sm")}>
                {r.label}
                {r.flag && (
                  <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-lamp align-middle shadow-[0_0_6px_var(--lamp)]" title={r.flag}>
                    <span className="sr-only">{r.flag}</span>
                  </span>
                )}
              </span>
              {r.code && <span className="block truncate font-mono text-[11px] text-muted">{r.code}</span>}
            </span>
            <span className={cn("tabular order-2 text-right font-mono text-ink sm:order-3", dense ? "text-[13px]" : "text-sm")}>{r.display}</span>
            <span className={cn("relative order-3 col-span-2 sm:order-2 sm:col-span-1", dense ? "h-2.5" : "h-3")}>
              {signed && <span className="absolute -inset-y-1 left-1/2 w-px bg-line-strong" aria-hidden />}
              {!signed && <span className="absolute inset-y-0 left-0 w-px bg-line-strong" aria-hidden />}
              <motion.span
                className={cn("absolute inset-y-0", neg ? "rounded-l-[4px]" : "rounded-r-[4px]")}
                style={{ background: r.color, [neg ? "right" : "left"]: signed ? "50%" : 0 }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: inView || reduce ? `${w}%` : 0 }}
                transition={{ duration: 0.7, delay: reduce ? 0 : Math.min(i * 0.04, 0.6), ease: [0.2, 0.8, 0.2, 1] }}
              />
              {r.whisker && (
                <motion.span
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-ink"
                  style={{ left: `${scale(Math.max(0, r.whisker[0]))}%`, width: `${Math.max(0, scale(r.whisker[1]) - scale(Math.max(0, r.whisker[0])))}%` }}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: inView || reduce ? 0.75 : 0 }}
                  transition={{ duration: 0.4, delay: reduce ? 0 : 0.5 + Math.min(i * 0.04, 0.6) }}
                  aria-hidden
                >
                  <span className="absolute -top-[4px] left-0 h-[9px] w-px bg-ink" />
                  <span className="absolute -top-[4px] right-0 h-[9px] w-px bg-ink" />
                </motion.span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
