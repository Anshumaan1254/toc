import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/*
 * One canvas at a time.  Every <Ambient> reports how much of it is near the viewport; only the
 * one with the largest visible ratio mounts its background.  The others render nothing (their
 * WebGL context is released), so at most one canvas is alive at any scroll position.
 */
const ratios = new Map<number, number>();
const listeners = new Set<() => void>();
let activeId: number | null = null;
let nextId = 1;

function recompute() {
  let best: number | null = null;
  let bestRatio = 0;
  for (const [id, ratio] of ratios) {
    if (ratio > bestRatio) {
      best = id;
      bestRatio = ratio;
    }
  }
  if (best !== activeId) {
    activeId = best;
    listeners.forEach((l) => l());
  }
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getActive = () => activeId;

/**
 * Wraps a (lazy) canvas/WebGL background.
 * - mounts it only while its section is within 25% of the viewport and it is the most visible Ambient;
 * - passes `paused` = true while the tab is hidden;
 * - renders the plain drafting grid instead under reduced motion or below `minWidth` px.
 *
 *   <Ambient>{({ paused }) => <Threads paused={paused} ... />}</Ambient>
 */
export function Ambient({
  children,
  className,
  minWidth = 768,
  interactive = false,
}: {
  children: (state: { paused: boolean }) => ReactNode;
  className?: string;
  minWidth?: number;
  /** Let the background receive pointer events (cursor-reactive effects). */
  interactive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<number>(0);
  if (idRef.current === 0) idRef.current = nextId++;
  const reduce = useReducedMotion();
  const current = useSyncExternalStore(subscribe, getActive, getActive);
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= minWidth));
  const [hidden, setHidden] = useState(() => (typeof document === "undefined" ? false : document.hidden));

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= minWidth);
    const onVisibility = () => setHidden(document.hidden);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [minWidth]);

  useEffect(() => {
    const el = ref.current;
    const id = idRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        ratios.set(id, entry.isIntersecting ? entry.intersectionRatio + 1e-4 : 0);
        recompute();
      },
      { rootMargin: "25% 0px 25% 0px", threshold: [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      ratios.delete(id);
      recompute();
    };
  }, []);

  const enabled = !reduce && wide;
  const mounted = enabled && current === idRef.current;
  return (
    <div ref={ref} className={cn("absolute inset-0 overflow-hidden", !interactive && "pointer-events-none", className)} aria-hidden>
      {!enabled ? <div className="grid-paper absolute inset-0" /> : mounted ? <Suspense fallback={null}>{children({ paused: hidden })}</Suspense> : null}
    </div>
  );
}
