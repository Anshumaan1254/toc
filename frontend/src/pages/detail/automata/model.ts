// Pure helpers for the automaton detail pages: narrowing untyped meta fields, BFS over DFAs,
// Myhill–Nerode suffixes, product-construction disagreements, example strings and Moore colours.
import { sampleLabelled } from "@/lib/automata";
import type { AutomatonPayload, DfaPayload, SuffixRow } from "@/lib/types";

// ------------------------------------------------------------------ meta narrowing
function metaOf(a: AutomatonPayload): Record<string, unknown> {
  return a.meta && typeof a.meta === "object" ? a.meta : {};
}

/** `meta.state_notes`: what each state of a hand-built automaton remembers. */
export function stateNotes(a: AutomatonPayload): Record<string, string> {
  const raw = metaOf(a).state_notes;
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** `meta.subsets` of a subset-construction DFA: DFA state -> the NFA states it stands for. */
export function subsetsOf(a: AutomatonPayload): Record<string, string[]> {
  const raw = metaOf(a).subsets;
  const out: Record<string, string[]> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
    }
  }
  return out;
}

export function metaString(a: AutomatonPayload, key: string): string | undefined {
  const v = metaOf(a)[key];
  return typeof v === "string" ? v : undefined;
}

export function metaNumber(a: AutomatonPayload, key: string): number | undefined {
  const v = metaOf(a)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// ------------------------------------------------------------------ small formatting helpers
/** `{n0, n2}`; the empty set is ∅. */
export const setLabel = (states: readonly string[]): string => (states.length === 0 ? "∅" : `{${states.join(", ")}}`);

export const setKey = (states: readonly string[]): string => [...states].sort().join("\u0000");

export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------ BFS over a DFA
/** Shortest string that reaches each state (symbols tried in alphabet order). */
export function accessStrings(dfa: DfaPayload): Map<string, string> {
  const out = new Map<string, string>([[dfa.start, ""]]);
  const queue = [dfa.start];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const s of dfa.alphabet) {
      const q = dfa.transitions[p]?.[s];
      if (q !== undefined && !out.has(q)) {
        out.set(q, out.get(p)! + s);
        queue.push(q);
      }
    }
  }
  return out;
}

/** Non-accepting states that every symbol maps back to themselves. */
export function trapStates(dfa: DfaPayload): Set<string> {
  const acc = new Set(dfa.accepting);
  return new Set(dfa.states.filter((q) => !acc.has(q) && dfa.alphabet.every((s) => dfa.transitions[q]?.[s] === q)));
}

