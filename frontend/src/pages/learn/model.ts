import type { DfaPayload, Learner, LearnClassifyResult, LearnResult } from "@/lib/types";

/** A learned machine together with what produced it. */
export interface Outcome {
  data: LearnResult;
  learner: Learner;
  /** Samples + learner at request time; compared with the editor to detect a stale result. */
  signature: string;
  /** The preset whose rule every sample followed when this was learned, if any. */
  presetId: string | null;
  /** The distinct labelled strings that were sent. */
  samples: { string: string; label: boolean }[];
}

/** One playback of a tested string (a new id replays the same result from the start). */
export interface Run {
  id: number;
  result: LearnClassifyResult;
}

/** What the trace player shows right now; drives the graph without remounting it. */
export interface Frame {
  runId: number;
  active: string[];
  edge: { from: string; to: string } | null;
  tokenKey: number;
  done: boolean;
}

export const sampleSignature = (learner: Learner, payload: { string: string; label: boolean }[]) => JSON.stringify([learner, payload]);

/** Where a DFA ends up after reading `suffix` from `state` (null if a transition is missing). */
export function walk(dfa: DfaPayload, state: string, suffix: string): string | null {
  let q: string | null = state;
  for (const c of suffix) {
    if (q === null) return null;
    q = dfa.transitions[q]?.[c] ?? null;
  }
  return q;
}

export function ms(value: number): string {
  if (value < 1) return `${value.toFixed(2)} ms`;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A random test string over the alphabet, a little longer than typical examples. */
export function randomTestString(alphabet: string[], min = 5, max = 14): string {
  const len = min + Math.floor(Math.random() * (max - min + 1));
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
