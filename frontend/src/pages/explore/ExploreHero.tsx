import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { FAMILIES } from "@/lib/meta";
import type { Family } from "@/lib/types";
import { useTheme, useThemeColors } from "@/lib/theme";
import { useLenis } from "@/components/layout/SmoothScroll";
import { Term } from "@/components/ui/Term";
import RippleGrid from "@/components/reactbits/RippleGrid";
import SplitText from "@/components/reactbits/SplitText";

const LEGEND: { family: Family; colors: string[]; body: ReactNode }[] = [
  {
    family: "truth",
    colors: ["var(--series-truth)"],
    body: (
      <>
        A hand-built <Term k="dfa">DFA</Term>, an <Term k="nfa">NFA</Term> for the same language and the <Term k="minimization">minimized</Term> DFA
        built from it. Correct by proof.
      </>
    ),
  },
  {
    family: "learned",
    colors: ["var(--series-rpni)", "var(--series-edsm)", "var(--series-lr)", "var(--series-dt)", "var(--series-rf)", "var(--series-stack)"],
    body: (
      <>
        DFAs inferred from labelled strings by <Term k="rpni">RPNI</Term> and <Term k="edsm">EDSM</Term>, or pulled out of a trained model by{" "}
        <Term k="lstar">L*</Term>.
      </>
    ),
  },
  {
    family: "ml",
    colors: ["var(--series-lr)", "var(--series-dt)", "var(--series-rf)", "var(--series-stack)"],
    body: (
      <>
        Logistic regression, a decision tree, a random forest and a <Term k="stacking">stacked</Term> ensemble. They answer with a probability, not a
        state.
      </>
    ),
  },
];

export function ExploreHero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const lenis = useLenis();
  const { theme } = useTheme();
  const colors = useThemeColors();

  // Mount the WebGL grid once the hero is (nearly) on screen; pause it whenever it is not.
  const near = useInView(ref, { margin: "120px 0px 120px 0px" });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (near) setArmed(true);
  }, [near]);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 70]);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, reduce ? 1 : 0.15]);
  const gridOpacity = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.25]);

  const jump = (e: MouseEvent<HTMLAnchorElement>, family: Family) => {
    const target = document.getElementById(`family-${family}`);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: -150 });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    target.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  };

  return (
    <section ref={ref} className="relative isolate border-b border-line">
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden"
        style={{
          opacity: gridOpacity,
          maskImage: "linear-gradient(to bottom, #000 35%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 35%, transparent 100%)",
        }}
      >
        {reduce ? (
          <div className="grid-paper absolute inset-0" />
        ) : armed ? (
          <RippleGrid
            className="absolute inset-0"
            color={theme === "dark" ? colors.line : colors.ink2}
            lightMode={theme === "light"}
            variant="lines"
            cellSize={46}
            lineWidth={1}
            glow={theme === "dark" ? 0.55 : 0.2}
            tilt={52}
            rippleStrength={0.9}
            rippleSpeed={0.55}
            rippleSize={1.15}
            autoRipple="center"
            rippleInterval={3.4}
            fade={0.55}
            opacity={theme === "dark" ? 0.75 : 0.55}
            paused={!near}
          />
        ) : null}
      </motion.div>
      {/* keep the copy legible over the grid */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_20%_35%,var(--bg)_0%,transparent_75%)] opacity-80" />

      <motion.div style={{ y, opacity }} className="mx-auto max-w-6xl px-6 pb-10 pt-28 md:pb-11 md:pt-[124px]">
        <SplitText
          tag="h1"
          text="Pick a language, then a machine"
          className="font-display text-[42px] font-semibold leading-[1.02] tracking-tight text-ink sm:text-6xl md:text-[64px]"
          textAlign="left"
          splitType="words"
          trigger="load"
          mask
          delay={70}
          duration={1.05}
        />
        <motion.p
          className="mt-5 max-w-[50rem] text-lg leading-relaxed text-ink-2 md:text-xl"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          Every approach on this page answers one yes-or-no question about a string: is it in the language?
        </motion.p>

        <dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-line pt-6 md:grid-cols-3">
          {LEGEND.map((item, i) => (
            <motion.div
              key={item.family}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <dt className="flex items-center gap-2.5">
                <span className="flex -space-x-1" aria-hidden>
                  {item.colors.map((c, j) => (
                    <span key={j} className="h-2.5 w-2.5 rounded-full ring-2 ring-[color:var(--bg)]" style={{ background: c }} />
                  ))}
                </span>
                <a
                  href={`#family-${item.family}`}
                  onClick={(e) => jump(e, item.family)}
                  className="font-display text-xl font-semibold text-ink underline-offset-4 hover:underline"
                >
                  {FAMILIES[item.family].name}
                </a>
              </dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-ink-2">{item.body}</dd>
            </motion.div>
          ))}
        </dl>
      </motion.div>
    </section>
  );
}
