import { runDfa } from "@/lib/automata";
import type { DfaPayload, Minimization, SubsetStep } from "@/lib/types";

/** The same DFA, started from another state (to run a suffix "from q"). */
export function withStart(dfa: DfaPayload, start: string): DfaPayload {
  return { ...dfa, start };
}

/** States visited while reading s (index i = after i symbols). */
export function trail(dfa: DfaPayload, s: string): string[] {
  const out = [dfa.start];
  for (const step of runDfa(dfa, s).steps) out.push(step.to);
  return out;
}

/**
 * Pumping-lemma split of s on a DFA: the first state that repeats gives s = x y z with
 * y a loop (non-empty). Returns null when no state repeats (s shorter than the state count).
 */
export function pumpSplit(dfa: DfaPayload, s: string): { x: string; y: string; z: string; state: string } | null {
  const states = trail(dfa, s);
  const seen = new Map<string, number>();
  for (let j = 0; j < states.length; j++) {
    const i = seen.get(states[j]);
    if (i !== undefined) return { x: s.slice(0, i), y: s.slice(i, j), z: s.slice(j), state: states[j] };
    seen.set(states[j], j);
  }
  return null;
}

/** States discovered after `frame` steps of the subset construction (frame 0 = only the start). */
export function discoveredAt(start: string, steps: SubsetStep[], frame: number): Set<string> {
  const out = new Set([start]);
  for (let i = 0; i < Math.min(frame, steps.length); i++) out.add(steps[i].to);
  return out;
}

/**
 * Moore rounds with stable colours: every block takes the colour of the final group that
 * contains its first member, so a block keeps its colour until it splits.
 */
export function mooreColouring(min: Minimization): { rounds: Record<string, number>[]; finalOf: Record<string, number> } {
  const groupNames = Object.keys(min.groups);
  const finalIndex: Record<string, number> = {};
  groupNames.forEach((g, i) => {
    for (const q of min.groups[g]) finalIndex[q] = i;
  });
  const rounds = min.moore_rounds.map((blocks) => {
    const colour: Record<string, number> = {};
    for (const block of blocks) {
      const id = finalIndex[block[0]] ?? 0;
      for (const q of block) colour[q] = id;
    }
    return colour;
  });
  const finalOf: Record<string, number> = {};
  groupNames.forEach((g, i) => (finalOf[g] = i));
  return { rounds, finalOf };
}

/** Value of a binary string, MSB first. */
export const binValue = (s: string): number => [...s].reduce((v, c) => v * 2 + (c === "1" ? 1 : 0), 0);
