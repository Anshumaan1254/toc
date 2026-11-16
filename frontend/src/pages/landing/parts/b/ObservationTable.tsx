import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { showString } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { stateName, type TableFrame } from "./lstar";

/**
 * L*'s observation table for one frame of a replayed run. Upper block: access strings S (the
 * future states). Lower block: their one-symbol extensions S·Σ. Columns: experiments E. Each
 * cell is the model's answer to a membership query on row + column. The right margin shows
 * which upper row each row matches; a lower row with no match breaks closedness.
 */
export function ObservationTable({
  frame,
  ask,
  fresh = [],
  freshCols = [],
  focus = [],
  compact = false,
  dimmed = false,
}: {
  frame: TableFrame;
  ask: (s: string) => boolean;
  /** Rows to mark as just added. */
  fresh?: string[];
  /** Columns to mark as just added. */
  freshCols?: string[];
  /** Rows the caption talks about (consistency fix). */
  focus?: string[];
  compact?: boolean;
  dimmed?: boolean;
}) {
  const reduce = useReducedMotion();
  const signature = (s: string) => frame.E.map((e) => (ask(s + e) ? "1" : "0")).join("");
  const access = new Map<string, string>();
  for (const s of frame.S) {
    const sig = signature(s);
    if (!access.has(sig)) access.set(sig, s);
  }
  const cellW = compact ? "1.6rem" : "2.25rem";
  const labelW = compact ? "3.1rem" : "4.6rem";
  const matchW = compact ? "2.6rem" : "4.4rem";
  const template = `${labelW} repeat(${frame.E.length}, ${cellW}) ${matchW}`;
  const freshSet = new Set(fresh);
  const focusSet = new Set(focus);
  const freshColSet = new Set(freshCols);

  const row = (s: string, block: "S" | "ext") => {
    const sig = signature(s);
    const owner = access.get(sig);
    const isAccess = block === "S" && owner === s;
    const unmatched = block === "ext" && owner === undefined;
    return (
      <motion.div
        key={s}
        layoutId={reduce ? undefined : `ot-row-${s}`}
        layout={reduce ? false : "position"}
        transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        className={cn(
          "relative grid items-center gap-1 rounded-md py-0.5",
          freshSet.has(s) && "bg-lamp-soft",
          focusSet.has(s) && "ring-1 ring-[color:var(--lamp)]",
        )}
        style={{ gridTemplateColumns: template }}
        role="row"
      >
        <span role="rowheader" className={cn("truncate pl-1.5 text-right font-mono text-ink", compact ? "text-[11px]" : "text-[13px]")} title={showString(s)}>
          {showString(s)}
        </span>
        {frame.E.map((e, i) => {
          const yes = ask(s + e);
          return (
            <motion.span
              key={e}
              role="cell"
              initial={reduce ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: reduce ? 0 : freshColSet.has(e) || freshSet.has(s) ? 0.12 + i * 0.05 : 0 }}
              className={cn(
                "grid place-items-center rounded-[5px] font-mono font-semibold",
                compact ? "h-6 text-[11px]" : "h-7 text-[13px]",
                yes ? "bg-accept-soft text-accept" : "bg-reject-soft text-reject",
                (freshColSet.has(e) || freshSet.has(s)) && "ring-1 ring-[color:var(--lamp)]",
              )}
              title={`${showString(s + e)}: ${yes ? "accepted" : "rejected"}`}
            >
              {yes ? "1" : "0"}
            </motion.span>
          );
        })}
        <span role="cell" className={cn("truncate pl-1 font-mono", compact ? "text-[10px]" : "text-[11.5px]", unmatched ? "font-semibold text-lamp" : "text-muted")}>
          {isAccess ? stateName(s) : unmatched ? (compact ? "none" : "no match") : `= ${stateName(owner ?? "")}`}
        </span>
      </motion.div>
    );
  };

  return (
    <div className={cn("transition-opacity duration-500", dimmed && "opacity-35")} role="table" aria-label={`Observation table: ${frame.S.length} rows above the line, ${frame.ext.length} below, ${frame.E.length} columns`}>
      <div className="grid items-end gap-1 pb-1" style={{ gridTemplateColumns: template }} role="row">
        <span className={cn("pr-0.5 text-right text-muted", compact ? "text-[10px]" : "text-[11px]")} role="columnheader">
          prefix
        </span>
        {frame.E.map((e) => (
          <motion.span
            key={e}
            layout={reduce ? false : "position"}
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("text-center font-mono", compact ? "text-[11px]" : "text-[13px]", freshColSet.has(e) ? "font-semibold text-lamp" : "text-ink-2")}
            role="columnheader"
          >
            {showString(e)}
          </motion.span>
        ))}
        <span className={cn("pl-1 text-muted", compact ? "text-[10px]" : "text-[11px]")} role="columnheader">
          state
        </span>
      </div>
      <LayoutGroup id="ot">
        <div className="space-y-0.5 border-t border-line-strong pt-1" role="rowgroup" aria-label="Access strings S">
          {frame.S.map((s) => row(s, "S"))}
        </div>
        <div className="mt-1.5 flex items-center gap-2" aria-hidden>
          <span className="h-px flex-1 bg-line-strong" />
          <span className={cn("font-mono text-muted", compact ? "text-[10px]" : "text-[11px]")}>S·Σ</span>
          <span className="h-px flex-1 bg-line-strong" />
        </div>
        <div className="space-y-0.5 pt-1" role="rowgroup" aria-label="One-symbol extensions">
          {frame.ext.map((s) => row(s, "ext"))}
        </div>
      </LayoutGroup>
    </div>
  );
}