// ------------------------------------------------------------------ Myhill–Nerode
export interface SeparationTable {
  states: string[];
  /** Shortest separating suffix for the pair, or null when no string separates them. */
  suffix: (p: string, q: string) => string | null;
  pairs: number;
  separated: number;
  longest: number;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function tableFrom(states: string[], map: Map<string, string>): SeparationTable {
  const index = new Map(states.map((s, i) => [s, i]));
  let longest = 0;
  for (const w of map.values()) longest = Math.max(longest, w.length);
  return {
    states,
    pairs: (states.length * (states.length - 1)) / 2,
    separated: map.size,
    longest,
    suffix: (p, q) => {
      const a = index.get(p);
      const b = index.get(q);
      if (a === undefined || b === undefined || a === b) return null;
      return map.get(pairKey(a, b)) ?? null;
    },
  };
}

/** The backend's table (dfa / min_dfa records). */
export function separationFromRows(dfa: DfaPayload, rows: SuffixRow[]): SeparationTable {
  const index = new Map(dfa.states.map((s, i) => [s, i]));
  const map = new Map<string, string>();
  for (const r of rows) {
    const a = index.get(r.p);
    const b = index.get(r.q);
    if (a !== undefined && b !== undefined && a !== b) map.set(pairKey(a, b), r.suffix);
  }
  return tableFrom(dfa.states, map);
}

/**
 * Table filling: BFS over the reversed pair graph from the pairs that disagree on acceptance,
 * so every suffix found is a shortest one (same algorithm as src/automata/minimize.py).
 * Missing transitions go to an implicit rejecting sink.
 */
export function separationTable(dfa: DfaPayload): SeparationTable {
  const n = dfa.states.length;
  const sink = n;
  const index = new Map(dfa.states.map((s, i) => [s, i]));
  const acc = new Set(dfa.accepting.map((s) => index.get(s)!));
  const k = dfa.alphabet.length;
  const inverse: number[][][] = Array.from({ length: k }, () => Array.from({ length: n + 1 }, () => []));
  let needsSink = false;
  for (let q = 0; q < n; q++) {
    for (let c = 0; c < k; c++) {
      const target = dfa.transitions[dfa.states[q]]?.[dfa.alphabet[c]];
      const t = target === undefined ? sink : index.get(target) ?? sink;
      if (t === sink) needsSink = true;
      inverse[c][t].push(q);
    }
  }
  if (needsSink) for (let c = 0; c < k; c++) inverse[c][sink].push(sink);
  const total = needsSink ? n + 1 : n;
  const found = new Map<string, string>();
  const queue: [number, number][] = [];
  for (let p = 0; p < total; p++) {
    for (let q = p + 1; q < total; q++) {
      if (acc.has(p) !== acc.has(q)) {
        found.set(pairKey(p, q), "");
        queue.push([p, q]);
      }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const [p2, q2] = queue[i];
    const w = found.get(pairKey(p2, q2))!;
    for (let c = 0; c < k; c++) {
      for (const p of inverse[c][p2]) {
        for (const q of inverse[c][q2]) {
          if (p === q) continue;
          const key = pairKey(p, q);
          if (!found.has(key)) {
            found.set(key, dfa.alphabet[c] + w);
            queue.push([p, q]);
          }
        }
      }
    }
  }
  // Keep only pairs of real states.
  const map = new Map<string, string>();
  for (const [key, w] of found) {
    const [a, b] = key.split("|").map(Number);
    if (a < n && b < n) map.set(key, w);
  }
  return tableFrom(dfa.states, map);
}

/** Run a DFA from an arbitrary state; null when a transition is missing. */
export function runFrom(dfa: DfaPayload, from: string, input: string): { path: string[]; end: string | null } {
  const path = [from];
  let q: string | null = from;
  for (const s of input) {
    const next: string | undefined = q === null ? undefined : dfa.transitions[q]?.[s];
    q = next ?? null;
    if (q === null) break;
    path.push(q);
  }
  return { path, end: q };
}

// ------------------------------------------------------------------ product construction
/** Strings on which two DFAs over the same alphabet disagree, shortest first (BFS over pairs). */
export function disagreements(a: DfaPayload, b: DfaPayload, max = 3, budget = 40000): string[] {
  const out: string[] = [];
  const accA = new Set(a.accepting);
  const accB = new Set(b.accepting);
  const SINK = "\u0001sink";
  const step = (d: DfaPayload, q: string, s: string) => (q === SINK ? SINK : d.transitions[q]?.[s] ?? SINK);
  const start: [string, string, string] = [a.start, b.start, ""];
  const seen = new Set([`${a.start}\u0000${b.start}`]);
  const queue = [start];
  for (let i = 0; i < queue.length && out.length < max && i < budget; i++) {
    const [p, q, w] = queue[i];
    if (accA.has(p) !== accB.has(q)) out.push(w);
    for (const s of a.alphabet) {
      const np = step(a, p, s);
      const nq = step(b, q, s);
      const key = `${np}\u0000${nq}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([np, nq, w + s]);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ example strings
function shortestWhere(dfa: DfaPayload, want: boolean): string | null {
  const acc = new Set(dfa.accepting);
  const access = accessStrings(dfa);
  let best: string | null = null;
  for (const [q, w] of access) {
    if (acc.has(q) !== want) continue;
    if (best === null || w.length < best.length || (w.length === best.length && w < best)) best = w;
  }
  return best;
}

/** A few strings in and out of the language of `judge`: the shortest of each, then varied seeded ones. */
export function exampleStrings(judge: DfaPayload, count = 3, maxLen = 9): { accepted: string[]; rejected: string[] } {
  const accepted: string[] = [];
  const rejected: string[] = [];
  const firstIn = shortestWhere(judge, true);
  const firstOut = shortestWhere(judge, false);
  if (firstIn !== null) accepted.push(firstIn);
  if (firstOut !== null) rejected.push(firstOut);
  for (const { string, accepted: ok } of sampleLabelled(judge, 24, 7, maxLen)) {
    const bucket = ok ? accepted : rejected;
    if (bucket.length < count && !bucket.includes(string)) bucket.push(string);
  }
  const byLength = (x: string, y: string) => x.length - y.length || (x < y ? -1 : 1);
  return { accepted: accepted.sort(byLength), rejected: rejected.sort(byLength) };
}

// ------------------------------------------------------------------ Moore rounds
/**
 * Colour slot per state for every Moore round. A block keeps its colour when it splits (the first
 * child inherits it, the others get fresh slots), so colours stay stable from round to round.
 */
export function lineageSlots(rounds: string[][][]): Record<string, number>[] {
  const result: Record<string, number>[] = [];
  let prev: Map<string, number> | null = null;
  let nextSlot = 0;
  for (const round of rounds) {
    const map = new Map<string, number>();
    const claimed = new Set<number>();
    for (const block of round) {
      const parent = prev?.get(block[0]);
      let slot: number;
      if (parent !== undefined && !claimed.has(parent)) slot = parent;
      else slot = nextSlot++;
      claimed.add(slot);
      for (const s of block) map.set(s, slot);
    }
    result.push(Object.fromEntries(map));
    prev = map;
  }
  return result;
}

/**
 * Mirrors GROUP_COLORS in src/components/graph/AutomatonGraph.tsx so legend chips match the
 * graph's block tints exactly (slots 6 and 7 are the lead's own fixed values).
 */
export const BLOCK_COLORS = [
  "var(--series-lr)",
  "var(--series-dt)",
  "var(--series-rf)",
  "var(--series-stack)",
  "var(--series-rpni)",
  "var(--series-edsm)",
  "#6250d6",
  "#e34948",
];

export const blockColor = (slot: number | undefined): string =>
  slot !== undefined && slot < BLOCK_COLORS.length ? BLOCK_COLORS[slot] : "var(--ink-2)";

// ------------------------------------------------------------------ copy helpers
/** Human sentence for L*'s stop reason. */
export function stopReasonText(reason: string | null | undefined, converged: boolean | null | undefined): string {
  if (reason === "equivalent") return "The teacher found no counterexample, so L* stopped with this hypothesis.";
  if (reason === "max_states") return "L* stopped at its state budget: the next hypothesis would have been too large.";
  if (reason === "no blue states left") return "Every state of the prefix tree was either merged or promoted.";
  if (reason) return `Stopped: ${reason}.`;
  return converged ? "Converged." : "Did not converge.";
}
