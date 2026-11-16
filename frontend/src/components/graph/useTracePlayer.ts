import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Playback controller for step-by-step traces.
 * `index` is the number of symbols consumed minus one: -1 = before reading anything,
 * length - 1 = finished.  With reduced motion, play() jumps straight to the end.
 */
export function useTracePlayer(length: number, opts: { stepMs?: number } = {}) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [stepMs, setStepMs] = useState(opts.stepMs ?? 650);

  useEffect(() => {
    setIndex(-1);
    setPlaying(false);
  }, [length]);

  useEffect(() => {
    if (!playing) return;
    if (index >= length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIndex((i) => i + 1), index < 0 ? Math.min(stepMs, 350) : stepMs);
    return () => window.clearTimeout(t);
  }, [playing, index, length, stepMs]);

  const play = useCallback(() => {
    if (reduce) {
      setIndex(length - 1);
      return;
    }
    setIndex((i) => (i >= length - 1 ? -1 : i));
    setPlaying(true);
  }, [reduce, length]);

  const restart = useCallback(() => {
    setIndex(reduce ? length - 1 : -1);
    setPlaying(!reduce);
  }, [reduce, length]);

  return {
    index,
    playing,
    done: index >= length - 1,
    stepMs,
    setStepMs,
    play,
    restart,
    pause: useCallback(() => setPlaying(false), []),
    toggle: useCallback(() => (playing ? setPlaying(false) : play()), [playing, play]),
    next: useCallback(() => setIndex((i) => Math.min(length - 1, i + 1)), [length]),
    prev: useCallback(() => setIndex((i) => Math.max(-1, i - 1)), []),
    reset: useCallback(() => {
      setPlaying(false);
      setIndex(-1);
    }, []),
    seek: useCallback((i: number) => setIndex(Math.max(-1, Math.min(length - 1, i))), [length]),
    jumpToEnd: useCallback(() => {
      setPlaying(false);
      setIndex(length - 1);
    }, [length]),
  };
}
