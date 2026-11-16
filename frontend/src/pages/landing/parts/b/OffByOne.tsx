import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { HBars } from "@/components/charts/Charts";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { ErrorState, LoadingBlock, StringInput } from "@/components/ui/primitives";
import { errorMessage, useAutomaton, useClassify } from "@/lib/api";
import { runDfa } from "@/lib/automata";
import { PIPELINE_BY_ID, showString } from "@/lib/meta";
import type { ApproachId, DfaPayload } from "@/lib/types";
import { useBands } from "./bands";
import { agreeOnNonEmpty } from "./lstar";
import { LSTAR_PIPELINE, type LStarId } from "./results-data";
import { VerdictTag } from "./StripTape";
import { SceneTitle } from "./ui";

/**
 * A converged L* extraction that still differs from the truth: the difference is the model's
 * own mistake. Both machines side by side, the disagreeing state lit, and a live question to
 * the model about any string.
 */
export function OffByOne({ language, approach, languageName }: { language: string; approach: LStarId; languageName: string }) {
  const extracted = useAutomaton(language, approach);
  const truth = useAutomaton(language, "dfa");
  if (extracted.isError || truth.isError) {
    return <ErrorState message={errorMessage(extracted.error ?? truth.error)} onRetry={() => (extracted.refetch(), truth.refetch())} />;
  }
  const ex = extracted.data?.automaton.kind === "dfa" ? extracted.data.automaton : null;
  const tr = truth.data?.automaton.kind === "dfa" ? truth.data.automaton : null;
  const cex = extracted.data?.metrics?.counterexample_to_truth;
  if (!ex || !tr || cex === undefined || !extracted.data?.metrics) return <LoadingBlock label="Loading both automata…" />;
  return <Body language={language} approach={approach} languageName={languageName} extracted={ex} truth={tr} cex={cex} metrics={extracted.data.metrics} />;
}

