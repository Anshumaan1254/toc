import { useState, type ReactNode } from "react";
import CountUp from "@/components/reactbits/CountUp";
import { duration, fixed, int, PIPELINE_BY_ID, pct } from "@/lib/meta";
import type { Language, Metrics, ModelDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfusionMatrix } from "@/components/charts/Charts";
import { Badge, Segmented } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { LengthRuler } from "./LengthRuler";
import { SectionHeading } from "./SectionHeading";

type SplitId = "val" | "test" | "long";

const SPLITS: { id: SplitId; name: string; lengths: string; note: string }[] = [
  { id: "val", name: "Validation", lengths: "lengths 0–20", note: "used to pick the settings" },
  { id: "test", name: "Test", lengths: "lengths 0–20", note: "never seen during training" },
  { id: "long", name: "Long strings", lengths: "lengths 21–40", note: "longer than anything trained on" },
];

const ROWS: { key: keyof Metrics; label: string; hint: string }[] = [
  { key: "accuracy", label: "Accuracy", hint: "share of strings classified correctly" },
  { key: "precision", label: "Precision", hint: "of the strings it accepted, how many are in the language" },
  { key: "recall", label: "Recall", hint: "of the strings in the language, how many it accepted" },
  { key: "f1", label: "F1", hint: "balance of precision and recall" },
  { key: "roc_auc", label: "ROC-AUC", hint: "how well its probabilities rank members above non-members" },
];

