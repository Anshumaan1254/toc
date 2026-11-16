import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useLenis } from "@/components/layout/SmoothScroll";
import { useTracePlayer } from "@/components/graph/useTracePlayer";
import { useClassify } from "@/lib/api";
import type { ApproachId, ClassifyResult, DfaTrace, NfaTrace } from "@/lib/types";

export const isDfaTrace = (t: DfaTrace | NfaTrace | undefined): t is DfaTrace => !!t && "start" in t;
export const isNfaTrace = (t: DfaTrace | NfaTrace | undefined): t is NfaTrace => !!t && "initial" in t;

/**
 * Classify a string on the server, then replay the returned trace step by step.
 * `index` is clamped to the current trace (-1 = before the first symbol).
 */
export function useRunner(language: string, approach: ApproachId) {
  const classify = useClassify();
  const { mutate } = classify;
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<ClassifyResult | null>(null);

  const run = useCallback(
    (s: string) => {
      setDraft(s);
      mutate({ language, approach, string: s }, { onSuccess: (r) => setResult(r) });
    },
    [mutate, language, approach],
  );

  const steps = result?.trace?.steps.length ?? 0;
  const player = useTracePlayer(steps, { stepMs: 700 });
  const { restart } = player;
  // Declared after useTracePlayer so its own reset-on-length effect runs first, then playback starts.
  useEffect(() => {
    if (result) restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const index = Math.max(-1, Math.min(player.index, steps - 1));
  const live = result !== null && result.string === draft;
  const done = live && index >= steps - 1;

  return {
    draft,
    setDraft,
    run,
    result,
    live,
    steps,
    player,
    index,
    done,
    pending: classify.isPending,
    error: classify.error,
    retry: () => run(draft),
  };
}

export type Runner = ReturnType<typeof useRunner>;

/**
 * Scroll an element into view through Lenis when it is running (keeps ScrollTrigger in sync),
 * then call `onArrive`, so a run started from further down the page is seen from its first step.
 */
export function useScrollTo() {
  const lenis = useLenis();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useCallback(
    (onArrive?: () => void) => {
      const el = ref.current;
      if (!el) {
        onArrive?.();
        return;
      }
      if (lenis) {
        lenis.scrollTo(el, { offset: -92, duration: 1.1, onComplete: () => onArrive?.() });
      } else {
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        if (onArrive) window.setTimeout(onArrive, reduce ? 0 : 650);
      }
    },
    [lenis, reduce],
  );
  return { ref, scroll };
}
