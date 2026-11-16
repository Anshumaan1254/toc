import { useCallback, useEffect, useRef, useState } from "react";
import { useInView, type UseInViewOptions } from "motion/react";

/**
 * True while the element is within `margin` of the viewport. Heavy canvases (WebGL
 * backgrounds) mount only then, so at most one of them runs at a time.
 */
export function useNearViewport<T extends Element>(margin: UseInViewOptions["margin"] = "160px 0px 160px 0px") {
  const ref = useRef<T>(null);
  const near = useInView(ref, { margin });
  return [ref, near] as const;
}

/** Media query as state (false during the first render on the server, irrelevant here). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/**
 * Which of several stacked steps is crossing a horizontal reading line (`line` = fraction of
 * the viewport height from the top). Between steps the previous one stays active.
 */
export function useActiveStep(count: number, line = 0.5) {
  const nodes = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const top = Math.round(line * 100);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = nodes.current.indexOf(entry.target as HTMLElement);
          if (i >= 0) setActive(i);
        }
      },
      { rootMargin: `-${top}% 0px -${Math.max(0, 99 - top)}% 0px` },
    );
    nodes.current.slice(0, count).forEach((n) => n && io.observe(n));
    return () => io.disconnect();
  }, [count, line]);
  const register = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      nodes.current[i] = el;
    },
    [],
  );
  return { active, register };
}

/** A counter that ticks every `ms` while `running` (drives the little demo loops). */
export function useTicker(running: boolean, ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [running, ms]);
  return tick;
}
