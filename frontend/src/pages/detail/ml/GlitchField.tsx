import { useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import LetterGlitch from "@/components/reactbits/LetterGlitch";
import { useThemeColors } from "@/lib/theme";

/**
 * React Bits LetterGlitch as a field of the language's own symbols behind the pipeline. It is mounted
 * only while its sheet is near the viewport, never under reduced motion, and it stirs only while a string runs (still while the reader reads). No lamp colour: amber is the read head's.
 */
export function GlitchField({ symbols, busy }: { symbols: string[]; busy: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "160px 0px 160px 0px" });
  const reduce = useReducedMotion();
  const c = useThemeColors();
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        maskImage: "radial-gradient(ellipse 85% 75% at 50% 55%, transparent 0%, rgb(0 0 0 / 0.55) 55%, #000 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 50% 55%, transparent 0%, rgb(0 0 0 / 0.55) 55%, #000 100%)",
      }}
    >
      {near && !reduce && (
        <LetterGlitch
          characters={symbols.join("")}
          baseColor={c.line}
          glitchColors={[c.muted, c.ink2]}
          baseOpacity={busy ? 0.16 : 0.1}
          glitchAmount={busy ? 0.55 : 0}
          speed={busy ? 1.6 : 0.45}
          fontSize={15}
          density={0.85}
          cursorRadius={110}
          clickEffect="none"
          edgeFade={0.06}
          intro={false}
          interactive
        />
      )}
    </div>
  );
}
