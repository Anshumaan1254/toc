import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type TapeStatus = "idle" | "running" | "accepted" | "rejected";

/**
 * The input tape: one cell per symbol, a read head (the lamp) over the next symbol to read.
 * `head` = number of symbols already consumed (0..n). Long tapes scroll to keep the head in view.
 */
export function Tape({
  input,
  head,
  status = "idle",
  size = "md",
  className,
  label = "Input tape",
  note,
}: {
  input: string;
  head: number;
  status?: TapeStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
  /** A drafting annotation under one cell, e.g. { at: 20, text: "longer than any training string" }. */
  note?: { at: number; text: string };
}) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const cells = input === "" ? ["ε"] : [...input];
  const cell = size === "lg" ? 52 : size === "sm" ? 30 : 40;
  const font = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";
  const headIndex = Math.min(head, cells.length); // == cells.length -> past the end

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = headIndex * (cell + 4) - el.clientWidth / 2 + cell / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }, [headIndex, cell, reduce]);

  const statusColor = status === "accepted" ? "var(--accept)" : status === "rejected" ? "var(--reject)" : "var(--lamp)";

  return (
    <div className={cn("relative", className)} role="group" aria-label={`${label}: ${input === "" ? "empty string" : input}${note ? ` (${note.text})` : ""}`}>
      <div ref={scroller} className={cn("no-scrollbar overflow-x-auto pt-7", note ? "pb-9" : "pb-1")} data-lenis-prevent>
        <div className="relative flex w-max gap-1 px-1">
          {cells.map((ch, i) => {
            const consumed = input !== "" && i < headIndex;
            const current = i === headIndex && input !== "";
            return (
              <div
                key={i}
                className={cn(
                  "grid place-items-center rounded-md border font-mono transition-colors duration-200",
                  font,
                  consumed ? "border-line bg-panel-2/60 text-muted" : "border-line-strong bg-panel text-ink",
                  current && "border-[color:var(--lamp)] text-ink",
                  input === "" && "italic text-muted",
                )}
                style={{ width: cell, height: cell }}
                aria-hidden
              >
                {ch}
              </div>
            );
          })}
          {/* end-of-tape marker */}
          <div className="grid place-items-center font-mono text-muted/70" style={{ width: cell * 0.6, height: cell }} aria-hidden>
            ⊣
          </div>
          {note && note.at >= 0 && note.at < cells.length && (
            <div className="pointer-events-none absolute top-full flex flex-col items-center" style={{ left: note.at * (cell + 4) + 4, width: cell }} aria-hidden>
              <div className="h-3 w-px bg-[color:var(--ink-2)]" />
              <div className="t-annotation whitespace-nowrap text-ink-2">{note.text}</div>
            </div>
          )}
          {/* read head */}
          <motion.div
            className="pointer-events-none absolute -top-6 flex flex-col items-center"
            initial={false}
            animate={{ x: headIndex * (cell + 4) + 4 + (headIndex >= cells.length && input !== "" ? 0 : 0) }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
            style={{ width: cell }}
            aria-hidden
          >
            <svg width="16" height="12" viewBox="0 0 16 12">
              <path d="M1 1 H15 L8 11 Z" fill={statusColor} />
            </svg>
            <div className="mt-[22px] h-[3px] rounded-full" style={{ width: cell - 8, background: statusColor, boxShadow: `0 0 12px ${statusColor}` }} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
