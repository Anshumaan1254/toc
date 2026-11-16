import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A number that counts to its value. Adapted from Magic UI's NumberTicker (magicui.design, MIT):
 * here the text is the true value before any animation runs (so it is right even if it never
 * scrolls into view), the count plays the first time it is seen, and later changes glide from the
 * number on screen to the new one.
 */
export function Ticker({ value, from = 0, duration = 1.1, className }: { value: number; from?: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const initial = useRef(fmt(value)).current; // rendered once; React never rewrites it, the effect does
  const shown = useRef(value);
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || !inView) {
      el.textContent = fmt(value);
      shown.current = value;
      return;
    }
    const start = played.current ? shown.current : from;
    played.current = true;
    if (start === value) {
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(start, value, {
      duration: played.current && start !== from ? Math.min(0.45, duration) : duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduce, from, duration]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {initial}
    </span>
  );
}
