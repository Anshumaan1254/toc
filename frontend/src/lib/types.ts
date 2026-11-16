// Types mirroring the FastAPI backend responses (backend/app/services.py, src/automata/*.to_dict).

export type PipelineId = "lr" | "dt" | "rf" | "stack";
export type Family = "truth" | "learned" | "ml";
export type ApproachId =
  | "dfa"
  | "nfa"
  | "min_dfa"
  | "lstar_lr"
  | "lstar_dt"
  | "lstar_rf"
  | "lstar_stack"
  | "rpni"
  | "edsm"
  | "ml_lr"
  | "ml_dt"
  | "ml_rf"
  | "ml_stack";

export interface Language {
  id: string;
  name: string;
  description: string;
  alphabet: string[];
  regex: string;
  family: string;
  difficulty: "easy" | "medium" | "hard";
  expected_min_states: number;
  ml_note: string;
  best_pipeline?: { pipeline: PipelineId; test_f1: number; test_accuracy: number; long_accuracy: number };
}

export interface ApproachStats {
  states?: number;
  states_before?: number;
  transitions?: number;
  epsilon_moves?: number;
  subset_dfa_states?: number;
  test_accuracy?: number;
  long_accuracy?: number;
  test_f1?: number;
  fidelity_test?: number | null;
  equivalent_to_truth?: boolean;
  converged?: boolean | null;
  stop_reason?: string | null;
  membership_queries?: number | null;
  learning_time_s?: number | null;
  complexity?: number;
  train_time_s?: number;
}

export interface Approach {
  id: ApproachId;
  name: string;
  family: Family;
  kind: "dfa" | "nfa" | "ml";
  pipeline?: PipelineId;
  blurb: string;
  stats: ApproachStats;
  available: boolean;
}

export interface DfaPayload {
  kind: "dfa";
  alphabet: string[];
  states: string[];
  start: string;
  accepting: string[];
  transitions: Record<string, Record<string, string>>;
  num_states: number;
  num_transitions: number;
  complete: boolean;
  meta: Record<string, unknown>;
}

export interface NfaPayload {
  kind: "nfa";
  alphabet: string[];
  states: string[];
  start: string[];
  accepting: string[];
  transitions: Record<string, Record<string, string[]>>;
  epsilon: Record<string, string[]>;
  num_states: number;
  num_transitions: number;
  has_epsilon: boolean;
  meta: Record<string, unknown>;
}

export type AutomatonPayload = DfaPayload | NfaPayload;

export interface SubsetStep {
  from: string;
  from_set: string[];
  symbol: string;
  move: string[];
  closure: string[];
  to: string;
  new: boolean;
}

export interface Minimization {
  method: string;
  before: DfaPayload;
  states_before: number;
  states_after: number;
  moore_rounds: string[][][];
  groups: Record<string, string[]>;
  state_map: Record<string, string>;
}

export interface SuffixRow {
  p: string;
  q: string;
  suffix: string;
}

export interface Metrics {
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  balanced_accuracy: number | null;
  confusion: { tn: number; fp: number; fn: number; tp: number };
  roc_auc: number | null;
  inference_time_per_string_s: number;
  fidelity?: number;
}

export interface AutomatonMetrics {
  states: number;
  transitions: number;
  equivalent_to_truth: boolean;
  counterexample_to_truth: string | null;
  test: Metrics;
  long: Metrics;
  inference_time_per_string_s: number;
  membership_queries?: number | null;
  equivalence_queries?: number | null;
  learning_time_s?: number | null;
  converged?: boolean | null;
  stop_reason?: string | null;
  raw_states?: number;
  counterexamples?: number;
  closedness_fixes?: number;
  consistency_fixes?: number;
  pta_states?: number;
  merges?: number;
  promotions?: number;
}

export interface LearningTrace {
  states?: number;
  converged?: boolean;
  stop_reason?: string;
  membership_queries?: number;
  equivalence_queries?: number;
  counterexamples?: string[] | number;
  closedness_fixes?: number;
  consistency_fixes?: number;
  table_shape?: { S: number; S_sigma: number; E: number };
  learning_time_s?: number;
  rounds?: { round: number; states: number | null; S: number; E: number; counterexample: string | null; aborted?: boolean }[];
  eq_strings_tested?: number;
  learner?: string;
  raw_states?: number;
  pta_states?: number;
  merges?: number;
  promotions?: number;
  merge_attempts?: number;
}

export interface AutomatonRecord {
  language: string;
  approach: ApproachId;
  title: string;
  family: "truth" | "learned";
  automaton: AutomatonPayload;
  stats?: Record<string, unknown>;
  subset_construction?: { dfa: DfaPayload; steps: SubsetStep[] };
  minimization?: Minimization;
  distinguishing_suffixes?: SuffixRow[];
  learning?: LearningTrace;
  metrics?: AutomatonMetrics | null;
}

export interface DfaStep {
  index: number;
  symbol: string;
  from: string | null;
  to: string | null;
}

export interface DfaTrace {
  start: string;
  steps: DfaStep[];
  final: string | null;
}

export interface NfaStep {
  index: number;
  symbol: string;
  from: string[];
  move: string[];
  to: string[];
}

export interface NfaTrace {
  initial: string[];
  steps: NfaStep[];
  final: string[];
  accepted: boolean;
}

export interface FeatureValue {
  feature: string;
  value: number;
}

export interface MlExplanation {
  probability: number;
  verdict: boolean;
  active_features: FeatureValue[];
  n_features: number;
  drivers?: { feature: string; value: number; contribution?: number; importance?: number }[];
  logit?: number;
  decision_path?: { feature: string; value: number; threshold: number; goes: "<=" | ">" }[];
  tree_votes?: { accept: number; reject: number };
  base_probabilities?: Record<string, number>;
  meta_weights?: Record<string, number>;
}

