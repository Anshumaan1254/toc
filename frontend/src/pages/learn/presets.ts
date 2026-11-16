import { runDfa, seededRandom } from "@/lib/automata";
import type { DfaPayload } from "@/lib/types";

/**
 * Example languages a visitor can guess. Each one has a plain predicate (used to label the
 * generated examples) and the minimal DFA for the same rule (used to check, exactly, whether
 * a learned machine found the rule). `checkPresets()` asserts the two always agree.
 */
export interface Preset {
  id: string;
  /** Short label for the chip, sentence case. */
  label: string;
  /** The rule in words, used inside sentences ("strings with an even number of a's"). */
  rule: string;
  alphabet: string[];
  accepts: (s: string) => boolean;
  /** Why a string fails the rule, in a few words ("it has an odd number of a's"). */
  whyReject: (s: string) => string;
  whyAccept: (s: string) => string;
  dfa: DfaPayload;
  /** How many examples of each class the preset loads. */
  perClass: number;
}

function dfa(alphabet: string[], start: string, accepting: string[], transitions: Record<string, Record<string, string>>): DfaPayload {
  const states = Object.keys(transitions);
  return {
    kind: "dfa",
    alphabet,
    states,
    start,
    accepting,
    transitions,
    num_states: states.length,
    num_transitions: states.length * alphabet.length,
    complete: true,
    meta: {},
  };
}

const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length;
const mod3 = (s: string) => [...s].reduce((r, bit) => (2 * r + (bit === "1" ? 1 : 0)) % 3, 0);

