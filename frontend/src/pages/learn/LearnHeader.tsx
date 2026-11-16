import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import RippleGrid from "@/components/reactbits/RippleGrid";
import SplitText from "@/components/reactbits/SplitText";
import { Term } from "@/components/ui/Term";
import { useTheme, useThemeColors } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The page header: a drafting grid that ripples under the pointer (React Bits RippleGrid),
 * over a static grid-paper base that stays when motion is reduced or WebGL2 is missing.
 * The canvas mounts only once the header is near the viewport and pauses when it leaves.
 */
export function LearnHeader() {
  const ref = useRef<HTMLElement>(null);
  const near = useInView(ref, { margin: "240px 0px" });
  const visible = useInView(ref);
  const reduce = useReducedMotion();
  const { theme } = useTheme();
  const colors = useThemeColors();

  return (
    <header ref={ref} className="relative isolate overflow-hidden border-b border-line">
      <div className={cn("grid-paper absolute inset-0 -z-20 transition-opacity duration-700", !reduce && near && "opacity-45")} aria-hidden />
      {!reduce && near && (
        <div className="absolute inset-0 -z-10" aria-hidden>
          <RippleGrid
            color={theme === "dark" ? colors.line : colors.ink2}
            lightMode={theme === "light"}
            variant="lines"
            cellSize={56}
            lineWidth={1}
            glow={theme === "dark" ? 0.55 : 0.2}
            rippleStrength={0.9}
            rippleSpeed={0.75}
            rippleSize={1.15}
            autoRipple="random"
            rippleInterval={3.4}
            tilt={58}
            fade={0.55}
            opacity={theme === "dark" ? 0.9 : 0.75}
            paused={!visible}
          />
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 pb-16 pt-32 md:pb-24 md:pt-40">
        <SplitText
          tag="h1"
          text="Teach a machine your language"
          splitType="words"
          effect="rise"
          trigger="load"
          delay={70}
          duration={1.1}
          textAlign="left"
          className="max-w-4xl font-display text-[2.75rem] font-semibold leading-[1.02] text-ink sm:text-6xl md:text-7xl"
        />
        <motion.p
          className="mt-6 max-w-2xl text-lg text-ink-2 md:text-xl"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          Write strings your language accepts and strings it rejects. A learning algorithm turns them into the smallest{" "}
          <Term k="dfa">DFA</Term> that agrees with every one, while three ML models train on the same examples. Then test new strings and see
          which of them generalizes.
        </motion.p>
      </div>
    </header>
  );
}
