import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { int } from "@/lib/meta";
import { cn } from "@/lib/utils";

/**
 * One whole split into a few parts (a tall segmented bar). Emphasis form: the highlighted
 * part is set in full ink, the rest stay in the quiet ink. Shares are printed inside the
 * blocks that are wide enough; hover or focus names any block.
 */
export function SegmentBar({
  parts,
  highlight,
  label,
  className,
}: {
  parts: { id: string; name: string; value: number }[];
  highlight?: string;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [focus, setFocus] = useState<string | null>(null);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const shown = parts.find((p) => p.id === (focus ?? highlight));
  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="flex h-7 w-full gap-[2px] overflow-hidden rounded-md"
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.name} ${int(p.value)} (${((p.value / total) * 100).toFixed(0)}%)`).join("; ")}`}
      >
        {parts.map((p) => {
          const share = p.value / total;
          const on = p.id === highlight;
          return (
            <motion.div
              key={p.id}
              className="relative flex h-full min-w-[3px] items-center overflow-hidden rounded-[4px] px-1.5"
              initial={false}
              animate={{ flexGrow: share }}
              style={{
                flexBasis: 0,
                background: on ? "var(--ink)" : "color-mix(in srgb, var(--ink-2) 26%, var(--panel))",
                transition: reduce ? undefined : "background 0.45s ease",
              }}
              transition={{ duration: reduce ? 0 : 0.5 }}
              onMouseEnter={() => setFocus(p.id)}
              onMouseLeave={() => setFocus(null)}
            >
              {share > 0.09 && (
                <span className={cn("tabular whitespace-nowrap text-[11px] font-semibold", on ? "text-[color:var(--bg)]" : "text-ink")}>{(share * 100).toFixed(0)}%</span>
              )}
            </motion.div>
          );
        })}
      </div>
      <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <span className="text-muted">{label}</span>
        {shown && (
          <span className="text-ink-2">
            <span className="font-medium text-ink">{shown.name}</span> <span className="tabular">{int(shown.value)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
