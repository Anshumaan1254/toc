import type { ModelExplanation } from "@/lib/types";

/**
 * Features ranked by how much the model relies on them: |coefficient| for logistic regression, impurity
 * importance for trees and forests; for the stack, each base learner's list is scaled to its own maximum
 * and a feature keeps its best score.
 */
export function featureWeights(e: ModelExplanation | null): { feature: string; weight: number }[] {
  if (!e) return [];
  const rank = (list: { feature: string; value: number }[] | undefined, abs: boolean) =>
    (list ?? []).map((f) => ({ feature: f.feature, weight: abs ? Math.abs(f.value) : f.value }));
  let out: { feature: string; weight: number }[] = [];
  if (e.type === "logistic_regression") out = rank(e.top_coefficients, true);
  else if (e.type === "decision_tree" || e.type === "random_forest") out = rank(e.top_importances, false);
  else if (e.type === "stacking") {
    const best = new Map<string, number>();
    for (const learner of Object.values(e.base_learners ?? {})) {
      const list = learner.top_coefficients ? rank(learner.top_coefficients, true) : rank(learner.top_importances, false);
      const max = Math.max(...list.map((f) => f.weight), 1e-12);
      for (const f of list) best.set(f.feature, Math.max(best.get(f.feature) ?? 0, f.weight / max));
    }
    out = [...best.entries()].map(([feature, weight]) => ({ feature, weight }));
  }
  return out.filter((f) => f.weight > 0).sort((a, b) => b.weight - a.weight);
}
