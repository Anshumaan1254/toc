import type { DfaPayload } from "@/lib/types";
import { runDfa } from "@/lib/automata";

/**
 * String-making helpers that mirror the dataset generator (backend `src/data/generate.py`), so
 * the demos on the page show the same strategies on the real ground-truth DFA.
 */

export const accepts = (dfa: DfaPayload, s: string) => runDfa(dfa, s).accepted;

/** The k-th string in shortlex order (0 -> ε, 1 -> first symbol, ...). */
export function shortlexAt(alphabet: string[], k: number): string {
  const n = alphabet.length;
  let len = 0;
  let before = 0;
  let size = 1;
  while (k >= before + size) {
    before += size;
    size *= n;
    len += 1;
  }
  let offset = k - before;
  const out: string[] = new Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = alphabet[offset % n];
    offset = Math.floor(offset / n);
  }
  return out.join("");
}

/** Number of strings of length 0..maxLen over an alphabet of the given size. */
export const stringsUpTo = (alphabetSize: number, maxLen: number) => {
  let total = 0;
  for (let i = 0, p = 1; i <= maxLen; i++, p *= alphabetSize) total += p;
  return total;
};

/**
 * table[n][q] = number of strings of length n that lead from state q to acceptance.
 * Exact in doubles up to 2^53, far beyond the lengths used here (alphabet 2, n <= 40).
 */
export function countTable(dfa: DfaPayload, maxLen: number): Record<string, number>[] {
  const accepting = new Set(dfa.accepting);
  const table: Record<string, number>[] = [Object.fromEntries(dfa.states.map((q) => [q, accepting.has(q) ? 1 : 0]))];
  for (let n = 1; n <= maxLen; n++) {
    const prev = table[n - 1];
    table.push(
      Object.fromEntries(
        dfa.states.map((q) => [q, dfa.alphabet.reduce((sum, a) => sum + (prev[dfa.transitions[q]?.[a] ?? ""] ?? 0), 0)]),
      ),
    );
  }
  return table;
}

/**
 * Exact uniform sample among the accepted (or rejected) strings of one length, walking the
 * DFA symbol by symbol with probabilities proportional to the completions left. The DFA must
 * be complete (the ground-truth DFAs are).
 */
export function sampleUniform(dfa: DfaPayload, table: Record<string, number>[], length: number, accepted: boolean, rand: () => number): string | null {
  const k = dfa.alphabet.length;
  const count = (n: number, q: string) => (accepted ? table[n][q] : k ** n - table[n][q]);
  let q = dfa.start;
  if (count(length, q) <= 0) return null;
  let out = "";
  for (let r = length; r > 0; r--) {
    let x = Math.floor(rand() * count(r, q));
    for (const a of dfa.alphabet) {
      const next = dfa.transitions[q][a];
      const c = count(r - 1, next);
      if (x < c) {
        out += a;
        q = next;
        break;
      }
      x -= c;
    }
  }
  return out;
}

export type EditOp = "substitute" | "insert" | "delete";
export interface Edited {
  before: string;
  after: string;
  op: EditOp;
  /** Index of the edited cell: in `after` for substitute/insert, in `before` for delete. */
  at: number;
}

/** One random substitute / insert / delete, like `random_edit` (single-edit case). */
export function randomEdit(s: string, alphabet: string[], rand: () => number): Edited {
  const chars = [...s];
  const ops: EditOp[] = chars.length ? ["substitute", "insert", "delete"] : ["insert"];
  const op = ops[Math.floor(rand() * ops.length)];
  if (op === "substitute") {
    const i = Math.floor(rand() * chars.length);
    const choices = alphabet.filter((a) => a !== chars[i]);
    chars[i] = choices[Math.floor(rand() * choices.length)];
    return { before: s, after: chars.join(""), op, at: i };
  }
  if (op === "insert") {
    const i = Math.floor(rand() * (chars.length + 1));
    chars.splice(i, 0, alphabet[Math.floor(rand() * alphabet.length)]);
    return { before: s, after: chars.join(""), op, at: i };
  }
  const i = Math.floor(rand() * chars.length);
  chars.splice(i, 1);
  return { before: s, after: chars.join(""), op, at: i };
}

export type StructuredKind = "run" | "repeat" | "palindrome";

/** Long runs, a repeated short pattern, or a palindrome (like `structured`). */
export function structured(kind: StructuredKind, n: number, alphabet: string[], rand: () => number): string {
  const pick = () => alphabet[Math.floor(rand() * alphabet.length)];
  const word = (len: number) => Array.from({ length: len }, pick).join("");
  if (kind === "run") {
    const k = 2 + Math.floor(rand() * 2);
    const cuts = Array.from({ length: k - 1 }, () => 1 + Math.floor(rand() * (n - 1))).sort((a, b) => a - b);
    const bounds = [0, ...cuts, n];
    const first = Math.floor(rand() * alphabet.length);
    return bounds
      .slice(1)
      .map((b, j) => alphabet[(first + j) % alphabet.length].repeat(b - bounds[j]))
      .join("");
  }
  if (kind === "repeat") {
    const pattern = word(2 + Math.floor(rand() * 3));
    return pattern.repeat(Math.ceil(n / pattern.length) + 1).slice(0, n);
  }
  const half = word(Math.floor(n / 2));
  return half + word(n % 2) + [...half].reverse().join("");
}
