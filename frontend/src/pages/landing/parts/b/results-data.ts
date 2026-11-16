import { PIPELINES } from "@/lib/meta";
import type { ComparisonOverallRow, PipelineId, Summary } from "@/lib/types";

export const LSTAR_IDS = ["lstar_lr", "lstar_dt", "lstar_rf", "lstar_stack"] as const;
export type LStarId = (typeof LSTAR_IDS)[number];
export const LSTAR_PIPELINE: Record<LStarId, PipelineId> = { lstar_lr: "lr", lstar_dt: "dt", lstar_rf: "rf", lstar_stack: "stack" };

/** Every headline number on the page, derived from /api/summary (nothing hard-coded). */
export function derive(summary: Summary) {
  const langs = summary.languages.map((l) => l.id);
  const nameOf = (id: string) => summary.languages.find((l) => l.id === id)?.name ?? id;

  let lstarTotal = 0;
  let lstarExact = 0;
  let lstarConvergedExact = 0;
  let lstarBudgetExact = 0;
  const convergedWrong: { language: string; approach: LStarId }[] = [];
  for (const L of langs)
    for (const a of LSTAR_IDS) {
      const r = summary.automata[L]?.[a];
      if (!r) continue;
      lstarTotal += 1;
      if (r.equivalent_to_truth) {
        lstarExact += 1;
        if (r.converged) lstarConvergedExact += 1;
        else lstarBudgetExact += 1;
      } else if (r.converged) convergedWrong.push({ language: L, approach: a });
    }
  const edsmExact = langs.filter((L) => summary.automata[L]?.edsm?.equivalent_to_truth).length;
  const rpniExact = langs.filter((L) => summary.automata[L]?.rpni?.equivalent_to_truth).length;

  const avg = summary.summary.pipeline_averages;
  const byTest = [...PIPELINES].sort((a, b) => avg.test[b.id].accuracy - avg.test[a.id].accuracy);
  const best = byTest[0];
  const worst = byTest[byTest.length - 1];
  const longAcc = PIPELINES.map((p) => avg.long[p.id].accuracy);

  // the language the models find hardest: lowest best-of-pipelines accuracy on long strings
  const hardest = langs
    .map((L) => {
      const per = summary.ml[L];
      const top = PIPELINES.reduce((m, p) => (per?.[p.id] && per[p.id].long.accuracy > m.acc ? { p: p.id, acc: per[p.id].long.accuracy } : m), {
        p: "lr" as PipelineId,
        acc: -1,
      });
      return { language: L, pipeline: top.p, longAccuracy: top.acc };
    })
    .sort((a, b) => a.longAccuracy - b.longAccuracy)[0];

  const co = summary.summary.comparison_overall;
  const truth = co.find((r) => r.family === "ground truth");
  const forest = co.find((r) => r.family === "ML pipeline" && r.approach === "Random Forest") ?? biggest(co.filter((r) => r.family === "ML pipeline"));

  const truthStates = summary.languages.map((l) => Number(l.truth?.["DFA states"])).filter((n) => Number.isFinite(n));

  return {
    langs,
    nameOf,
    lstar: { total: lstarTotal, exact: lstarExact, convergedExact: lstarConvergedExact, budgetExact: lstarBudgetExact, convergedWrong },
    edsmExact,
    rpniExact,
    best: { ...best, accuracy: avg.test[best.id].accuracy },
    worst: { ...worst, accuracy: avg.test[worst.id].accuracy },
    longRange: [Math.min(...longAcc), Math.max(...longAcc)] as const,
    testRange: [avg.test[worst.id].accuracy, avg.test[best.id].accuracy] as const,
    hardest: hardest ? { ...hardest, name: nameOf(hardest.language), note: summary.languages.find((l) => l.id === hardest.language)?.ml_note ?? "" } : null,
    truth,
    forest,
    truthStates: truthStates.length ? ([Math.min(...truthStates), Math.max(...truthStates)] as const) : null,
    languagesCount: langs.length,
  };
}

function biggest(rows: ComparisonOverallRow[]): ComparisonOverallRow | undefined {
  return rows.reduce<ComparisonOverallRow | undefined>((m, r) => (!m || r.mean_size > m.mean_size ? r : m), undefined);
}

export type Derived = ReturnType<typeof derive>;

/** "97.6" style percentage text (no % sign). */
export const pctNum = (v: number, digits = 1) => Number((v * 100).toFixed(digits));

/** Microseconds with sensible precision. */
export const micro = (us: number) => (us < 1 ? us.toFixed(2) : us < 10 ? us.toFixed(1) : us.toFixed(1));
