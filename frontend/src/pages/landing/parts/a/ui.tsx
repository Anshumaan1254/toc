import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inline loading placeholder that is valid inside <p> (Skeleton renders a <div>). */
export function InlineSkeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block h-[0.9em] w-[3.2em] translate-y-[0.12em] animate-pulse rounded bg-panel-2/80", className)} />;
}

/** Registration marks at the corners of a drawing, like a blueprint sheet. */
export function CropMarks({ className, size = "h-4 w-4" }: { className?: string; size?: string }) {
  const mark = cn("pointer-events-none absolute border-line-strong", size);
  return (
    <span aria-hidden className={cn("pointer-events-none absolute -inset-1 sm:-inset-2", className)}>
      <span className={cn(mark, "left-0 top-0 border-l border-t")} />
      <span className={cn(mark, "right-0 top-0 border-r border-t")} />
      <span className={cn(mark, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(mark, "bottom-0 right-0 border-b border-r")} />
    </span>
  );
}

/** Small mono tag naming a language (L1..L10). */
export function LangTag({ id, className }: { id: string; className?: string }) {
  return <span className={cn("font-mono text-[11px] font-medium tracking-wide text-muted", className)}>{id}</span>;
}

/** Section heading pair used by every chapter in this half of the story. */
export function ChapterHeading({ id, title, children, className }: { id: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <h2 id={id} className="font-display text-[clamp(2.4rem,5.2vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {children && <div className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}
