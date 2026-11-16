import type { ApproachId, Family, PipelineId } from "./types";

export const PIPELINES: { id: PipelineId; name: string; short: string; color: string }[] = [
  { id: "lr", name: "Logistic Regression", short: "LR", color: "var(--series-lr)" },
  { id: "dt", name: "Decision Tree", short: "DT", color: "var(--series-dt)" },
  { id: "rf", name: "Random Forest", short: "RF", color: "var(--series-rf)" },
  { id: "stack", name: "Stacked ensemble", short: "Stack", color: "var(--series-stack)" },
];

export const PIPELINE_BY_ID = Object.fromEntries(PIPELINES.map((p) => [p.id, p])) as Record<PipelineId, (typeof PIPELINES)[number]>;

export interface ApproachMeta {
  id: ApproachId;
  name: string;
  short: string;
  family: Family;
  kind: "dfa" | "nfa" | "ml";
  pipeline?: PipelineId;
  color: string;
}

export const APPROACHES: ApproachMeta[] = [
  { id: "dfa", name: "Ground-truth DFA", short: "DFA", family: "truth", kind: "dfa", color: "var(--series-truth)" },
  { id: "nfa", name: "NFA", short: "NFA", family: "truth", kind: "nfa", color: "var(--series-truth)" },
  { id: "min_dfa", name: "Minimized DFA", short: "Min DFA", family: "truth", kind: "dfa", color: "var(--series-truth)" },
  { id: "lstar_lr", name: "L* DFA from Logistic Regression", short: "L*·LR", family: "learned", kind: "dfa", pipeline: "lr", color: "var(--series-lr)" },
  { id: "lstar_dt", name: "L* DFA from Decision Tree", short: "L*·DT", family: "learned", kind: "dfa", pipeline: "dt", color: "var(--series-dt)" },
  { id: "lstar_rf", name: "L* DFA from Random Forest", short: "L*·RF", family: "learned", kind: "dfa", pipeline: "rf", color: "var(--series-rf)" },
  { id: "lstar_stack", name: "L* DFA from Stacked ensemble", short: "L*·Stack", family: "learned", kind: "dfa", pipeline: "stack", color: "var(--series-stack)" },
  { id: "rpni", name: "Passive DFA (RPNI)", short: "RPNI", family: "learned", kind: "dfa", color: "var(--series-rpni)" },
  { id: "edsm", name: "Passive DFA (EDSM)", short: "EDSM", family: "learned", kind: "dfa", color: "var(--series-edsm)" },
  { id: "ml_lr", name: "Logistic Regression", short: "LR", family: "ml", kind: "ml", pipeline: "lr", color: "var(--series-lr)" },
  { id: "ml_dt", name: "Decision Tree", short: "DT", family: "ml", kind: "ml", pipeline: "dt", color: "var(--series-dt)" },
  { id: "ml_rf", name: "Random Forest", short: "RF", family: "ml", kind: "ml", pipeline: "rf", color: "var(--series-rf)" },
  { id: "ml_stack", name: "Stacked ensemble", short: "Stack", family: "ml", kind: "ml", pipeline: "stack", color: "var(--series-stack)" },
];

export const APPROACH_BY_ID = Object.fromEntries(APPROACHES.map((a) => [a.id, a])) as Record<ApproachId, ApproachMeta>;

export const FAMILIES: Record<Family, { name: string; description: string }> = {
  truth: { name: "Ground truth", description: "Automata built by hand or by exact constructions. Correct by proof." },
  learned: { name: "Learned automata", description: "DFAs inferred from data (RPNI, EDSM) or extracted from a trained model with L*." },
  ml: { name: "ML pipelines", description: "Classifiers trained on 124 generic string features." },
};

export const isApproachId = (v: string | undefined): v is ApproachId => !!v && v in APPROACH_BY_ID;

// ------------------------------------------------------------------ formatting
export const pct = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(digits)}%`;

export const fixed = (v: number | null | undefined, digits = 3): string =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : v.toFixed(digits);

export const int = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : Math.round(v).toLocaleString("en-US");

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "–";
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(1)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(seconds < 0.01 ? 2 : 1)} ms`;
  return `${seconds.toFixed(2)} s`;
}

/** Display form of a string over the alphabet; the empty string is ε. */
export const showString = (s: string): string => (s === "" ? "ε" : s);
