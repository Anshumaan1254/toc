import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type CellTone = "plain" | "lamp" | "struck" | "dim";

/**
 * A row of tape cells in the same visual language as the shared <Tape>, with per-cell
 * highlights (the edited symbol, a struck-out deletion). Wraps onto several lines when long.
 * Changing `animateKey` replays the cells' entrance; otherwise symbols swap in place.
 */
export function StripTape({
  input,
  tones = {},
  status = "idle",
  size = "md",
  className,
  label,
  animateKey,
}: {
  input: string;
  tones?: Record<number, CellTone>;
  status?: "idle" | "accepted" | "rejected";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  label: string;
  animateKey?: string | number;
}) {
  const reduce = useReducedMotion();
  const cells = input === "" ? ["ε"] : [...input];
  const box =
    size === "lg"
      ? "h-12 w-10 text-2xl md:h-14 md:w-12"
      : size === "md"
        ? "h-10 w-8 text-lg md:h-11 md:w-9"
        : size === "sm"
          ? "h-8 w-7 text-base"
          : "h-6 w-[1.15rem] text-[13px] md:h-7 md:w-5 md:text-sm";
  const edge = status === "accepted" ? "var(--accept)" : status === "rejected" ? "var(--reject)" : "var(--line-strong)";
  return (
    <div role="img" aria-label={`${label}: ${input === "" ? "the empty string" : input}${status === "idle" ? "" : `, ${status}`}`} className={cn("relative", className)}>
      <motion.div
        key={animateKey ?? "static"}
        className="flex flex-wrap gap-1"
        aria-hidden
        initial={reduce || animateKey === undefined ? false : "hidden"}
        animate="shown"
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.025 } } }}
      >
        {cells.map((ch, i) => {
          const tone = tones[i] ?? "plain";
          return (
            <motion.span
              key={i}
              variants={{ hidden: { opacity: 0, y: -8, scale: 0.85 }, shown: { opacity: 1, y: 0, scale: 1 } }}
              transition={{ duration: 0.26 }}
              className={cn(
                "relative grid shrink-0 place-items-center rounded-md border bg-panel font-mono text-ink transition-[border-color,background-color,color] duration-300",
                box,
                input === "" && "italic text-muted",
                tone === "lamp" && "border-[color:var(--lamp)] bg-lamp-soft text-lamp shadow-[0_0_14px_var(--lamp-soft)]",
                tone === "struck" && "border-[color:var(--lamp)] bg-lamp-soft text-lamp line-through decoration-2",
                tone === "dim" && "text-muted",
              )}
              style={tone === "plain" || tone === "dim" ? { borderColor: edge } : undefined}
            >
              {ch}
            </motion.span>
          );
        })}
      </motion.div>
    </div>
  );
}

/** Small accepted / rejected tag (text plus colour, never colour alone). `compact` keeps only the mark. */
export function VerdictTag({ accepted, className, compact = false }: { accepted: boolean; className?: string; compact?: boolean }) {
  if (compact)
    return (
      <span
        className={cn(
          "inline-grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold",
          accepted ? "bg-accept-soft text-accept" : "bg-reject-soft text-reject",
          className,
        )}
      >
        <span aria-hidden>{accepted ? "✓" : "✗"}</span>
        <span className="sr-only">{accepted ? "accepted" : "rejected"}</span>
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium",
        accepted ? "bg-accept-soft text-accept" : "bg-reject-soft text-reject",
        className,
      )}
    >
      <span aria-hidden>{accepted ? "✓" : "✗"}</span>
      {accepted ? "accepted" : "rejected"}
    </span>
  );
}
