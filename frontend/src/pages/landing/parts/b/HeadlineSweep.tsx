import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

export interface Slide {
  id: string;
  /** Small to-scale picture above the number. */
  visual: ReactNode;
  figure: ReactNode;
  text: ReactNode;
}

/**
 * Apple-style horizontal sweep: the section pins (CSS sticky) while vertical scrolling slides
 * a row of giant figures sideways. With reduced motion the slides simply stack.
 */
export function HeadlineSweep({ slides, label }: { slides: Slide[]; label: string }) {
  const reduce = useReducedMotion();
  const outer = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [dist, setDist] = useState(0);
  const distMv = useMotionValue(0);
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start start", "end end"] });
  const x = useTransform(() => -scrollYProgress.get() * distMv.get());

  useLayoutEffect(() => {
    if (reduce) return;
    const measure = () => {
      const t = track.current;
      if (!t) return;
      const d = Math.max(0, t.scrollWidth - document.documentElement.clientWidth);
      setDist(d);
      distMv.set(d);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reduce, distMv, slides.length]);

  if (reduce) {
    return (
      <ul className="mx-auto max-w-6xl space-y-20 px-6 py-16" aria-label={label}>
        {slides.map((s) => (
          <li key={s.id}>
            <SlideBody slide={s} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div ref={outer} className="relative" style={{ height: `calc(100svh + ${dist}px)` }}>
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-clip">
        <motion.ul
          ref={track}
          aria-label={label}
          className="flex w-max items-stretch gap-[9vw] md:gap-[7vw]"
          style={{ x, paddingLeft: "max(1.5rem, calc((100vw - 72rem) / 2 + 1.5rem))", paddingRight: "max(1.5rem, calc((100vw - 72rem) / 2 + 1.5rem))" }}
        >
          {slides.map((s) => (
            <li key={s.id} className="w-[min(84vw,38rem)] shrink-0 md:w-[min(56vw,40rem)]">
              <SlideBody slide={s} />
            </li>
          ))}
        </motion.ul>
        <div className="mx-auto mt-14 w-full max-w-6xl px-6" aria-hidden>
          <div className="h-px w-full bg-line">
            <motion.div className="h-px origin-left bg-lamp" style={{ scaleX: scrollYProgress }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideBody({ slide }: { slide: Slide }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-24 items-end md:h-28">{slide.visual}</div>
      <div className={cn("mt-6 font-display text-[clamp(4.2rem,11vw,8.75rem)] font-semibold leading-[0.9] tracking-[-0.03em] text-ink")}>{slide.figure}</div>
      <p className="mt-5 max-w-[30rem] text-lg leading-snug text-ink-2 md:text-[1.35rem] md:leading-snug">{slide.text}</p>
    </div>
  );
}
