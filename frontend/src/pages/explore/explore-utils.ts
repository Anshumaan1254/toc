import type { Approach, ApproachId, DfaPayload, Family, Language, PipelineId } from "@/lib/types";
import { APPROACH_BY_ID } from "@/lib/meta";
import { randomString, runDfa, seededRandom } from "@/lib/automata";

/** What each state "remembers", when the hand-built DFA carries notes (meta.state_notes). */
export function stateNotes(dfa: DfaPayload): Record<string, string> {
  const raw: unknown = dfa.meta?.["state_notes"];
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [state, note] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof note === "string") out[state] = note;
    }
  }
  return out;
}

/** The shortest string that drives the DFA from its start state into each state (breadth-first). */
export function accessStrings(dfa: DfaPayload): Record<string, string> {
  const out: Record<string, string> = { [dfa.start]: "" };
  const queue = [dfa.start];
  while (queue.length) {
    const q = queue.shift()!;
    for (const symbol of dfa.alphabet) {
      const next = dfa.transitions[q]?.[symbol];
      if (next !== undefined && !(next in out)) {
        out[next] = out[q] + symbol;
        queue.push(next);
      }
    }
  }
  return out;
}

/** A stable 32-bit seed from a string (FNV-1a), so every language gets its own reproducible samples. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const DIFFICULTY_LEVEL: Record<Language["difficulty"], number> = { easy: 1, medium: 2, hard: 3 };

/** Display order inside each family. The L* row sits last so it lines up with the four pipelines below it. */
export const FAMILY_IDS: Record<Family, ApproachId[]> = {
  truth: ["dfa", "nfa", "min_dfa"],
  learned: ["rpni", "edsm", "lstar_lr", "lstar_dt", "lstar_rf", "lstar_stack"],
  ml: ["ml_lr", "ml_dt", "ml_rf", "ml_stack"],
};

export const FAMILY_ORDER: Family[] = ["truth", "learned", "ml"];

/** Tiles laid out side by side inside (identity left, instruments right); they span two columns. */
export const WIDE_TILES = new Set<ApproachId>(["rpni", "edsm"]);

/** Tiles that carry a small drawing of their automaton. */
export const DIAGRAM_TILES = new Set<ApproachId>(["dfa", "nfa", "min_dfa", "rpni", "edsm"]);

/** Grid columns per family: three ground-truth machines side by side, four-column rows elsewhere. */
export const FAMILY_GRID: Record<Family, string> = {
  truth: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  learned: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  ml: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

/** Column spans; kept in one place so the loading skeleton matches the real board. */
export const TILE_SPAN: Partial<Record<ApproachId, string>> = {
  dfa: "sm:col-span-2 lg:col-span-1",
  rpni: "sm:col-span-2",
  edsm: "sm:col-span-2",
};

export function orderFamily(items: Approach[], family: Family): Approach[] {
  const order = FAMILY_IDS[family];
  const rank = (id: ApproachId) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return items.filter((a) => a.family === family).sort((a, b) => rank(a.id) - rank(b.id));
}

/** Compact identifiers for the tiles. L*(LR) reads as "L* applied to the LR model". */
export const CODE: Record<ApproachId, string> = {
  dfa: "DFA",
  nfa: "NFA",
  min_dfa: "Min DFA",
  lstar_lr: "L*(LR)",
  lstar_dt: "L*(DT)",
  lstar_rf: "L*(RF)",
  lstar_stack: "L*(Stack)",
  rpni: "RPNI",
  edsm: "EDSM",
  ml_lr: "LR",
  ml_dt: "DT",
  ml_rf: "RF",
  ml_stack: "Stack",
};

/** The display name without the API's middle-dot form. */
export function approachName(a: Approach): string {
  return APPROACH_BY_ID[a.id]?.name ?? a.name;
}

/** What a pipeline's `complexity` number counts. */
export const SIZE_UNIT: Record<PipelineId, string> = {
  lr: "parameters",
  dt: "tree nodes",
  rf: "tree nodes",
  stack: "parameters and nodes",
};

/** The L* tile and the ML tile that belong to the same trained pipeline. */
export function pairOf(id: ApproachId): ApproachId | null {
  if (id.startsWith("lstar_")) return `ml_${id.slice(6)}` as ApproachId;
  if (id.startsWith("ml_")) return `lstar_${id.slice(3)}` as ApproachId;
  return null;
}

/** Distinct alphabets across the languages, e.g. [["0","1"],["a","b"]]. */
export function distinctAlphabets(languages: Language[]): string[][] {
  const seen = new Map<string, string[]>();
  for (const l of languages) seen.set(l.alphabet.join("\u0000"), l.alphabet);
  return [...seen.values()];
}

export const setNotation = (symbols: string[]) => `{${symbols.join(", ")}}`;

/**
 * Labelled demo strings with lengths in [minLen, maxLen], alternating members and non-members
 * when the language has both (long enough to be worth watching, short enough to fit the tape).
 */
export function demoSamples(dfa: DfaPayload, count: number, seed: number, minLen = 3, maxLen = 8): { string: string; accepted: boolean }[] {
  const rand = seededRandom(seed);
  const half = Math.ceil(count / 2);
  const pos: string[] = [];
  const neg: string[] = [];
  for (let tries = 0; tries < count * 80 && (pos.length < half || neg.length < half); tries++) {
    const length = minLen + Math.floor(rand() * (maxLen - minLen + 1));
    const s = randomString(dfa.alphabet, length, rand);
    const bucket = runDfa(dfa, s).accepted ? pos : neg;
    if (bucket.length < half && !bucket.includes(s)) bucket.push(s);
  }
  const out: { string: string; accepted: boolean }[] = [];
  for (let i = 0; i < Math.max(pos.length, neg.length); i++) {
    if (pos[i] !== undefined) out.push({ string: pos[i], accepted: true });
    if (neg[i] !== undefined) out.push({ string: neg[i], accepted: false });
  }
  return out.slice(0, count);
}
