import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import CountUp from "@/components/reactbits/CountUp";
import { cn } from "@/lib/utils";

/** Fades content up (with a short blur) the first time it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.8, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** A big counter that rolls its digits like an odometer when it scrolls into view (React Bits CountUp). */
export function Rolling({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  duration = 1.8,
  delay = 0,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
  delay?: number;
}) {
  return (
    <CountUp
      to={value}
      decimals={decimals}
      separator=","
      prefix={prefix}
      suffix={suffix}
      mode="roll"
      easing="expo"
      duration={duration}
      delay={delay}
      className={className}
    />
  );
}

/** Chapter heading: one big line in the condensed display face. */
export function ChapterTitle({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn("font-display text-[clamp(2.75rem,7.5vw,6.25rem)] font-semibold leading-[0.95] tracking-[-0.02em] text-ink", className)}>
      {children}
    </h2>
  );
}

/** Scene heading inside a chapter. */
export function SceneTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("font-display text-[clamp(1.85rem,3.6vw,3rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-ink", className)}>{children}</h3>;
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-2xl text-lg leading-relaxed text-ink-2 md:text-xl", className)}>{children}</p>;
}

/** A number set in the mono face: strings, symbols and counts that come straight from the data. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[0.92em] text-ink", className)}>{children}</span>;
}

/** Corner registration marks, like the crop marks on a drafting sheet. */
export function SheetMarks({ className }: { className?: string }) {
  const mark = "absolute h-3 w-3 border-line-strong";
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-2", className)}>
      <span className={cn(mark, "left-0 top-0 border-l border-t")} />
      <span className={cn(mark, "right-0 top-0 border-r border-t")} />
      <span className={cn(mark, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(mark, "bottom-0 right-0 border-b border-r")} />
    </span>
  );
}

/** Thin meter: a value against [0, 1] on a lighter track of the same hue. */
export function Meter({ value, color = "var(--ink-2)", className, label }: { value: number; color?: string; className?: string; label: string }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full", className)} style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }} role="img" aria-label={label}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={reduce ? { width: `${v * 100}%` } : { width: 0 }}
        whileInView={{ width: `${v * 100}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  );
}
