import { useEffect } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A number that glides from its old value to its new one. It paints the true value first (no count
 * up from zero, so a still capture never shows a wrong number); switching languages then visibly
 * moves every instrument.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 110, damping: 22, mass: 0.7 });
  const text = useTransform(spring, (v) => format(v));
  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);
  return <motion.span className={cn("tabular", className)}>{text}</motion.span>;
}

const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * Accuracy as a ruled bar: a fill in the approach's series colour over a track with a tick every
 * 10%. `chance` adds the 50% mark (a coin flip on a balanced set).
 */
export function AccuracyMeter({
  label,
  value,
  color,
  chance = false,
  className,
}: {
  label: string;
  value: number | null | undefined;
  color: string;
  chance?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const has = typeof value === "number" && !Number.isNaN(value);
  const width = has ? `${Math.max(0, Math.min(1, value)) * 100}%` : "0%";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-xs text-muted">{label}</span>
        <span className="font-mono text-[13px] font-medium text-ink">
          {has ? <AnimatedNumber value={value} format={pctText} /> : "–"}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-[5px] rounded-full bg-panel-2"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), var(--line) calc(10% - 1px) 10%)" }}
        aria-hidden
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px -2px ${color}` }}
          initial={false}
          animate={{ width }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20, mass: 0.8 }}
        />
        {chance && <span className="absolute -bottom-[3px] -top-[3px] left-1/2 w-px bg-ink-2/70" />}
      </div>
    </div>
  );
}

/**
 * One small circle per state: filled up to the size of the minimal DFA, hollow for every state
 * beyond it, so a bloated extraction is visible at a glance. Long strips end in an ellipsis; the
 * exact count is printed beside the strip.
 */
export function StateStrip({
  states,
  minimal,
  color,
  max = 16,
  className,
}: {
  states: number;
  minimal: number;
  color: string;
  max?: number;
  className?: string;
}) {
  const shown = Math.min(states, max);
  const extra = states - shown;
  const gap = 9;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-hidden>
      <svg width={shown * gap} height={10} viewBox={`0 0 ${shown * gap} 10`} className="shrink-0 overflow-visible">
        {Array.from({ length: shown }, (_, i) => (
          <circle
            key={i}
            cx={i * gap + 4.5}
            cy={5}
            r={3.3}
            fill={i < minimal ? color : "none"}
            stroke={color}
            strokeWidth={1.2}
            opacity={i < minimal ? 1 : 0.75}
          />
        ))}
      </svg>
      {extra > 0 && <span className="font-mono text-[12px] leading-none text-muted">…</span>}
    </span>
  );
}

/**
 * Model size on a log scale from 1 to 100,000, with a tick where the ground-truth DFA's
 * transition count sits: how much machinery the model uses for the same language.
 */
export function SizeBar({ size, reference, color }: { size: number; reference: number; color: string }) {
  const reduce = useReducedMotion();
  const pos = (n: number) => Math.max(0, Math.min(1, Math.log10(Math.max(1, n)) / 5));
  return (
    <div className="relative mt-1.5 h-[5px] rounded-full bg-panel-2" aria-hidden>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color, opacity: 0.85 }}
        initial={false}
        animate={{ width: `${pos(size) * 100}%` }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20, mass: 0.8 }}
      />
      <span className="absolute -bottom-[3px] -top-[3px] w-[2px] rounded-full bg-ink" style={{ left: `${pos(reference) * 100}%` }} />
    </div>
  );
}