function SplitTable({ model }: { model: ModelDetail }) {
  const m = model.metrics;
  return (
    <div className="relative">
      <table className="w-full table-fixed text-left">
        <caption className="sr-only">Validation, test and long-string metrics</caption>
        <thead>
          <tr className="align-bottom">
            <th className="w-[24%] pb-4 text-sm font-normal text-muted sm:w-[34%]">
              <span className="sr-only">metric</span>
            </th>
            {SPLITS.map((s) => (
              <th key={s.id} scope="col" className="pb-4 pl-2 align-bottom font-normal sm:pl-4">
                <span className="block font-display text-[15px] font-semibold leading-tight text-ink sm:text-lg">
                  <span className="sm:hidden">{s.id === "long" ? "Long" : s.name}</span>
                  <span className="hidden sm:inline">{s.name}</span>
                </span>
                <span className="block text-[11px] text-ink-2 sm:text-xs">{s.lengths}</span>
                <span className="hidden text-xs text-ink-2 sm:block">{int(m[s.id].n)} strings</span>
                <span className="hidden text-xs text-muted sm:block">{s.note}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={r.key} className="border-t border-line">
              <th scope="row" className="py-3 pr-2 font-normal sm:pr-4">
                <span className="block text-sm text-ink">{r.label}</span>
                <span className="hidden text-xs text-muted sm:block">{r.hint}</span>
              </th>
              {SPLITS.map((s) => {
                const v = m[s.id][r.key] as number | null;
                const worse = s.id === "long" && v !== null && (m.test[r.key] as number | null) !== null && v < (m.test[r.key] as number) - 0.05;
                return (
                  <td key={s.id} className="py-3 pl-2 sm:pl-4">
                    {i === 0 ? (
                      <span className={cn("font-display text-[22px] font-semibold leading-none sm:text-4xl", worse ? "text-reject" : "text-ink")}>
                        {v === null ? "–" : <CountUp to={Number((v * 100).toFixed(1))} decimals={1} suffix="%" duration={1.1} />}
                      </span>
                    ) : (
                      <span className={cn("tabular font-mono text-[13px] sm:text-[15px]", worse ? "text-reject" : "text-ink")}>{v === null ? "–" : pct(v)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Long-string values more than 5 points below the test value are shown in coral.</p>
    </div>
  );
}

function Confusion({ model, language }: { model: ModelDetail; language: Language }) {
  const [split, setSplit] = useState<"test" | "long">("test");
  const cm = model.metrics[split].confusion;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-semibold text-ink">Where the mistakes are</h3>
          <p className="mt-1 max-w-md text-sm text-ink-2">
            Rows are the truth, columns what the model said. A false accept lets in a string outside {language.id}; a false reject turns away a member.
          </p>
        </div>
        <Segmented<"test" | "long">
          label="Which strings"
          value={split}
          onChange={setSplit}
          options={[
            { value: "test", label: "Test, 0–20" },
            { value: "long", label: "Long, 21–40" },
          ]}
        />
      </div>
      <ConfusionMatrix cm={cm} />
      <p className="mt-3 text-sm text-ink-2">
        {cm.fp + cm.fn === 0 ? (
          <>No mistakes on these {int(cm.tn + cm.fp + cm.fn + cm.tp)} strings.</>
        ) : (
          <>
            {int(cm.fp + cm.fn)} mistakes out of {int(cm.tn + cm.fp + cm.fn + cm.tp)}:{" "}
            {cm.fp > cm.fn * 1.5 ? "mostly false accepts, so it is too generous." : cm.fn > cm.fp * 1.5 ? "mostly false rejects, so it is too strict." : "false accepts and false rejects in similar numbers."}
          </>
        )}
      </p>
    </div>
  );
}

function sizeOf(model: ModelDetail): { value: string; label: string; hint?: string } {
  const c = model.complexity;
  const num = (k: string) => (typeof c[k] === "number" ? (c[k] as number) : undefined);
  switch (c.type) {
    case "logistic_regression":
      return { value: int(num("nonzero_coefficients") ?? c.size), label: "non-zero weights", hint: num("features") ? `out of ${num("features")} features, plus a bias` : undefined };
    case "decision_tree":
      return { value: int(num("nodes") ?? c.size), label: "tree nodes", hint: num("depth") ? `${num("depth")} levels, ${int(num("leaves"))} leaves` : undefined };
    case "random_forest":
      return { value: int(num("total_nodes") ?? c.size), label: "nodes across the forest", hint: num("trees") ? `${num("trees")} trees` : undefined };
    case "stacking":
      return { value: int(c.size), label: "parameters and nodes in total", hint: "three base models and a meta-learner" };
    default:
      return { value: int(c.size), label: "model size" };
  }
}

function Cost({ model }: { model: ModelDetail }) {
  const size = sizeOf(model);
  const dfa = model.extracted_dfa;
  const items: { label: ReactNode; value: string; hint?: ReactNode }[] = [
    { label: "to train (the chosen settings)", value: duration(model.train_time_s) },
    { label: "per string, in a batch", value: duration(model.inference_time_per_string_s), hint: "features plus prediction, averaged over the test set" },
    ...(model.single_string_latency_s !== undefined
      ? [{ label: "for one string on its own", value: duration(model.single_string_latency_s), hint: "what a single request costs, overheads included" }]
      : []),
    { label: size.label, value: size.value, hint: size.hint },
  ];
  return (
    <div>
      <h3 className="font-display text-2xl font-semibold text-ink">What it costs</h3>
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-8">
        {items.map((it, i) => (
          <div key={i} className="border-t border-line pt-3">
            <div className="font-display text-3xl font-semibold leading-none text-ink">{it.value}</div>
            <div className="mt-1.5 text-sm text-ink-2">{it.label}</div>
            {it.hint && <div className="mt-0.5 text-xs text-muted">{it.hint}</div>}
          </div>
        ))}
      </div>
      {dfa.states !== undefined && (
        <p className="mt-6 max-w-3xl text-sm text-ink-2">
          For comparison, the DFA extracted from this model (below) has {dfa.states} states and {dfa.transitions ?? "–"} transitions and classifies a string in{" "}
          {duration(dfa.inference_time_per_string_s ?? null)}: it just follows one arrow per symbol.
        </p>
      )}
    </div>
  );
}

const sameParams = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
};

const PARAM_NAMES: Record<string, string> = {
  C: "C (inverse penalty)",
  l1_ratio: "L1 share of the penalty",
  max_depth: "max depth",
  min_samples_leaf: "min strings per leaf",
  n_estimators: "trees",
  final_C: "meta-learner C",
};

const showParam = (v: unknown): string => {
  if (v === null || v === undefined) return "unlimited";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
};

function Tuning({ model }: { model: ModelDetail }) {
  const keys = [...new Set(model.tuning.flatMap((t) => Object.keys(t.params)))];
  const maxF1 = Math.max(...model.tuning.map((t) => t.val_f1), 1e-9);
  const color = PIPELINE_BY_ID[model.pipeline]?.color ?? "var(--series-truth)";
  return (
    <div>
      <h3 className="font-display text-2xl font-semibold text-ink">How the settings were chosen</h3>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Every combination below was trained on the training strings and scored on the validation strings. The winner has the best validation F1; ties go to the
        higher accuracy, then to the smaller model.
      </p>
      <div className="relative mt-6 overflow-x-auto rounded-2xl border border-line" data-lenis-prevent>
        <table className="tabular w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Hyper-parameter search on the validation set</caption>
          <thead className="bg-panel-2/60 text-ink-2">
            <tr>
              {keys.map((k) => (
                <th key={k} scope="col" className="px-4 py-2.5 font-medium">
                  {PARAM_NAMES[k] ?? k}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 font-medium">
                validation F1
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                validation accuracy
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                fit time
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                size
              </th>
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">chosen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {model.tuning.map((t, i) => {
              const win = sameParams(t.params, model.best_params);
              return (
                <tr key={i} className={cn("border-t border-line", win && "bg-lamp-soft")}>
                  {keys.map((k) => (
                    <td key={k} className="px-4 py-2 font-mono text-ink">
                      {showParam(t.params[k])}
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-ink">{fixed(t.val_f1, 3)}</span>
                      <span className="relative hidden h-1.5 w-20 rounded-full bg-panel-2 sm:block" aria-hidden>
                        <span className="absolute inset-y-0 left-0 rounded-r-[3px]" style={{ width: `${(t.val_f1 / maxF1) * 100}%`, background: color }} />
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-ink">{pct(t.val_accuracy)}</td>
                  <td className="px-4 py-2 font-mono text-ink-2">{duration(t.fit_seconds)}</td>
                  <td className="px-4 py-2 font-mono text-ink-2">{int(t.complexity)}</td>
                  <td className="px-4 py-2 text-right">{win && <Badge tone="lamp">chosen</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PerformanceSection({ model, language }: { model: ModelDetail; language: Language }) {
  return (
    <section aria-labelledby="ml-performance" className="space-y-12">
      <SectionHeading
        id="ml-performance"
        title="How well it does"
        lede={
          <>
            Accuracy on strings like the ones it trained on is only half the story. The real test of whether a model learned {language.id} is{" "}
            <Term k="generalization">longer strings</Term>.
          </>
        }
      />
      <LengthRuler model={model} language={language} />
      <div className="space-y-20 pt-6">
        <SplitTable model={model} />
        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Confusion model={model} language={language} />
          <div className="space-y-16">
            <Cost model={model} />
          </div>
        </div>
        <Tuning model={model} />
      </div>
    </section>
  );
}