export interface ClassifyResult {
  language: string;
  approach: ApproachId;
  name: string;
  family: Family;
  kind: "dfa" | "nfa" | "ml";
  string: string;
  length: number;
  accepted: boolean;
  truth: boolean;
  correct: boolean;
  time_ms: number;
  trace?: DfaTrace | NfaTrace;
  probability?: number;
  confidence?: number;
  ml?: MlExplanation;
}

export interface CompareRow {
  approach: ApproachId;
  name: string;
  family: Family;
  kind?: "dfa" | "nfa" | "ml";
  accepted?: boolean;
  truth?: boolean;
  correct?: boolean;
  time_ms?: number;
  probability?: number;
  final_state?: string | null;
  final_states?: string[];
  available: boolean;
  explanation?: string;
}

export interface CompareResult {
  language: string;
  string: string;
  length: number;
  truth: boolean;
  results: CompareRow[];
  disagreements: ApproachId[];
  longer_than_training: boolean;
}

export type Learner = "rpni" | "edsm" | "ml_lr" | "ml_dt" | "ml_rf";

export interface LearnResult {
  session_id: string;
  learner: Learner;
  alphabet: string[];
  samples: number;
  positives: number;
  negatives: number;
  automaton: DfaPayload;
  states: number;
  minimized_from?: number | null;
  fits_samples: number;
  learn_time_ms: number;
  stats: Record<string, number | string | boolean>;
  ml_training_accuracy: Record<string, number>;
  distinguishing_suffixes: SuffixRow[];
  warnings: string[];
}

export interface LearnClassifyResult {
  string: string;
  accepted: boolean;
  trace: DfaTrace;
  time_ms: number;
  ml: Record<string, { name: string; probability: number; accepted: boolean; time_ms: number }>;
  agreement: number;
}

export interface MlSummary {
  val: Metrics;
  test: Metrics;
  long: Metrics;
  generalization_drop: number;
  train_time_s: number;
  inference_time_per_string_s: number;
  complexity: { type: string; size: number; [k: string]: unknown };
  best_params: Record<string, unknown>;
}

export interface AutomatonSummary {
  states: number;
  transitions: number;
  equivalent_to_truth: boolean;
  converged?: boolean | null;
  stop_reason?: string | null;
  membership_queries?: number | null;
  learning_time_s?: number | null;
  inference_time_per_string_s: number;
  test_accuracy: number;
  long_accuracy: number;
  fidelity_test?: number | null;
  fidelity_long?: number | null;
}

export interface ComparisonOverallRow {
  family: string;
  approach: string;
  test_accuracy: number;
  long_accuracy: number;
  generalization_drop: number;
  mean_size: number;
  size_unit: string;
  inference_us_per_string: number;
  build_time_s: number | null;
  exact_languages: number;
}

export interface SampleEfficiencyRow {
  language: string;
  fraction: number;
  n_train: number;
  approach: "rpni" | "edsm" | "lr" | "dt" | "rf";
  split: "test" | "long";
  accuracy: number;
  states: number | null;
}

export interface Summary {
  meta: {
    seed: number;
    python: string;
    sklearn: string;
    dataset_rows: number;
    split_sizes: Record<string, number>;
    feature_count_binary: number;
    extraction_config: Record<string, unknown>;
    max_train_length: number;
  };
  languages: (Language & { truth: Record<string, number | boolean> })[];
  pipelines: { id: PipelineId; name: string; color: string }[];
  approaches: { id: string; name: string; family: string; description: string }[];
  summary: {
    pipeline_averages: Record<"val" | "test" | "long", Record<PipelineId, { accuracy: number; precision: number; recall: number; f1: number }>>;
    best_pipeline_per_language: Record<string, { pipeline: PipelineId; test_f1: number; test_accuracy: number; long_accuracy: number }>;
    comparison: Record<string, unknown>[];
    comparison_overall: ComparisonOverallRow[];
    insights: string[];
  };
  ml: Record<string, Record<PipelineId, MlSummary>>;
  automata: Record<string, Record<string, AutomatonSummary>>;
  sample_efficiency: SampleEfficiencyRow[];
}

export interface ModelDetail {
  language: string;
  pipeline: PipelineId;
  name: string;
  metrics: { val: Metrics; test: Metrics; long: Metrics };
  best_params: Record<string, unknown>;
  tuning: { params: Record<string, unknown>; val_f1: number; val_accuracy: number; fit_seconds: number; complexity: number }[];
  train_time_s: number;
  inference_time_per_string_s: number;
  single_string_latency_s?: number;
  generalization_drop: number;
  complexity: { type: string; size: number; [k: string]: unknown };
  explanation: ModelExplanation | null;
  extracted_dfa: { approach: ApproachId } & Partial<AutomatonMetrics>;
}

export interface TreeNode {
  id: number;
  samples: number;
  p_accept: number;
  prediction: 0 | 1;
  leaf?: boolean;
  truncated?: boolean;
  feature?: string;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

export interface ModelExplanation {
  type: "logistic_regression" | "decision_tree" | "random_forest" | "stacking";
  intercept?: number;
  nonzero?: number;
  top_coefficients?: FeatureValue[];
  top_importances?: (FeatureValue & { std?: number })[];
  tree?: TreeNode;
  depth?: number;
  nodes?: number;
  leaves?: number;
  trees?: number;
  meta_intercept?: number;
  meta_weights?: { base_learner: string; weight: number }[];
  base_learners?: Record<string, { type: string; top_coefficients?: FeatureValue[]; top_importances?: FeatureValue[] }>;
  note?: string;
}
