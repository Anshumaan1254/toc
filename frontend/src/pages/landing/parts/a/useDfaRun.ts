import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTracePlayer } from "@/components/graph/useTracePlayer";
import type { TapeStatus } from "@/components/tape/Tape";
import { runDfa } from "@/lib/automata";
import type { DfaPayload } from "@/lib/types";

export type RunPhase = "idle" | "typing" | "reading" | "done";

interface RunState {
  key: number;
  phase: RunPhase;
  typed: number;
}

const NO_STEPS: { from: string; to: string; symbol: string }[] = [];

/**
 * One animated run of a DFA on a string: the string is typed onto the tape, then the
 * machine reads it one symbol per step, then it stops on its verdict.
 * Bump `runKey` to start a new run (also when the string stays the same).
 * Built on useTracePlayer; playback is always started from an effect keyed on the run,
 * never from an event handler (the player resets itself when the trace length changes).
 */
export function useDfaRun(
  dfa: DfaPayload | undefined,
  input: string,
  runKey: number,
  opts: { stepMs?: number; typeMs?: number; typing?: boolean } = {},
) {
  const { stepMs = 560, typeMs = 70, typing = true } = opts;
  const reduce = useReducedMotion();
  const result = useMemo(() => (dfa ? runDfa(dfa, input) : null), [dfa, input]);
  const steps = result?.steps ?? NO_STEPS;
  const player = useTracePlayer(steps.length, { stepMs });
  const { reset, restart, setStepMs } = player;
  const [st, setSt] = useState<RunState>({ key: Number.NaN, phase: "idle", typed: 0 });
  const startedFor = useRef<number | null>(null);

  useEffect(() => setStepMs(stepMs), [stepMs, setStepMs]);

  // A new run. Declared after useTracePlayer, so the player's own length reset runs first.
  useEffect(() => {
    if (!dfa) return;
    reset();
    startedFor.current = null;
    const skipTyping = reduce || !typing || input.length === 0;
    setSt({ key: runKey, phase: skipTyping ? "reading" : "typing", typed: skipTyping ? input.length : 1 });
  }, [runKey, dfa, input, reduce, typing, reset]);

  const current = st.key === runKey;

  // Typing: one symbol at a time.
  useEffect(() => {
    if (!current || st.phase !== "typing") return;
    if (st.typed >= input.length) {
      setSt((s) => (s.key === runKey ? { ...s, phase: "reading" } : s));
      return;
    }
    const t = window.setTimeout(() => setSt((s) => (s.key === runKey ? { ...s, typed: s.typed + 1 } : s)), typeMs);
    return () => window.clearTimeout(t);
  }, [current, st.phase, st.typed, input.length, typeMs, runKey]);

  // Reading: start the player once per run.
  useEffect(() => {
    if (!current || st.phase !== "reading" || startedFor.current === runKey) return;
    startedFor.current = runKey;
    restart();
  }, [current, st.phase, runKey, restart]);

  // Finished: the player has consumed every symbol.
  useEffect(() => {
    if (!current || st.phase !== "reading" || startedFor.current !== runKey) return;
    if (player.done && !player.playing) setSt((s) => (s.key === runKey ? { ...s, phase: "done" } : s));
  }, [current, st.phase, runKey, player.done, player.playing]);

  const phase: RunPhase = current ? st.phase : "idle";
  const reading = phase === "reading" || phase === "done";
  const idx = reading ? Math.min(player.index, steps.length - 1) : -1;
  const step = idx >= 0 ? steps[idx] : null;
  const accepted = result?.accepted ?? false;
  const status: TapeStatus = phase === "done" ? (accepted ? "accepted" : "rejected") : phase === "reading" ? "running" : "idle";

  return {
    phase,
    steps,
    accepted,
    finalState: result?.final ?? null,
    /** What is on the tape right now (grows while typing). */
    tape: phase === "typing" ? input.slice(0, st.typed) : input,
    /** Symbols consumed so far (Tape's `head`). */
    head: reading ? idx + 1 : 0,
    index: idx,
    current: step ? step.to : (dfa?.start ?? null),
    edge: step ? { from: step.from, to: step.to } : null,
    tokenKey: `${runKey}:${idx}`,
    verdict: phase === "done" ? (accepted ? ("accept" as const) : ("reject" as const)) : null,
    status,
    stepMs: player.stepMs,
  };
}

export type DfaRun = ReturnType<typeof useDfaRun>;
