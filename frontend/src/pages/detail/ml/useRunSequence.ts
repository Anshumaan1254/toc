import { useEffect, useRef, useState } from "react";

/** The stages a string goes through on its way to a verdict. */
export type Phase = "idle" | "reading" | "features" | "model" | "decision" | "done";

const ORDER: Phase[] = ["idle", "reading", "features", "model", "decision", "done"];

export const atLeast = (phase: Phase, target: Phase): boolean => ORDER.indexOf(phase) >= ORDER.indexOf(target);

/** Time the read head needs for a string of n symbols (fast for long strings, never instant). */
export const readDuration = (n: number): number => Math.min(1100, Math.max(380, n * 48));
export const FEATURES_MS = 900;
export const MODEL_MS = 1150;
export const DECISION_MS = 950;

/**
 * Staged reveal of one run. A new `runId` restarts at "reading"; the later stages are scheduled
 * once `ready` (the result for that run has arrived). Timers are keyed by the run and cleared when
 * a newer run starts. With reduced motion the run jumps straight to "done".
 */
export function useRunSequence(runId: number, inputLength: number, ready: boolean, reduce: boolean): Phase {
  const [phase, setPhase] = useState<Phase>("idle");
  const startedAt = useRef(0);

  useEffect(() => {
    if (!runId) return;
    startedAt.current = performance.now();
    setPhase("reading");
  }, [runId]);

  useEffect(() => {
    if (!runId || !ready) return;
    if (reduce) {
      setPhase("done");
      return;
    }
    const wait = Math.max(0, readDuration(inputLength) - (performance.now() - startedAt.current));
    const plan: [Phase, number][] = [
      ["features", wait],
      ["model", wait + FEATURES_MS],
      ["decision", wait + FEATURES_MS + MODEL_MS],
      ["done", wait + FEATURES_MS + MODEL_MS + DECISION_MS],
    ];
    const timers = plan.map(([p, t]) => window.setTimeout(() => setPhase(p), t));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [runId, ready, reduce, inputLength]);

  return phase;
}

/** Number of symbols the read head has consumed while the phase is "reading". */
export function useReadHead(runId: number, inputLength: number, phase: Phase): number {
  const [head, setHead] = useState(0);
  useEffect(() => {
    if (phase === "idle") {
      setHead(0);
      return;
    }
    if (phase !== "reading") {
      setHead(inputLength);
      return;
    }
    setHead(0);
    if (inputLength === 0) return;
    const per = readDuration(inputLength) / inputLength;
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setHead(Math.min(inputLength, i));
      if (i >= inputLength) window.clearInterval(timer);
    }, per);
    return () => window.clearInterval(timer);
  }, [runId, inputLength, phase]);
  return head;
}
