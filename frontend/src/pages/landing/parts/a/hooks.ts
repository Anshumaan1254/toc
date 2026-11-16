import { useEffect, useRef, useState, type RefObject } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type Margin = NonNullable<Parameters<typeof useInView>[1]>["margin"];

/** True while the element is on screen and the tab is visible: gate every looping visual on it. */
export function useLiveGate(ref: RefObject<Element | null>, margin: Margin = "0px"): boolean {
  const inView = useInView(ref, { margin });
  const [tabVisible, setTabVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const on = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return inView && tabVisible;
}

/** Live result of a media query (false during the very first render on the server). */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/**
 * Cycles 0..count-1 every `ms` while `active`, lingering `holdLast` ms on the last frame.
 * With reduced motion it stays on `still` (default: the last frame, the finished state).
 */
export function useCycle(count: number, ms: number, active: boolean, still?: number, holdLast = 0): number {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const frame = count > 0 ? i % count : 0;
  useEffect(() => {
    if (reduce || !active || count <= 1) return;
    const wait = frame === count - 1 ? Math.max(ms, holdLast) : ms;
    const t = window.setTimeout(() => setI((v) => (v + 1) % count), wait);
    return () => window.clearTimeout(t);
  }, [frame, count, ms, active, reduce, holdLast]);
  if (reduce) return still ?? Math.max(0, count - 1);
  return frame;
}

/**
 * Safety net for ScrollTrigger: when this section changes height after first paint
 * (fonts, data), refresh trigger positions for everything below it (debounced).
 */
export function useRefreshOnResize(ref: RefObject<Element | null>) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    const ro = new ResizeObserver((entries) => {
      const h = Math.round(entries[0]?.contentRect.height ?? 0);
      if (last.current === null) {
        last.current = h;
        return;
      }
      if (Math.abs(h - last.current) < 2) return;
      last.current = h;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ScrollTrigger.refresh(), 200);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [ref]);
}
