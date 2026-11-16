import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLenis } from "@/components/layout/SmoothScroll";
import { cn } from "@/lib/utils";

export interface RailStop {
  id: string;
  label: string;
}

const GAP = 64; // px between states on the rail

/**
 * The page drawn as a tiny automaton in the left margin (wide screens only): one state per
 * section, the last one accepting. The amber read head sits on the section you are reading and
 * moves as you scroll; each state jumps to its section.
 */
export function PageRail({ stops }: { stops: RailStop[] }) {
  const reduce = useReducedMotion();
  const lenis = useLenis();
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = stops.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const current = stops.filter((s) => seen.get(s.id)).at(-1);
        setActive(current ? current.id : null);
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [stops]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -88, duration: 1 });
    else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const index = stops.findIndex((s) => s.id === active);

  // Portalled: the page's <main> keeps a CSS filter from its route transition, which would make
  // it the containing block of anything position: fixed inside it.
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {index >= 0 && (
        <motion.nav
          aria-label="Page sections"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.3 }}
          className="fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 xl:block"
        >
          <div className="relative" style={{ height: GAP * (stops.length - 1) + 28 }}>
            <svg className="absolute left-0 top-0" width="28" height={GAP * (stops.length - 1) + 28} aria-hidden>
              <defs>
                <marker id="rail-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,1 L10,5 L0,9 z" fill="var(--line-strong)" />
                </marker>
              </defs>
              {stops.slice(0, -1).map((s, i) => (
                <line key={s.id} x1="14" y1={14 + i * GAP + 15} x2="14" y2={14 + (i + 1) * GAP - 16} stroke="var(--line-strong)" strokeWidth="1.2" markerEnd="url(#rail-arrow)" />
              ))}
            </svg>
            {stops.map((s, i) => {
              const on = i === index;
              const last = i === stops.length - 1;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={on ? "step" : undefined}
                  className="group absolute left-0 flex items-center gap-3"
                  style={{ top: i * GAP }}
                >
                  <span
                    className={cn(
                      "relative grid h-7 w-7 place-items-center rounded-full border bg-bg font-mono text-[10px] transition-colors",
                      on ? "border-[color:var(--lamp)] text-ink" : "border-line-strong text-muted group-hover:text-ink",
                    )}
                  >
                    {last && <span className={cn("absolute inset-[3px] rounded-full border", on ? "border-[color:var(--lamp)]" : "border-line-strong")} aria-hidden />}
                    q{i}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap rounded-full px-2 py-0.5 text-xs transition-opacity",
                      "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 min-[1500px]:opacity-100",
                      on ? "text-ink" : "text-muted",
                    )}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
            {/* the read head */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-0 h-7 w-7 rounded-full shadow-[0_0_0_2px_var(--lamp),0_0_16px_var(--lamp)]"
              initial={false}
              animate={{ top: index * GAP }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
            />
          </div>
        </motion.nav>
      )}
    </AnimatePresence>,
    document.body,
  );
}
