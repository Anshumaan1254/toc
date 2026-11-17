import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { useLenis } from "@/components/layout/SmoothScroll";
import { cn } from "@/lib/utils";

export interface Chapter {
  id: string;
  label: string;
}

const OFFSET = 108; // nav (66px) + tape (32px) + breathing room
const EASE_MOVE = [0.65, 0, 0.35, 1] as const;

function useWide(query = "(min-width: 640px)") {
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return wide;
}

/**
 * Scroll progress as a tape: one mono cell per chapter under the nav, with the read head (a small
 * lamp triangle and bar) over the chapter being read. Clicking a cell scrolls there. Rendered in a
 * portal on <body> so no transformed or filtered ancestor can ever trap its position:fixed.
 */
export function ChapterTape({ chapters }: { chapters: Chapter[] }) {
  const lenis = useLenis();
  const reduce = useReducedMotion();
  const wide = useWide();
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
    if (lenis) {
      lenis.scrollTo(el, {
        offset: -OFFSET,
        duration: reduce ? 0 : 1.2,
        onComplete: () => {
          // Chapters can still grow while they mount; correct once if the target moved.
          if (Math.abs(el.getBoundingClientRect().top - OFFSET) > 40) lenis.scrollTo(el, { offset: -OFFSET, immediate: true });
        },
      });
    } else {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - OFFSET, behavior: reduce ? "auto" : "smooth" });
    }
  };

  const tape = (
    <motion.nav
      aria-label="Chapters"
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -6 }}
      transition={{ duration: 0.26 }}
      className={cn("fixed inset-x-0 top-[66px] z-40 flex justify-center px-4", !visible && "pointer-events-none")}
    >
      <ol className="flex max-w-full items-stretch overflow-x-auto rounded-[2px] border border-line bg-[color:var(--bg)]/90 p-1 no-scrollbar">
        {chapters.map((c, i) => {
          const isCurrent = i === current;
          const compact = !wide && !isCurrent;
          return (
            <li key={c.id} className={cn("relative", i > 0 && "border-l border-line")}>
              <button
                type="button"
                onClick={() => go(c.id)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={c.label}
                title={c.label}
                className={cn(
                  "relative flex h-7 items-center justify-center font-mono text-[11px] transition-colors focus-visible:outline-offset-[-2px]",
                  compact ? "w-5" : "px-2.5",
                  isCurrent ? "text-ink" : i < current ? "text-muted/80 hover:text-ink-2" : "text-muted hover:text-ink-2",
                )}
              >
                {compact ? <span className="h-3.5 w-[2px] rounded-full bg-[color:var(--line-strong)]" aria-hidden /> : <span className="whitespace-nowrap">{c.label}</span>}
                {isCurrent && (
                  <motion.span
                    layoutId="chapter-head"
                    className="pointer-events-none absolute inset-x-1.5 -top-1 flex flex-col items-center"
                    transition={reduce ? { duration: 0 } : { duration: 0.42, ease: EASE_MOVE }}
                    aria-hidden
                  >
                    <svg width="8" height="5" viewBox="0 0 8 5" className="-mt-px">
                      <path d="M0 0 H8 L4 5 Z" fill="var(--lamp)" />
                    </svg>
                    <span className="mt-[21px] h-[2px] w-full rounded-full bg-lamp" />
                  </motion.span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </motion.nav>
  );

  return typeof document === "undefined" ? tape : createPortal(tape, document.body);
}
