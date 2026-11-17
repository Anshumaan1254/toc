import { useRef } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { AnimatedGridPattern } from "@/components/magicui/animated-grid-pattern";
import SplitText from "@/components/reactbits/SplitText";
import { EASE_DRAW } from "@/lib/motion";

const GRID_FADE = "linear-gradient(to bottom, #000 30%, transparent 100%)";

/**
 * A short title band (about 260px) so the language list and the drawing sheet start in the first
 * viewport. The family notes live with their groups in the schedule below.
 */
export function ExploreHero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  // The quiet drafting grid: a few cells light briefly, only while the band is on screen.
  const near = useInView(ref, { margin: "80px 0px 80px 0px" });

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 40]);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, reduce ? 1 : 0.2]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden border-b border-line">
      <div aria-hidden className="absolute inset-0 -z-10" style={{ maskImage: GRID_FADE, WebkitMaskImage: GRID_FADE }}>
        {reduce || !near ? (
          <div className="grid-paper absolute inset-0" />
        ) : (
          <AnimatedGridPattern
            width={44}
            height={44}
            numSquares={12}
            maxOpacity={0.12}
            duration={4}
            className="fill-transparent stroke-[color:var(--line)] text-ink-2"
          />
        )}
      </div>

      <motion.div style={{ y, opacity }} className="mx-auto max-w-6xl px-6 pb-8 pt-[100px] md:pb-9 md:pt-[108px]">
        <SplitText
          tag="h1"
          text="Ten languages, thirteen ways to decide them"
          className="font-display text-[38px] font-semibold leading-[1.02] tracking-tight text-ink sm:text-5xl lg:text-[56px]"
          textAlign="left"
          splitType="words"
          trigger="load"
          mask
          delay={50}
          duration={0.9}
        />
        <motion.p
          className="t-lede mt-3 max-w-none"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: EASE_DRAW }}
        >
          Pick a language to see its machine. Then pick who you want to ask.
        </motion.p>
      </motion.div>
    </section>
  );
}
