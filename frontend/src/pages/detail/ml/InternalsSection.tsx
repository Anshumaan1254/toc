import { useMemo, type ReactNode } from "react";
import { fixed, int, PIPELINE_BY_ID, pct } from "@/lib/meta";
import type { ClassifyResult, FeatureValue, Language, ModelDetail, PipelineId } from "@/lib/types";
import { ChartFrame } from "@/components/charts/Charts";
import { Term } from "@/components/ui/Term";
import { BarRows, type BarDatum } from "./BarRows";
import { describeFeature } from "./features";
import { SectionHeading } from "./SectionHeading";
import { TreeExplorer } from "./TreeExplorer";

function Fact({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="font-display text-3xl font-semibold leading-none text-ink">{value}</div>
      <div className="mt-1.5 text-sm text-ink-2">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const featureRow = (f: FeatureValue & { std?: number }, color: string, active: Set<string> | null, display: string): BarDatum => ({
  key: f.feature,
  label: describeFeature(f.feature).label,
  code: f.feature,
  value: f.value,
  display,
  color,
  whisker: f.std !== undefined ? [f.value - f.std, f.value + f.std] : undefined,
  flag: active?.has(f.feature) ? "non-zero for your last string" : undefined,
});

function FlagLegend({ run }: { run: ClassifyResult | null }) {
  if (!run) return null;
  return (
    <p className="mt-4 flex items-center gap-2 text-xs text-muted">
      <span className="inline-block h-2 w-2 rounded-full bg-lamp shadow-[0_0_6px_var(--lamp)]" aria-hidden />
      non-zero for your last string, <span className="font-mono text-ink-2">{run.string.length > 24 ? `${run.string.slice(0, 23)}…` : run.string || "ε"}</span>
    </p>
  );
}

const tableOf = (list: (FeatureValue & { std?: number })[], valueName: string, fmt: (v: number) => string) => ({
  columns: ["feature", "meaning", valueName, ...(list.some((f) => f.std !== undefined) ? ["± std across trees"] : [])],
  rows: list.map((f) => [f.feature, describeFeature(f.feature).label, fmt(f.value), ...(f.std !== undefined ? [fmt(f.std)] : [])]),
});

// ------------------------------------------------------------------ logistic regression
function LrInternals({ model, active, lastRun }: { model: ModelDetail; active: Set<string> | null; lastRun: ClassifyResult | null }) {
  const e = model.explanation!;
  const coefs = [...(e.top_coefficients ?? [])].sort((a, b) => b.value - a.value);
  const total = typeof model.complexity.features === "number" ? model.complexity.features : null;
  const l1 = model.best_params.l1_ratio;
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <ChartFrame
        title="The weights"
        subtitle="Positive weights push a string towards accept, negative ones towards reject. Weights apply to standardized features."
        table={tableOf(coefs, "weight", (v) => fixed(v, 3))}
      >
        <BarRows
          signed
          ariaLabel="Logistic regression weights, largest first"
          rows={coefs.map((f) => featureRow(f, f.value >= 0 ? "var(--accept)" : "var(--reject)", active, `${f.value >= 0 ? "+" : "−"}${Math.abs(f.value).toFixed(2)}`))}
        />
        <FlagLegend run={lastRun} />
      </ChartFrame>
      <div className="space-y-6">
        <Fact
          value={total !== null ? `${e.nonzero ?? "–"} of ${total}` : (e.nonzero ?? "–")}
          label="features with a non-zero weight"
          hint={typeof l1 === "number" && l1 > 0 ? "The L1 penalty pushes useless weights to exactly zero." : undefined}
        />
        <Fact value={e.intercept !== undefined ? `${e.intercept >= 0 ? "+" : "−"}${Math.abs(e.intercept).toFixed(2)}` : "–"} label="bias, the score of an average string" />
        <p className="text-sm leading-relaxed text-ink-2">
          A linear model can only add evidence up: “more of this, more likely”. It cannot express an interaction such as “the numbers of a’s and b’s agree
          modulo 3”, which is why logistic regression fails L10.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ decision tree
function DtInternals({ model, active, lastRun }: { model: ModelDetail; active: Set<string> | null; lastRun: ClassifyResult | null }) {
  const e = model.explanation!;
  const imps = e.top_importances ?? [];
  const path = lastRun?.ml?.decision_path ?? null;
  return (
    <div className="space-y-14">
      <div className="grid gap-6 sm:grid-cols-3">
        <Fact
          value={int(e.depth ?? (model.complexity.depth as number | undefined))}
          label={(e.depth ?? model.complexity.depth) === 1 ? "level deep" : "levels deep"}
          hint="the longest chain of questions"
        />
        <Fact value={int(e.nodes ?? model.complexity.size)} label="nodes" />
        <Fact value={int(e.leaves ?? (model.complexity.leaves as number | undefined))} label="leaves, each one a verdict" />
      </div>
      {e.tree ? (
        <TreeExplorer tree={e.tree} path={path} pathString={lastRun?.string ?? null} totalDepth={e.depth} />
      ) : (
        <p className="text-sm text-ink-2">The server did not send the tree structure.</p>
      )}
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ChartFrame
          title="Which questions matter"
          subtitle="How much each feature’s splits purify the training strings, summed over the whole tree. All importances add up to 100%."
          table={tableOf(imps, "importance", (v) => pct(v))}
        >
          <BarRows ariaLabel="Decision tree feature importances" rows={imps.slice(0, 12).map((f) => featureRow(f, "var(--series-dt)", active, pct(f.value)))} />
          <FlagLegend run={lastRun} />
        </ChartFrame>
        <div className="space-y-4 text-sm leading-relaxed text-ink-2 lg:pt-14">
          <p>
            An importance says where the tree spends its questions, not which answer leads to accept. The same feature can send strings left at one node and
            right at another.
          </p>
          {model.metrics.long.accuracy >= 0.99 ? (
            <p>
              Here the features it asks about describe the language directly, so its questions keep giving the right answer on strings of any length.
            </p>
          ) : (
            <p>
              The tree can only ask about features that exist. When the language needs something no feature measures, it stitches together many small
              questions that fit the training strings and stop fitting once the strings get longer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ random forest
function RfInternals({ model, active, lastRun }: { model: ModelDetail; active: Set<string> | null; lastRun: ClassifyResult | null }) {
  const e = model.explanation!;
  const imps = e.top_importances ?? [];
  const c = model.complexity;
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <ChartFrame
        title="Which features the forest relies on"
        subtitle="Mean importance across the trees; the whisker spans one standard deviation, so a long whisker means the trees disagree about a feature."
        table={tableOf(imps, "importance", (v) => pct(v))}
      >
        <BarRows ariaLabel="Random forest feature importances with spread across trees" rows={imps.slice(0, 14).map((f) => featureRow(f, "var(--series-rf)", active, pct(f.value)))} />
        <FlagLegend run={lastRun} />
      </ChartFrame>
      <div className="space-y-6">
        <Fact value={int(e.trees ?? (c.trees as number | undefined))} label="trees" hint="each grown on a bootstrap resample of the training strings" />
        <Fact value={int((c.total_nodes as number | undefined) ?? c.size)} label="nodes in total" />
        <Fact value={typeof c.mean_depth === "number" ? c.mean_depth.toFixed(1) : "–"} label="mean depth of a tree" hint={typeof c.max_depth === "number" ? `capped at ${c.max_depth}` : undefined} />
        <p className="text-sm leading-relaxed text-ink-2">
          Importances have no sign: a forest can use the same feature to push one string up and another down. They show what the forest looks at, not which way
          it leans.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stacking
function StackInternals({ model, active, lastRun }: { model: ModelDetail; active: Set<string> | null; lastRun: ClassifyResult | null }) {
  const e = model.explanation!;
  const weights = e.meta_weights ?? [];
  const learners = e.base_learners ?? {};
  const ids = Object.keys(learners).filter((id): id is PipelineId => id in PIPELINE_BY_ID);
  return (
    <div className="space-y-14">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartFrame
          title="How much the meta-learner trusts each model"
          subtitle={
            <>
              Weights of the final logistic regression on the base models’ probabilities, learned from <Term k="out-of-fold">out-of-fold predictions</Term>.
            </>
          }
          table={{ columns: ["base model", "weight"], rows: weights.map((w) => [PIPELINE_BY_ID[w.base_learner as PipelineId]?.name ?? w.base_learner, fixed(w.weight, 3)]) }}
        >
          <BarRows
            signed={weights.some((w) => w.weight < 0)}
            ariaLabel="Meta-learner weight per base model"
            rows={weights.map((w) => ({
              key: w.base_learner,
              label: PIPELINE_BY_ID[w.base_learner as PipelineId]?.name ?? w.base_learner,
              value: w.weight,
              display: w.weight.toFixed(2),
              color: PIPELINE_BY_ID[w.base_learner as PipelineId]?.color ?? "var(--series-truth)",
            }))}
          />
        </ChartFrame>
        <div className="space-y-6">
          <Fact value={e.meta_intercept !== undefined ? `${e.meta_intercept >= 0 ? "+" : "−"}${Math.abs(e.meta_intercept).toFixed(2)}` : "–"} label="meta-learner bias" />
          <p className="text-sm leading-relaxed text-ink-2">
            <Term k="stacking">Stacking</Term> helps when the base models make different mistakes. When all three fail on the same strings, as on long
            inputs for counting languages, there is nothing for the meta-learner to fix.
          </p>
        </div>
      </div>
      <div>
        <h3 className="font-display text-xl font-semibold text-ink">What each base model looks at</h3>
        <div className="mt-6 grid gap-10 md:grid-cols-3">
          {ids.map((id) => {
            const l = learners[id];
            const list = l.top_coefficients ?? l.top_importances ?? [];
            const isLr = !!l.top_coefficients;
            const color = PIPELINE_BY_ID[id].color;
            return (
              <div key={id}>
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
                  {PIPELINE_BY_ID[id].name}
                  <span className="font-normal text-muted">{isLr ? "weights" : "importances"}</span>
                </p>
                <BarRows
                  dense
                  signed={isLr && list.some((f) => f.value < 0)}
                  ariaLabel={`${PIPELINE_BY_ID[id].name} inside the stack: top features`}
                  rows={list.slice(0, 6).map((f) => featureRow(f, isLr ? (f.value >= 0 ? "var(--accept)" : "var(--reject)") : color, active, isLr ? f.value.toFixed(2) : pct(f.value, 0)))}
                />
              </div>
            );
          })}
        </div>
        <FlagLegend run={lastRun} />
      </div>
    </div>
  );
}

export function InternalsSection({ model, language, lastRun }: { model: ModelDetail; language: Language; lastRun: ClassifyResult | null }) {
  const active = useMemo(() => (lastRun?.ml ? new Set(lastRun.ml.active_features.map((f) => f.feature)) : null), [lastRun]);
  const e = model.explanation;
  const lede: Record<string, ReactNode> = {
    logistic_regression: (
      <>
        Logistic regression gives every feature one weight. A string’s score is its features times their weights plus a bias; the sigmoid turns the score into a
        probability. Here are the weights that matter most for {language.id}.
      </>
    ),
    decision_tree: (
      <>
        The tree learned which question to ask first, which next, and so on, by picking at each node the split that best separates the training strings in{" "}
        {language.id} from the rest. Open its branches below.
      </>
    ),
    random_forest: (
      <>
        A random forest is many decision trees, each trained on a resampled set of strings and a random subset of features, then averaged. No single tree
        explains it, so we look at which features the trees use most.
      </>
    ),
    stacking: (
      <>
        The stack runs logistic regression, a decision tree and a random forest side by side, then lets a small logistic regression decide how far to trust
        each one.
      </>
    ),
  };
  return (
    <section aria-labelledby="ml-internals" className="space-y-12">
      <SectionHeading id="ml-internals" title="What the model looks at" lede={e ? lede[e.type] : "This model did not export an explanation."} />
      {!e ? null : e.type === "logistic_regression" ? (
        <LrInternals model={model} active={active} lastRun={lastRun} />
      ) : e.type === "decision_tree" ? (
        <DtInternals model={model} active={active} lastRun={lastRun} />
      ) : e.type === "random_forest" ? (
        <RfInternals model={model} active={active} lastRun={lastRun} />
      ) : (
        <StackInternals model={model} active={active} lastRun={lastRun} />
      )}
    </section>
  );
}
