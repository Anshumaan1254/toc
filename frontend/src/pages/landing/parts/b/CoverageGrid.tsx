import { useEffect, useMemo, useRef, useState } from "react";
import type { DfaPayload } from "@/lib/types";
import { useThemeColors } from "@/lib/theme";
import { accepts, shortlexAt } from "./strings";

/**
 * Every string up to the exhaustive length as one tiny square, in shortlex order: mint when
 * the DFA accepts it, coral when it rejects it, lit up to the string being enumerated.
 */
export function CoverageGrid({ dfa, total, upto }: { dfa: DfaPayload; total: number; upto: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const c = useThemeColors();
  const verdicts = useMemo(() => Array.from({ length: total }, (_, k) => accepts(dfa, shortlexAt(dfa.alphabet, k))), [dfa, total]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // largest pitch (cell + 1px gap) that fits every square in the box
  const layout = useMemo(() => {
    if (!size.w || !size.h) return null;
    for (let pitch = 12; pitch >= 2; pitch--) {
      const cols = Math.floor(size.w / pitch);
      const rows = Math.ceil(total / Math.max(1, cols));
      if (rows * pitch <= size.h) return { pitch, cols, rows };
    }
    return { pitch: 2, cols: Math.floor(size.w / 2), rows: Math.ceil(total / Math.floor(size.w / 2)) };
  }, [size, total]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !layout) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = layout.cols * layout.pitch;
    const h = layout.rows * layout.pitch;
    cv.width = Math.round(w * ratio);
    cv.height = Math.round(h * ratio);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cell = Math.max(1, layout.pitch - 1);
    for (let k = 0; k < total; k++) {
      const x = (k % layout.cols) * layout.pitch;
      const y = Math.floor(k / layout.cols) * layout.pitch;
      if (k === upto) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.lamp;
      } else if (k < upto) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = verdicts[k] ? c.accept : c.reject;
      } else {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = c.line;
      }
      ctx.fillRect(x, y, cell, cell);
    }
    ctx.globalAlpha = 1;
  }, [layout, upto, verdicts, total, c]);

  return (
    <div ref={wrap} className="relative h-full w-full" aria-hidden>
      <canvas ref={canvas} className="block" />
    </div>
  );
}
