import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useLenis } from "@/components/layout/SmoothScroll";
import { cn } from "@/lib/utils";

export interface Chapter {
  id: string;
  label: string;
}

/**
 * Scroll progress as a tape: one cell per chapter under the nav, the read head (lamp) over the
 * chapter being read. Clicking a cell scrolls there. Replaces numbered chapters and the generic bar.
 */
export function ChapterTape({ chapters }: { chapters: Chapter[] }) {
  const lenis = useLenis();
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(`ch-${c.id}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = chapters.findIndex((c) => `ch-${c.id}` === e.target.id);
            if (i >= 0) setCurrent(i);
          }
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.35);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [chapters]);

  const go = (id: string) => {
    const el = document.getElementById(`ch-${id}`);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -70, duration: 1.2 });
    else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <motion.nav
      aria-label="Chapters"
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -8 }}
      transition={{ duration: 0.26 }}
      className={cn("fixed inset-x-0 top-[66px] z-40 flex justify-center px-4", !visible && "pointer-events-none")}
    >
      <ol className="flex max-w-full gap-px overflow-x-auto rounded-md border border-line bg-[color:var(--bg)]/80 p-0.5 backdrop-blur-md no-scrollbar">
        {chapters.map((c, i) => (
          <li key={c.id} className="relative">
            <button
              type="button"
              onClick={() => go(c.id)}
              aria-current={i === current ? "step" : undefined}
              title={c.label}
              className={cn(
                "relative block whitespace-nowrap rounded-sm px-2.5 py-1 font-mono text-[11px] transition-colors",
                i === current ? "text-ink" : i < current ? "text-muted/80 hover:text-ink-2" : "text-muted hover:text-ink-2",
              )}
            >
              <span className="hidden sm:inline">{c.label}</span>
              <span className="sm:hidden" aria-hidden>
                {c.label.slice(0, 1)}
              </span>
              <span className="sr-only sm:hidden">{c.label}</span>
              {i === current && (
                <motion.span
                  layoutId="chapter-head"
                  className="absolute inset-x-1.5 -bottom-0.5 h-[2px] rounded-full bg-lamp"
                  style={{ boxShadow: "0 0 10px var(--lamp)" }}
                  transition={reduce ? { duration: 0 } : { duration: 0.42, ease: [0.65, 0, 0.35, 1] }}
                />
              )}
            </button>
          </li>
        ))}
      </ol>
    </motion.nav>
  );
}
