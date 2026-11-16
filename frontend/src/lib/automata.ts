import type { DfaPayload, NfaPayload } from "./types";

/** Run a DFA locally (for animations that should not wait for the network). */
export function runDfa(dfa: DfaPayload, input: string): { steps: { from: string; to: string; symbol: string }[]; accepted: boolean; final: string | null } {
  const steps: { from: string; to: string; symbol: string }[] = [];
  let q: string | null = dfa.start;
  for (const symbol of input) {
    if (q === null) break;
    const next: string | undefined = dfa.transitions[q]?.[symbol];
    if (next === undefined) {
      q = null;
      break;
    }
    steps.push({ from: q, to: next, symbol });
    q = next;
  }
  return { steps, accepted: q !== null && dfa.accepting.includes(q), final: q };
}

export function epsilonClosure(nfa: NfaPayload, states: Iterable<string>): string[] {
  const seen = new Set(states);
  const stack = [...seen];
  while (stack.length) {
    const q = stack.pop()!;
    for (const t of nfa.epsilon[q] ?? []) {
      if (!seen.has(t)) {
        seen.add(t);
        stack.push(t);
      }
    }
  }
  return nfa.states.filter((s) => seen.has(s));
}

/** Active state sets of an NFA after each symbol (ε-closed), starting with the initial set. */
export function runNfa(nfa: NfaPayload, input: string): { sets: string[][]; accepted: boolean } {
  let current = epsilonClosure(nfa, nfa.start);
  const sets = [current];
  for (const symbol of input) {
    const moved = new Set<string>();
    for (const q of current) for (const t of nfa.transitions[q]?.[symbol] ?? []) moved.add(t);
    current = epsilonClosure(nfa, moved);
    sets.push(current);
  }
  return { sets, accepted: current.some((q) => nfa.accepting.includes(q)) };
}

/** Small deterministic PRNG (mulberry32) so demos are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomString(alphabet: string[], length: number, rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < length; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}

/** Labelled sample strings for a DFA (balanced when possible): handy for marquees and demos. */
export function sampleLabelled(dfa: DfaPayload, count: number, seed = 42, maxLen = 12): { string: string; accepted: boolean }[] {
  const rand = seededRandom(seed);
  const pos: string[] = [];
  const neg: string[] = [];
  for (let tries = 0; tries < count * 60 && (pos.length < count / 2 || neg.length < count / 2); tries++) {
    const s = randomString(dfa.alphabet, 1 + Math.floor(rand() * maxLen), rand);
    const { accepted } = runDfa(dfa, s);
    const bucket = accepted ? pos : neg;
    if (bucket.length < Math.ceil(count / 2) && !bucket.includes(s)) bucket.push(s);
  }
  const out: { string: string; accepted: boolean }[] = [];
  for (let i = 0; i < Math.max(pos.length, neg.length); i++) {
    if (pos[i] !== undefined) out.push({ string: pos[i], accepted: true });
    if (neg[i] !== undefined) out.push({ string: neg[i], accepted: false });
  }
  return out.slice(0, count);
}
