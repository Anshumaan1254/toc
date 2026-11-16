import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import DotGrid from "@/components/reactbits/DotGrid";
import { useTheme, useThemeColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { mixHex } from "./model";

/** True when the browser can create a WebGL2 context (DotGrid needs one). The probe context is released at once. */
function canUseWebGL2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * The header's drafting paper: React Bits DotGrid in blueprint colours. Dots sit just above the
 * background and warm to the lamp colour around the pointer (the read head). It mounts when the
 * header is near the viewport, pauses when it scrolls away, and is static with reduced motion.
 * Without WebGL2 the CSS drafting grid stands in.
 */
export function HeaderDots({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "200px 0px 200px 0px" });
  const reduce = useReducedMotion() ?? false;
  const colors = useThemeColors();
  const { theme } = useTheme();
  const [webgl] = useState(canUseWebGL2);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (near) setMounted(true);
  }, [near]);

  const base = mixHex(colors.bg, colors.ink2, theme === "dark" ? 0.3 : 0.24);

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none", className)}>
      {!webgl && <div className="grid-paper absolute inset-0" />}
      {webgl && mounted && (
        <DotGrid
          dotSize={2.4}
          gap={20}
          baseColor={base}
          activeColor={colors.lamp}
          proximity={140}
          strength={0.85}
          swell={1.1}
          glow={0.75}
          fade={0.45}
          returnDuration={0.9}
          clickShock={false}
          mouseInteraction={!reduce}
          intro={!reduce}
          paused={reduce || !near}
        />
      )}
    </div>
  );
}
