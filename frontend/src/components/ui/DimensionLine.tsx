import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A drafting dimension line: a hairline with end ticks carrying an annotation label.
 * Used under big numbers and for before -> after counts ("7 states to 3").
 */
export function DimensionLine({ label, className, align = "center" }: { label: ReactNode; className?: string; align?: "center" | "start" }) {
  return (
    <div className={cn("flex items-center gap-2 text-[color:var(--ink-2)]", className)}>
      <span className="h-3 w-px shrink-0 bg-current opacity-70" aria-hidden />
      {align === "center" && <span className="h-px min-w-4 flex-1 bg-current opacity-50" aria-hidden />}
      <span className="t-annotation shrink-0 text-ink-2">{label}</span>
      <span className="h-px min-w-4 flex-1 bg-current opacity-50" aria-hidden />
      <span className="h-3 w-px shrink-0 bg-current opacity-70" aria-hidden />
    </div>
  );
}