function Body({
  language,
  approach,
  languageName,
  extracted,
  truth,
  cex,
  metrics,
}: {
  language: string;
  approach: LStarId;
  languageName: string;
  extracted: DfaPayload;
  truth: DfaPayload;
  cex: string | null;
  metrics: { test: { accuracy: number }; long: { accuracy: number } };
}) {
  const pipeline = LSTAR_PIPELINE[approach];
  const model = PIPELINE_BY_ID[pipeline].name;
  const bands = useBands();
  const onlyEmpty = cex === "" && agreeOnNonEmpty(extracted, truth);
  const exStart = runDfa(extracted, "");
  const trStart = runDfa(truth, "");
  return (
    <div className="space-y-12">
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <SceneTitle>One string off</SceneTitle>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">
          On {language} (&ldquo;{languageName}&rdquo;) the {model.toLowerCase()} scores {(metrics.test.accuracy * 100).toFixed(0)}% on the test split and{" "}
          {(metrics.long.accuracy * 100).toFixed(0)}% on lengths {bands.longWords}. L* converges on a DFA that looks the same as the truth, state for state, yet it is not
          the truth.{" "}
          {cex !== null && (
            <>
              The two disagree on <span className="font-mono text-ink">{showString(cex)}</span>
              {cex === "" ? ", the empty string" : ""}
              {onlyEmpty ? " and on nothing else" : ""}: the start state of the extracted DFA accepts, so the model says yes to a string the language rejects. Test
              accuracy calls the model perfect. The automaton names its one mistake.
            </>
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 content-start gap-5">
        <Machine
          title={`L* from the ${model.toLowerCase()}`}
          dfa={extracted}
          verdict={exStart.accepted ? "accept" : "reject"}
          note={`starts in ${extracted.start}: ${exStart.accepted ? "accepting" : "rejecting"}`}
        />
        <Machine title="Ground truth" dfa={truth} verdict={trStart.accepted ? "accept" : "reject"} note={`starts in ${truth.start}: ${trStart.accepted ? "accepting" : "rejecting"}`} />
        <p className="text-sm text-muted">
          Both machines read ε without moving, so the answer is decided by the start state alone: the halo shows each machine&apos;s verdict on ε.
        </p>
      </div>
    </div>
    <AskTheModel language={language} approach={`ml_${pipeline}` as ApproachId} model={model} extracted={extracted} truth={truth} initial={cex ?? ""} />
    </div>
  );
}

function Machine({ title, dfa, verdict, note }: { title: string; dfa: DfaPayload; verdict: "accept" | "reject"; note: string }) {
  return (
    <figure className="grid-paper relative rounded-2xl border border-line bg-panel/70 p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-lg font-semibold text-ink">{title}</span>
        <span className="text-xs text-muted">{note}</span>
      </figcaption>
      <div className="mt-2">
        <AutomatonGraph
          automaton={dfa}
          active={[dfa.start]}
          verdict={verdict}
          zoomable={false}
          rankdir="LR"
          maxHeight={230}
          radius={20}
          ariaLabel={`${title}: ${dfa.num_states} states, start state ${dfa.start} is ${verdict === "accept" ? "accepting" : "not accepting"}.`}
        />
      </div>
    </figure>
  );
}

function AskTheModel({
  language,
  approach,
  model,
  extracted,
  truth,
  initial,
}: {
  language: string;
  approach: ApproachId;
  model: string;
  extracted: DfaPayload;
  truth: DfaPayload;
  initial: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const classify = useClassify();
  const [value, setValue] = useState(initial);
  const [asked, setAsked] = useState<string | null>(null);
  const ask = (s: string) => {
    setAsked(s);
    classify.mutate({ language, approach, string: s });
  };
  useEffect(() => {
    if (inView && asked === null) ask(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);
  const res = classify.data && asked !== null && classify.data.string === asked ? classify.data : null;
  const drivers = res?.ml?.drivers?.filter((d) => d.contribution !== undefined) ?? [];
  return (
    <div ref={ref} className="grid grid-cols-1 gap-8 rounded-3xl border border-line bg-panel/70 p-5 md:p-7 lg:grid-cols-2 lg:gap-12">
      <div className="space-y-5">
      <div>
        <h4 className="font-display text-xl font-semibold text-ink">Ask the model yourself</h4>
        <p className="mt-1 text-sm text-ink-2">The model answers live; both automata answer in your browser. Try ε, then any other string.</p>
      </div>
      <StringInput value={value} onChange={setValue} onSubmit={() => ask(value)} alphabet={truth.alphabet} submitLabel="Ask all three" loading={classify.isPending} label="A string" />
      {classify.isError && <ErrorState message={errorMessage(classify.error)} onRetry={() => asked !== null && ask(asked)} />}
      </div>
      {asked !== null && (
        <div className="space-y-4" aria-live="polite">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-2">
              The {model.toLowerCase()} itself <span className="text-muted">(live, from the API)</span>
            </dt>
            <dd>{res ? <VerdictTag accepted={res.accepted} /> : <span className="text-muted">asking…</span>}</dd>
            <dt className="text-ink-2">Its extracted DFA</dt>
            <dd>
              <VerdictTag accepted={runDfa(extracted, asked).accepted} />
            </dd>
            <dt className="text-ink-2">The ground-truth DFA</dt>
            <dd>
              <VerdictTag accepted={runDfa(truth, asked).accepted} />
            </dd>
          </dl>
          {res?.probability !== undefined && (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-sm text-ink-2">
                On <span className="font-mono text-ink">{showString(asked)}</span> the model gives P(accept) ={" "}
                <span className="tabular font-mono text-ink">{(res.probability * 100).toFixed(1)}%</span>
                {drivers.length > 0 ? ". The features that pushed it hardest:" : "."}
              </p>
              {drivers.length > 0 && (
                <HBars
                  items={drivers.map((d) => ({ label: d.feature, value: d.contribution ?? 0 }))}
                  signed
                  format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`}
                  colorFor={(v) => (v >= 0 ? "var(--accept)" : "var(--reject)")}
                  ariaLabel="Contribution of each feature to the model's decision; positive pushes towards accept"
                  barHeight={18}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
