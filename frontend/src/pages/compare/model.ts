import { APPROACHES, PIPELINES, int, type ApproachMeta } from "@/lib/meta";
import type { Approach, ApproachId, CompareResult, CompareRow, Family } from "@/lib/types";

// ------------------------------------------------------------------ slots: one per approach, in family order
export const FAMILY_ORDER: Family[] = ["truth", "learned", "ml"];

export interface Slot {
  meta: ApproachMeta;
  /** From /api/approaches: availability and size statistics. */
  approach?: Approach;
  /** From /api/compare: this approach's verdict on the string. */
  row?: CompareRow;
}

/**
 * Joins the static approach list, the per-language approach stats and the comparison rows.
 * The order is always ground truth, learned automata, ML pipelines (the API sends ML first).
 */
export function buildSlots(approaches: Approach[] | undefined, result: CompareResult | null): Slot[] {
  const stats = new Map((approaches ?? []).map((a) => [a.id, a]));
  const rows = new Map((result?.results ?? []).map((r) => [r.approach, r]));
  const known = approaches !== undefined || result !== null;
  return APPROACHES.filter((meta) => !known || stats.has(meta.id) || rows.has(meta.id)).map((meta) => ({
    meta,
    approach: stats.get(meta.id),
    row: rows.get(meta.id),
  }));
}

export function groupByFamily(slots: Slot[]): { family: Family; slots: Slot[] }[] {
  return FAMILY_ORDER.map((family) => ({ family, slots: slots.filter((s) => s.meta.family === family) })).filter((g) => g.slots.length > 0);
}

export const isWrong = (row: CompareRow | undefined): boolean => !!row && row.available && row.correct === false;

// ------------------------------------------------------------------ time: a log scale from 0.1 µs to 1 s
const LOG_MIN = -4; // 1e-4 ms = 0.1 µs
const LOG_MAX = 3; // 1e3 ms = 1 s

/** Position of a duration (in ms) on the shared log axis, 0..1. */
export function timeFraction(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return 0;
  const v = Math.log10(ms);
  return Math.min(1, Math.max(0.015, (v - LOG_MIN) / (LOG_MAX - LOG_MIN)));
}

export const TIME_TICKS: { ms: number; label: string }[] = [
  { ms: 1e-3, label: "1 µs" },
  { ms: 1, label: "1 ms" },
  { ms: 1e3, label: "1 s" },
];

/** How long a row's read head takes to cross its time bar: constant speed, so slow machines land last. */
export const raceSeconds = (ms: number | undefined): number => 0.25 + timeFraction(ms) * 1.7;

// ------------------------------------------------------------------ language helpers
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen"];
export const numberWord = (n: number): string => WORDS[n] ?? int(n);

export function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Model names as they read mid-sentence ("the Decision Tree pipeline", "extracted from the Decision Tree"). */
const SENTENCE_NAME: Record<string, string> = {
  lr: "Logistic Regression",
  dt: "Decision Tree",
  rf: "Random Forest",
  stack: "stacked ensemble",
};
const SOURCE_NAME: Record<string, string> = {
  lr: "the Logistic Regression",
  dt: "the Decision Tree",
  rf: "the Random Forest",
  stack: "the stacked ensemble",
};

/**
 * Names the approaches that disagree with the ground truth in plain English. An L* DFA is named
 * through the model it was extracted from, so inherited mistakes read as one phrase:
 * "three ML pipelines (Logistic Regression, Decision Tree and the stacked ensemble) and the L* DFAs extracted from them".
 */
export function describeApproaches(ids: ApproachId[]): string {
  const set = new Set<ApproachId>(ids);
  const parts: string[] = [];
  for (const id of ["dfa", "nfa", "min_dfa"] as const) {
    if (set.has(id)) parts.push(id === "dfa" ? "the ground-truth DFA itself" : id === "nfa" ? "the NFA" : "the minimized DFA");
  }
  const ml = PIPELINES.filter((p) => set.has(`ml_${p.id}` as ApproachId));
  const lstar = PIPELINES.filter((p) => set.has(`lstar_${p.id}` as ApproachId));
  const sameModels = ml.length > 0 && ml.length === lstar.length && ml.every((p, i) => lstar[i].id === p.id);

  let mlPhrase = "";
  if (ml.length === PIPELINES.length) mlPhrase = `all ${numberWord(ml.length)} ML pipelines`;
  else if (ml.length === 1) mlPhrase = `the ${SENTENCE_NAME[ml[0].id]} pipeline`;
  else if (ml.length > 1) {
    const names = ml.map((p, i) => (p.id === "stack" && i > 0 ? "the stacked ensemble" : SENTENCE_NAME[p.id]));
    mlPhrase = `${numberWord(ml.length)} ML pipelines (${listJoin(names)})`;
  }

  if (sameModels) {
    parts.push(`${mlPhrase} and the L* ${lstar.length > 1 ? "DFAs" : "DFA"} extracted from ${lstar.length > 1 ? "them" : "it"}`);
  } else {
    if (mlPhrase) parts.push(mlPhrase);
    if (lstar.length) parts.push(`the L* ${lstar.length > 1 ? "DFAs" : "DFA"} extracted from ${listJoin(lstar.map((p) => SOURCE_NAME[p.id]))}`);
  }
  if (set.has("rpni")) parts.push("the DFA learned by RPNI");
  if (set.has("edsm")) parts.push("the DFA learned by EDSM");
  return listJoin(parts);
}

/** One line about the size of an approach's model, from /api/approaches stats. */
export function sizeLine(meta: ApproachMeta, approach: Approach | undefined): string | null {
  const s = approach?.stats;
  if (!s) return null;
  if (meta.kind === "ml") {
    if (s.complexity === undefined) return null;
    const n = int(s.complexity);
    if (meta.pipeline === "lr") return `${n} parameters`;
    if (meta.pipeline === "stack") return `${n} tree nodes and weights`;
    return `${n} tree nodes`;
  }
  if (s.states === undefined) return null;
  const states = `${int(s.states)} ${s.states === 1 ? "state" : "states"}`;
  if (meta.kind === "nfa" && s.epsilon_moves) return `${states}, ${int(s.epsilon_moves)} ε-moves`;
  if (meta.id === "min_dfa" && s.states_before) return `${states}, minimized from ${int(s.states_before)}`;
  if (s.converged === false && s.stop_reason === "max_states") return `${states}, stopped at its state budget`;
  return states;
}

/** The API explains disagreements in plain text; tidy its ASCII dashes and raw identifiers. */
export const tidy = (text: string): string =>
  text
    .replace(/\s-\s/g, " – ")
    .replace(/\s*\(max_states\)/g, "")
    .replace(/P\(accept\)\s*=\s*(\d*\.?\d+)/g, (_, p: string) => `${Math.round(Number(p) * 100)}%`)
    .trim();

/** Reads `meta.state_notes` ("r2" -> "value ≡ 2 (mod 3)") from an automaton payload. */
export function stateNotes(meta: Record<string, unknown> | undefined): Record<string, string> | undefined {
  const raw = meta?.state_notes;
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/** Shortens long strings for headings: 1000110100…11001010. */
export function abbreviate(s: string, keep = 10): string {
  return s.length <= keep * 2 + 1 ? s : `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

// ------------------------------------------------------------------ colour mixing for the WebGL dot grid (hex only)
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

export type { CompareResult };