export const PRESETS: Preset[] = [
  {
    id: "even-a",
    label: "Even number of a's",
    rule: "strings with an even number of a's",
    alphabet: ["a", "b"],
    accepts: (s) => count(s, "a") % 2 === 0,
    whyReject: (s) => `it has ${count(s, "a")} a's, an odd number`,
    whyAccept: (s) => `it has ${count(s, "a") === 0 ? "no" : count(s, "a")} a's, an even number`,
    dfa: dfa(["a", "b"], "even", ["even"], {
      even: { a: "odd", b: "even" },
      odd: { a: "even", b: "odd" },
    }),
    perClass: 10,
  },
  {
    id: "ends-ab",
    label: "Ends with ab",
    rule: "strings that end with ab",
    alphabet: ["a", "b"],
    accepts: (s) => s.endsWith("ab"),
    whyReject: () => "it does not end with ab",
    whyAccept: () => "it ends with ab",
    dfa: dfa(["a", "b"], "none", ["ab"], {
      none: { a: "a", b: "none" },
      a: { a: "a", b: "ab" },
      ab: { a: "a", b: "none" },
    }),
    perClass: 10,
  },
  {
    id: "no-bb",
    label: "No two b's in a row",
    rule: "strings with no two b's in a row",
    alphabet: ["a", "b"],
    accepts: (s) => !s.includes("bb"),
    whyReject: () => "it contains bb",
    whyAccept: () => "it never has two b's in a row",
    dfa: dfa(["a", "b"], "ok", ["ok", "b"], {
      ok: { a: "ok", b: "b" },
      b: { a: "ok", b: "dead" },
      dead: { a: "dead", b: "dead" },
    }),
    perClass: 10,
  },
  {
    id: "len-3",
    label: "Length divisible by 3",
    rule: "strings whose length is a multiple of 3",
    alphabet: ["a", "b"],
    accepts: (s) => [...s].length % 3 === 0,
    whyReject: (s) => `its length, ${[...s].length}, is not a multiple of 3`,
    whyAccept: (s) => `its length, ${[...s].length}, is a multiple of 3`,
    dfa: dfa(["a", "b"], "r0", ["r0"], {
      r0: { a: "r1", b: "r1" },
      r1: { a: "r2", b: "r2" },
      r2: { a: "r0", b: "r0" },
    }),
    perClass: 10,
  },
  {
    id: "bin-3",
    label: "Binary multiples of 3",
    rule: "binary numbers divisible by 3",
    alphabet: ["0", "1"],
    accepts: (s) => mod3(s) === 0,
    whyReject: (s) => `as a binary number it leaves remainder ${mod3(s)} when divided by 3`,
    whyAccept: () => "as a binary number it is divisible by 3",
    dfa: dfa(["0", "1"], "r0", ["r0"], {
      r0: { "0": "r0", "1": "r1" },
      r1: { "0": "r2", "1": "r0" },
      r2: { "0": "r1", "1": "r2" },
    }),
    perClass: 12,
  },
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** Every string over `alphabet` up to `maxLen`, shortest first, then alphabetical (shortlex). */
export function shortlex(alphabet: string[], maxLen: number): string[] {
  const out: string[] = [""];
  let layer = [""];
  for (let n = 1; n <= maxLen; n++) {
    const next: string[] = [];
    for (const w of layer) for (const c of alphabet) next.push(w + c);
    out.push(...next);
    layer = next;
  }
  return out;
}

/**
 * Labelled examples for a preset: the shortest strings first (they shape the prefix tree a
 * passive learner starts from), topped up with seeded random longer strings. Deterministic per seed.
 */
export function presetSamples(preset: Preset, seed = 1): { accepted: string[]; rejected: string[] } {
  const k = preset.perClass;
  const accepted: string[] = [];
  const rejected: string[] = [];
  const take = (s: string) => {
    const bucket = preset.accepts(s) ? accepted : rejected;
    if (bucket.length < k && !bucket.includes(s)) bucket.push(s);
  };
  // Short strings in a shuffled-but-seeded order so a new seed changes which ones are kept.
  const rand = seededRandom(seed * 7919 + preset.id.length);
  const short = shortlex(preset.alphabet, 3);
  if (seed !== 1) {
    for (let i = short.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [short[i], short[j]] = [short[j], short[i]];
    }
    short.sort((a, b) => a.length - b.length || 0);
  }
  for (const s of short) take(s);
  for (let tries = 0; tries < 4000 && (accepted.length < k || rejected.length < k); tries++) {
    const len = 4 + Math.floor(rand() * 6);
    let s = "";
    for (let i = 0; i < len; i++) s += preset.alphabet[Math.floor(rand() * preset.alphabet.length)];
    take(s);
  }
  const order = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
  return { accepted: accepted.sort(order), rejected: rejected.sort(order) };
}

/** Does every sample follow the preset's rule? (Then the learned machine can be checked against it.) */
export function samplesFollow(preset: Preset, accepted: string[], rejected: string[]): boolean {
  return accepted.every((s) => preset.accepts(s)) && rejected.every((s) => !preset.accepts(s));
}

export interface RuleCheck {
  equivalent: boolean;
  /** Reachable state pairs the product search visited. */
  pairsVisited: number;
  /** Shortest (then alphabetically first) string the two machines disagree on. */
  counterexample: string | null;
  /** What the learned machine says about the counterexample. */
  learnedAccepts: boolean | null;
  targetStates: number;
}

/**
 * Exact equivalence of two complete DFAs over the same alphabet: breadth-first search over the
 * product automaton. Visiting pairs in BFS order with symbols in alphabet order means the first
 * disagreeing pair is reached by the shortlex-least counterexample.
 */
export function compareWithRule(learned: DfaPayload, target: DfaPayload): RuleCheck | null {
  const sigma = [...target.alphabet].sort();
  const learnedSigma = [...learned.alphabet].sort();
  if (sigma.length !== learnedSigma.length || sigma.some((c, i) => c !== learnedSigma[i])) return null;
  const accL = new Set(learned.accepting);
  const accT = new Set(target.accepting);
  const key = (p: string, q: string) => `${p}\u0000${q}`;
  const seen = new Set<string>([key(learned.start, target.start)]);
  const queue: { p: string; q: string; w: string }[] = [{ p: learned.start, q: target.start, w: "" }];
  for (let head = 0; head < queue.length; head++) {
    const { p, q, w } = queue[head];
    if (accL.has(p) !== accT.has(q)) {
      return { equivalent: false, pairsVisited: seen.size, counterexample: w, learnedAccepts: accL.has(p), targetStates: target.states.length };
    }
    for (const c of sigma) {
      const p2 = learned.transitions[p]?.[c];
      const q2 = target.transitions[q]?.[c];
      if (p2 === undefined || q2 === undefined) continue;
      const k = key(p2, q2);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push({ p: p2, q: q2, w: w + c });
      }
    }
  }
  return { equivalent: true, pairsVisited: seen.size, counterexample: null, learnedAccepts: null, targetStates: target.states.length };
}

/** Development check: each preset's predicate and DFA agree on every string up to length 10. */
export function checkPresets(): string[] {
  const problems: string[] = [];
  for (const p of PRESETS) {
    for (const s of shortlex(p.alphabet, 10)) {
      if (runDfa(p.dfa, s).accepted !== p.accepts(s)) {
        problems.push(`${p.id}: predicate and DFA disagree on "${s}"`);
        break;
      }
    }
  }
  return problems;
}
