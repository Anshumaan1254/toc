import type { DfaPayload, LearningTrace } from "@/lib/types";
import { runDfa } from "@/lib/automata";
import { showString } from "@/lib/meta";

/**
 * Replays a real L* run (backend `src/automata/learners.py::lstar`, Angluin counterexample
 * handling) so the observation table can be drawn cell by cell.
 *
 * The backend records only the shape of each round (|S|, |E|, states, counterexample). The
 * cells are the model's membership answers. For every *complete* round they can be recovered
 * from the extracted DFA: Angluin's theorem says a hypothesis built from a closed, consistent
 * table agrees with every cell of that table, S and E only grow, and the extracted DFA is the
 * last complete hypothesis. The replay re-runs the same closedness / consistency fixes in the
 * same order and is checked against the recorded shapes (`verified`). An aborted last round
 * (state budget exceeded) depends on answers the DFA does not know, so it is reported only by
 * its recorded size.
 */

export type FrameKind = "start" | "close" | "consistent" | "hypothesis" | "counterexample" | "extend" | "abort";

export interface TableFrame {
  kind: FrameKind;
  round: number;
  /** Access strings (upper block of the table). */
  S: string[];
  /** Experiments (columns). */
  E: string[];
  /** One-symbol extensions S·Σ not in S (lower block). */
  ext: string[];
  /** Rows that just moved into S (closedness fix or counterexample prefixes). */
  added: string[];
  /** Consistency fix: rows `a` and `b` agree everywhere but differ after `symbol` + `suffix`. */
  separator?: { a: string; b: string; symbol: string; suffix: string; experiment: string };
  hypothesis?: DfaPayload;
  counterexample?: { string: string; hypothesisAccepts: boolean };
  /** Distinct strings asked so far while building the table. */
  queries: number;
  /** Recorded size of an aborted round. */
  aborted?: { S: number; E: number };
}

export interface Replay {
  frames: TableFrame[];
  verified: boolean;
  /** Membership answer for any string (the oracle the cells were replayed from). */
  ask: (s: string) => boolean;
}

const key = (s: string) => s;

/**
 * State name for an access string: [w], the Myhill-Nerode class of w. (Bracketed names also
 * keep graph layouts stable: purely numeric ids like "10" would be reordered as object keys.)
 */
export const stateName = (access: string) => `[${showString(access)}]`;

/** Build the hypothesis DFA exactly like ObservationTable.hypothesis(); states are named [access string]. */
function buildHypothesis(alphabet: string[], S: string[], row: (s: string) => string, ask: (s: string) => boolean): DfaPayload {
  const index = new Map<string, number>();
  const access: string[] = [];
  for (const s of S) {
    const r = row(s);
    if (!index.has(r)) {
      index.set(r, access.length);
      access.push(s);
    }
  }
  const names = access.map(stateName);
  const transitions: Record<string, Record<string, string>> = {};
  access.forEach((s, i) => {
    transitions[names[i]] = {};
    for (const a of alphabet) {
      const target = index.get(row(s + a));
      if (target !== undefined) transitions[names[i]][a] = names[target];
    }
  });
  const accepting = names.filter((_, i) => ask(access[i]));
  return {
    kind: "dfa",
    alphabet,
    states: names,
    start: names[index.get(row(""))!],
    accepting,
    transitions,
    num_states: names.length,
    num_transitions: names.length * alphabet.length,
    complete: true,
    meta: { access_strings: Object.fromEntries(names.map((n, i) => [n, access[i]])) },
  };
}

