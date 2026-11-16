import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CornerDownLeft, CornerDownRight } from "lucide-react";
import { PIPELINE_BY_ID, pct } from "@/lib/meta";
import type { ClassifyResult, Language, ModelDetail, PipelineId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeFeature, featureFill, formatFeatureValue, splitQuestion } from "./features";
import { atLeast, type Phase } from "./useRunSequence";
import { featureWeights } from "./weights";

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

function Heading({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-xl font-semibold text-ink">{children}</h3>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ left: the features the model leans on, for this string
function SeenFeatures({ model, result, phase }: { model: ModelDetail; result: ClassifyResult | null; phase: Phase }) {
  const reduce = useReducedMotion();
  const values = useMemo(() => new Map((result?.ml?.active_features ?? []).map((f) => [f.feature, f.value])), [result]);
  const top = useMemo(() => {
    // The forest reports its strongest features (its "drivers") with each run; use them when present.
    const drivers = result?.ml?.drivers;
    if (model.explanation?.type === "random_forest" && drivers?.length) return drivers.slice(0, 8).map((d) => ({ feature: d.feature, weight: d.importance ?? 0 }));
    return featureWeights(model.explanation).slice(0, 8);
  }, [model.explanation, result]);
  const shown = result !== null && atLeast(phase, "features");
  const n = result?.length ?? 0;
  const all = result?.ml?.active_features ?? [];
  return (
    <div>
      <Heading sub="The eight features this model weighs most, as computed for this string.">What the model saw</Heading>
      <ul className="space-y-3">
        {top.map((f, i) => {
          const info = describeFeature(f.feature);
          const v = values.get(f.feature) ?? 0;
          const fill = shown ? featureFill(f.feature, v, n) : 0;
          return (
            <li key={f.feature} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1">
              <span className="min-w-0 truncate text-sm text-ink" title={info.label}>
                {info.label}
              </span>
              <span className="tabular text-right font-mono text-sm text-ink">{shown ? formatFeatureValue(f.feature, v) : "–"}</span>
              <span className="col-span-2 flex items-center gap-3">
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] bg-lamp"
                    style={{
                      width: `${fill * 100}%`,
                      transition: reduce ? "none" : `width 520ms cubic-bezier(.2,.8,.2,1) ${phase === "features" ? i * 80 : 0}ms`,
                    }}
                  />
                </span>
                <span className="w-24 shrink-0 truncate font-mono text-[11px] text-muted">{f.feature}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted">Bars: flags are full when true; counts are relative to the string’s length; shares as they are.</p>
      {shown && all.length > 0 && (
        <details className="group mt-4 rounded-xl border border-line bg-panel/60 px-4 py-3 text-sm">
          <summary className="cursor-pointer select-none text-ink-2 marker:text-muted hover:text-ink">
            All {all.length} non-zero features for this string
          </summary>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {all.map((f) => (
              <li key={f.feature} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-ink-2" title={f.feature}>
                  {describeFeature(f.feature).label}
                </span>
                <span className="tabular shrink-0 font-mono text-ink">{formatFeatureValue(f.feature, f.value)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ right: how each kind of model turns features into a verdict
function SignedRow({ label, sub, value, max, delay, shown }: { label: React.ReactNode; sub?: string; value: number; max: number; delay: number; shown: boolean }) {
  const reduce = useReducedMotion();
  const w = shown ? Math.min(1, Math.abs(value) / (max || 1)) * 50 : 0;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(90px,38%)_52px] items-center gap-3 py-1">
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{label}</span>
        {sub && <span className="block truncate font-mono text-[11px] text-muted">{sub}</span>}
      </span>
      <span className="relative h-3">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line-strong" aria-hidden />
        <span
          className={cn("absolute inset-y-0", value >= 0 ? "left-1/2 rounded-r-[4px] bg-accept" : "right-1/2 rounded-l-[4px] bg-reject")}
          style={{ width: `${w}%`, transition: reduce ? "none" : `width 500ms cubic-bezier(.2,.8,.2,1) ${delay}ms` }}
        />
      </span>
      <span className="tabular text-right font-mono text-sm text-ink">{shown ? signed(value) : "–"}</span>
    </li>
  );
}

function LrReasoning({ model, result, phase }: { model: ModelDetail; result: ClassifyResult; phase: Phase }) {
  const ml = result.ml!;
  const drivers = ml.drivers ?? [];
  const bias = model.explanation?.intercept ?? 0;
  const logit = ml.logit ?? 0;
  const shownSum = drivers.reduce((s, d) => s + (d.contribution ?? 0), 0);
  const rest = logit - bias - shownSum;
  const max = Math.max(...drivers.map((d) => Math.abs(d.contribution ?? 0)), Math.abs(rest), 1e-9);
  const shown = atLeast(phase, "model");
  const animate = phase === "model";
  return (
    <div>
      <Heading
        sub={
          <>
            Each feature is first standardized (how far it sits from its average over the training strings), so a feature that is{" "}
            <em>absent</em> where it is usually present also pushes. Mint pushes towards accept, coral towards reject.
          </>
        }
      >
        How it decided
      </Heading>
      <ul className="divide-y divide-line/60">
        {drivers.map((d, i) => (
          <SignedRow
            key={d.feature}
            label={`${describeFeature(d.feature).label} = ${formatFeatureValue(d.feature, d.value)}`}
            sub={d.feature}
            value={d.contribution ?? 0}
            max={max}
            delay={animate ? i * 90 : 0}
            shown={shown}
          />
        ))}
        {Math.abs(rest) >= 0.005 && <SignedRow label="all other features" value={rest} max={max} delay={animate ? drivers.length * 90 : 0} shown={shown} />}
      </ul>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-line pt-4 font-mono text-sm">
        <dt className="text-ink-2">bias</dt>
        <dd className="tabular text-right text-ink">{signed(bias)}</dd>
        <dt className="text-ink-2">z = bias + all contributions</dt>
        <dd className="tabular text-right font-semibold text-ink">{shown ? logit.toFixed(2) : "–"}</dd>
        <dt className="text-ink-2">P(accept) = σ(z)</dt>
        <dd className="tabular text-right font-semibold text-ink">{shown ? pct(sigmoid(logit)) : "–"}</dd>
      </dl>
    </div>
  );
}

function DtReasoning({ result, phase }: { result: ClassifyResult; phase: Phase }) {
  const path = result.ml?.decision_path ?? [];
  const shown = atLeast(phase, "model");
  const reduce = useReducedMotion();
  return (
    <div>
      <Heading sub="The tree asks one question per level. A “no” sends the string left, a “yes” sends it right, until a leaf answers.">How it decided</Heading>
      <ol className="relative space-y-1.5 border-l border-line pl-5">
        {path.map((s, i) => (
          <motion.li
            key={i}
            initial={false}
            animate={{ opacity: shown ? 1 : 0.25, x: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: shown && phase === "model" && !reduce ? i * 0.09 : 0 }}
            className="relative grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-sm"
          >
            <span className="absolute -left-[25px] top-[7px] h-2 w-2 rounded-full border border-[color:var(--lamp)] bg-bg" aria-hidden />
            <span className="min-w-0 text-ink">
              <span className="mr-1.5 font-mono text-xs text-muted">{i + 1}</span>
              {splitQuestion(s.feature, s.threshold)}
              <span className="ml-2 font-mono text-[11px] text-muted">
                {s.feature} = {formatFeatureValue(s.feature, s.value)}
              </span>
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap font-medium text-ink">
              {s.goes === ">" ? <CornerDownRight size={14} className="text-lamp" aria-hidden /> : <CornerDownLeft size={14} className="text-lamp" aria-hidden />}
              {s.goes === ">" ? "yes" : "no"}
            </span>
          </motion.li>
        ))}
        <li className="relative text-sm">
          <span className={cn("absolute -left-[26px] top-[5px] h-2.5 w-2.5 rounded-sm", result.accepted ? "bg-accept" : "bg-reject")} aria-hidden />
          <span className="text-ink-2">Leaf: </span>
          <span className="font-medium text-ink">{shown ? pct(result.probability ?? 0) : "–"}</span>
          <span className="text-ink-2"> of the training strings that ended here were in the language, so the tree says </span>
          <span className={cn("font-medium", result.accepted ? "text-accept" : "text-reject")}>{shown ? (result.accepted ? "accept" : "reject") : "–"}</span>
          <span className="text-ink-2">.</span>
        </li>
      </ol>
    </div>
  );
}

function RfReasoning({ model, result, phase }: { model: ModelDetail; result: ClassifyResult; phase: Phase }) {
  const votes = result.ml?.tree_votes;
  const total = votes ? votes.accept + votes.reject : 0;
  const shown = atLeast(phase, "model");
  const reduce = useReducedMotion();
  const trees = model.explanation?.trees ?? total;
  return (
    <div>
      <Heading sub="No single path explains a forest. Each tree drops the string into one of its leaves and reports the share of accepted training strings there; the forest averages those shares.">
        How it decided
      </Heading>
      {votes && (
        <div>
          <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[6px]" role="img" aria-label={`${votes.accept} of ${total} trees lean accept, ${votes.reject} lean reject`}>
            {[
              { n: votes.accept, color: "var(--accept)", label: "accept" },
              { n: votes.reject, color: "var(--reject)", label: "reject" },
            ].map((s) =>
              s.n > 0 ? (
                <motion.span
                  key={s.label}
                  className="h-full"
                  style={{ background: s.color }}
                  initial={false}
                  animate={{ flexGrow: shown ? s.n : 0.0001, opacity: shown ? 1 : 0.2 }}
                  transition={{ duration: reduce ? 0 : 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-ink">
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-accept align-middle" aria-hidden />
              {votes.accept} trees lean accept
            </span>
            <span className="text-ink">
              {votes.reject} lean reject
              <span className="ml-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-reject align-middle" aria-hidden />
            </span>
          </div>
        </div>
      )}
      <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-line pt-4 text-sm">
        <dt className="text-ink-2">Average of the {trees} trees’ leaf shares = P(accept)</dt>
        <dd className="tabular text-right font-mono font-semibold text-ink">{shown ? pct(result.probability ?? 0) : "–"}</dd>
        <dt className="text-ink-2">Share of trees voting accept</dt>
        <dd className="tabular text-right font-mono text-ink">{shown && votes ? pct(votes.accept / Math.max(total, 1)) : "–"}</dd>
      </dl>
      <p className="mt-3 text-xs text-muted">
        The two numbers differ because a tree’s leaf can be mixed: a leaf where 40% of strings were accepted adds 0.4, though that tree votes reject.
      </p>
    </div>
  );
}

function StackReasoning({ model, result, phase }: { model: ModelDetail; result: ClassifyResult; phase: Phase }) {
  const base = result.ml?.base_probabilities ?? {};
  const weights = result.ml?.meta_weights ?? {};
  const bias = model.explanation?.meta_intercept ?? 0;
  const ids = Object.keys(weights).filter((id): id is PipelineId => id in PIPELINE_BY_ID);
  const z = bias + ids.reduce((s, id) => s + weights[id] * (base[id] ?? 0), 0);
  const shown = atLeast(phase, "model");
  return (
    <div>
      <Heading sub="Three base models score the string; a logistic regression (the meta-learner) multiplies each probability by a learned weight, adds a bias and squashes the sum.">
        How it decided
      </Heading>
      <table className="tabular w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 font-normal">base model</th>
            <th className="pb-2 text-right font-normal">P(accept)</th>
            <th className="pb-2 text-right font-normal">weight</th>
            <th className="pb-2 text-right font-normal">adds</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {ids.map((id) => (
            <tr key={id} className="border-t border-line/60">
              <td className="py-1.5 font-sans text-ink">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PIPELINE_BY_ID[id].color }} aria-hidden />
                {PIPELINE_BY_ID[id].name}
              </td>
              <td className="py-1.5 text-right text-ink">{shown ? pct(base[id] ?? 0) : "–"}</td>
              <td className="py-1.5 text-right text-ink-2">× {weights[id].toFixed(2)}</td>
              <td className="py-1.5 text-right text-ink">{shown ? signed(weights[id] * (base[id] ?? 0)) : "–"}</td>
            </tr>
          ))}
          <tr className="border-t border-line/60">
            <td className="py-1.5 font-sans text-ink-2" colSpan={3}>
              bias
            </td>
            <td className="py-1.5 text-right text-ink">{signed(bias)}</td>
          </tr>
          <tr className="border-t border-line">
            <td className="py-1.5 font-sans text-ink-2" colSpan={3}>
              z, the sum
            </td>
            <td className="py-1.5 text-right font-semibold text-ink">{shown ? z.toFixed(2) : "–"}</td>
          </tr>
          <tr>
            <td className="py-1.5 font-sans text-ink-2" colSpan={3}>
              P(accept) = σ(z)
            </td>
            <td className="py-1.5 text-right font-semibold text-ink">{shown ? pct(result.probability ?? sigmoid(z)) : "–"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Reasoning({
  model,
  result,
  phase,
}: {
  model: ModelDetail;
  language: Language;
  result: ClassifyResult | null;
  phase: Phase;
}) {
  const type = model.explanation?.type;
  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
      <SeenFeatures model={model} result={result} phase={phase} />
      <div aria-live="off">
        {!result || !result.ml ? (
          <div>
            <Heading sub="Run a string to see the model’s own arithmetic for it.">How it decided</Heading>
            <div className="space-y-2" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-6 animate-pulse rounded-md bg-panel-2/70" />
              ))}
            </div>
          </div>
        ) : type === "logistic_regression" ? (
          <LrReasoning model={model} result={result} phase={phase} />
        ) : type === "decision_tree" ? (
          <DtReasoning result={result} phase={phase} />
        ) : type === "random_forest" ? (
          <RfReasoning model={model} result={result} phase={phase} />
        ) : type === "stacking" ? (
          <StackReasoning model={model} result={result} phase={phase} />
        ) : (
          <p className="text-sm text-ink-2">This model returned no explanation.</p>
        )}
      </div>
    </div>
  );
}
