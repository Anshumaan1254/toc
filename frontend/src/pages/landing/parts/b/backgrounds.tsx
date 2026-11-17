import { motion, useReducedMotion } from "motion/react";
import LetterGlitch from "@/components/reactbits/LetterGlitch";
import { useTheme, useThemeColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useNearViewport } from "./hooks";

/**
 * A field of the four alphabet symbols 0, 1, a, b (React Bits LetterGlitch) behind the dataset
 * opener: pale line-work at rest, flickering in the verdict colours. Mounted only while
 * its section is near the viewport and skipped entirely with reduced motion.
 */
export function GlyphField({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [ref, near] = useNearViewport<HTMLDivElement>("0px 0px 0px 0px");
  const c = useThemeColors();
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {near && !reduce && (
        <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}>
          <LetterGlitch
            characters="01ab"
            fontFamily='"IBM Plex Mono", ui-monospace, monospace'
            fontSize={15}
            spacing={0.95}
            density={0.62}
            baseColor={c.ink2}
            baseOpacity={dark ? 0.13 : 0.16}
            glitchColors={[c.accept, c.reject, c.muted]}
            glitchAmount={0.24}
            speed={0.55}
            flow={0.7}
            edgeFade={0.16}
            centerFade={0.75}
            cursorRadius={170}
            clickEffect="none"
            lightMode={!dark}
          />
        </motion.div>
      )}
    </div>
  );
}