export function replayLStar(oracle: DfaPayload, learning: LearningTrace): Replay {
  const alphabet = oracle.alphabet;
  const cache = new Map<string, boolean>();
  const ask = (s: string): boolean => {
    let v = cache.get(key(s));
    if (v === undefined) {
      v = runDfa(oracle, s).accepted;
      cache.set(key(s), v);
    }
    return v;
  };
  const S: string[] = [""];
  const inS = new Set<string>(S);
  const E: string[] = [""];
  const ext = () => S.flatMap((s) => alphabet.map((a) => s + a)).filter((t) => !inS.has(t));
  const row = (s: string) => E.map((e) => (ask(s + e) ? "1" : "0")).join("");
  const fill = () => {
    for (const r of [...S, ...ext()]) for (const e of E) ask(r + e);
  };
  const frames: TableFrame[] = [];
  let round = 1;
  const snap = (kind: FrameKind, extra: Partial<TableFrame> = {}) =>
    frames.push({ kind, round, S: [...S], E: [...E], ext: ext(), added: [], queries: cache.size, ...extra });

  const unclosed = (): string[] => {
    const sRows = new Set(S.map(row));
    const missing = new Map<string, string>();
    for (const t of ext()) {
      const r = row(t);
      if (!sRows.has(r) && !missing.has(r)) missing.set(r, t);
    }
    return [...missing.values()];
  };
  const inconsistency = () => {
    const groups = new Map<string, string[]>();
    for (const s of S) {
      const r = row(s);
      const g = groups.get(r);
      if (g) g.push(s);
      else groups.set(r, [s]);
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const first = members[0];
      for (const other of members.slice(1))
        for (const a of alphabet)
          for (const e of E) if (ask(first + a + e) !== ask(other + a + e)) return { a: first, b: other, symbol: a, suffix: e, experiment: a + e };
    }
    return null;
  };

  const rounds = learning.rounds ?? [];
  let verified = rounds.length > 0;
  fill();
  snap("start");

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    round = r.round;
    if (r.aborted) {
      snap("abort", { aborted: { S: r.S, E: r.E } });
      break;
    }
    for (let guard = 0; guard < 400; guard++) {
      const missing = unclosed();
      if (missing.length) {
        for (const m of missing) {
          S.push(m);
          inS.add(m);
        }
        fill();
        snap("close", { added: missing });
        continue;
      }
      const sep = inconsistency();
      if (sep) {
        E.push(sep.experiment);
        fill();
        snap("consistent", { separator: sep });
        continue;
      }
      break;
    }
    const hypothesis = buildHypothesis(alphabet, S, row, ask);
    if (S.length !== r.S || E.length !== r.E || hypothesis.num_states !== r.states) verified = false;
    snap("hypothesis", { hypothesis });
    const cex = r.counterexample;
    if (cex === null || cex === undefined) break;
    const counterexample = { string: cex, hypothesisAccepts: runDfa(hypothesis, cex).accepted };
    snap("counterexample", { hypothesis, counterexample });
    const next = rounds[i + 1];
    if (!next) break;
    if (next.aborted) {
      round = next.round;
      snap("abort", { hypothesis, counterexample, aborted: { S: next.S, E: next.E } });
      break;
    }
    const prefixes = Array.from({ length: cex.length + 1 }, (_, k) => cex.slice(0, k)).filter((p) => !inS.has(p));
    for (const p of prefixes) {
      S.push(p);
      inS.add(p);
    }
    round = next.round;
    fill();
    snap("extend", { hypothesis, counterexample, added: prefixes });
  }
  return { frames, verified, ask };
}

/** Shortest string on which two DFAs disagree (breadth-first over the product), or null. */
export function shortestDifference(a: DfaPayload, b: DfaPayload): string | null {
  const DEAD = "\u0000dead";
  const step = (d: DfaPayload, q: string, s: string) => (q === DEAD ? DEAD : d.transitions[q]?.[s] ?? DEAD);
  const acc = (d: DfaPayload, q: string) => q !== DEAD && d.accepting.includes(q);
  const alphabet = [...new Set([...a.alphabet, ...b.alphabet])].sort();
  const seen = new Set<string>([`${a.start}\u0001${b.start}`]);
  const queue: [string, string, string][] = [[a.start, b.start, ""]];
  while (queue.length) {
    const [p, q, w] = queue.shift()!;
    if (acc(a, p) !== acc(b, q)) return w;
    for (const s of alphabet) {
      const p2 = step(a, p, s);
      const q2 = step(b, q, s);
      const k = `${p2}\u0001${q2}`;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([p2, q2, w + s]);
      }
    }
  }
  return null;
}

/** The first `count` strings (shortlex order) a DFA accepts, up to `maxLen` symbols. */
export function firstAccepted(dfa: DfaPayload, count: number, maxLen = 8): string[] {
  const out: string[] = [];
  let layer = [""];
  for (let len = 0; len <= maxLen && out.length < count; len++) {
    for (const s of layer) {
      if (runDfa(dfa, s).accepted) out.push(s);
      if (out.length >= count) break;
    }
    layer = layer.flatMap((s) => dfa.alphabet.map((a) => s + a));
  }
  return out;
}

/**
 * True when two DFAs accept exactly the same non-empty strings: breadth-first over the product
 * automaton from every one-symbol successor of the start pair. Combined with a disagreement
 * on ε it proves the languages differ on the empty string alone.
 */
export function agreeOnNonEmpty(a: DfaPayload, b: DfaPayload): boolean {
  const DEAD = "\u0000dead";
  const step = (d: DfaPayload, q: string, s: string) => (q === DEAD ? DEAD : d.transitions[q]?.[s] ?? DEAD);
  const acc = (d: DfaPayload, q: string) => q !== DEAD && d.accepting.includes(q);
  const alphabet = [...new Set([...a.alphabet, ...b.alphabet])];
  const queue: [string, string][] = alphabet.map((s) => [step(a, a.start, s), step(b, b.start, s)]);
  const seen = new Set(queue.map(([p, q]) => `${p}\u0001${q}`));
  while (queue.length) {
    const [p, q] = queue.shift()!;
    if (acc(a, p) !== acc(b, q)) return false;
    for (const s of alphabet) {
      const next: [string, string] = [step(a, p, s), step(b, q, s)];
      const k = `${next[0]}\u0001${next[1]}`;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(next);
      }
    }
  }
  return true;
}
