import { useMemo } from "react";
import { Link } from "react-router";
import { errorMessage, useAutomaton } from "@/lib/api";
import { runDfa } from "@/lib/automata";
import { duration, int, pct, PIPELINE_BY_ID, showString } from "@/lib/meta";
import type { ApproachId, ClassifyResult, DfaPayload, Language, ModelDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LightTable, matchDfas } from "@/components/graph/LightTable";
import { Tape } from "@/components/tape/Tape";
import { Badge, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { SectionHeading } from "./SectionHeading";

/** One sentence on the reader's last string: what the extracted DFA says next to the model and the truth. */
function LastRunLine({ dfa, run, languageId }: { dfa: DfaPayload; run: ClassifyResult; languageId: string }) {
  const says = useMemo(() => runDfa(dfa, run.string).accepted, [dfa, run.string]);
  const agree = says === run.accepted;
  return (
    <p className="text-sm text-ink-2">
      On your string <span className="font-mono text-ink">{showString(run.string.length > 24 ? `${run.string.slice(0, 23)}…` : run.string)}</span> the
      extracted DFA {says ? "accepts" : "rejects"}, the model {run.accepted ? "accepted" : "rejected"}, and the truth is “{run.truth ? "in" : "not in"}{" "}
      {languageId}”. {agree ? "They agree on this string." : "Here they disagree."}
    </p>
  );
}

function FidelityTable({ model }: { model: ModelDetail }) {
  const x = model.extracted_dfa;
  const rows: { label: React.ReactNode; hint: string; test: number | null | undefined; long: number | null | undefined; color: string }[] = [
    { label: <Term k="fidelity">Fidelity</Term>, hint: "the DFA agrees with the model", test: x.test?.fidelity, long: x.long?.fidelity, color: "var(--ink-2)" },
    { label: "DFA accuracy", hint: "the DFA agrees with the truth", test: x.test?.accuracy, long: x.long?.accuracy, color: "var(--accept)" },
    {
      label: "Model accuracy",
      hint: "the model agrees with the truth",
      test: model.metrics.test.accuracy,
      long: model.metrics.long.accuracy,
      color: PIPELINE_BY_ID[model.pipeline]?.color ?? "var(--series-truth)",
    },
  ];
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Fidelity and accuracy of the extracted DFA</caption>
      <thead>
        <tr className="text-xs text-muted">
          <th className="pb-2 font-normal">
            <span className="sr-only">measure</span>
          </th>
          <th className="pb-2 pl-3 font-normal">test, 0–20</th>
          <th className="pb-2 pl-3 font-normal">long, 21–40</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line align-top">
            <th scope="row" className="py-3 pr-2 font-normal">
              <span className="block text-ink">{r.label}</span>
              <span className="block text-xs text-muted">{r.hint}</span>
            </th>
            {[r.test, r.long].map((v, j) => (
              <td key={j} className="py-3 pl-3">
                <span className="tabular block font-mono text-ink">{v === null || v === undefined ? "–" : pct(v)}</span>
                <span className="mt-1.5 block h-1.5 w-full max-w-[120px] rounded-full bg-panel-2" aria-hidden>
                  <span className="block h-full rounded-r-[3px]" style={{ width: `${(v ?? 0) * 100}%`, background: r.color }} />
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function storyFor(model: ModelDetail, languageId: string): string {
  const x = model.extracted_dfa;
  const fid = x.test?.fidelity ?? null;
  const fidLong = x.long?.fidelity ?? null;
  const dfaAcc = x.test?.accuracy ?? null;
  const modelAcc = model.metrics.test.accuracy;
  if (x.equivalent_to_truth) {
    if (fid !== null && fid >= 0.995 && (fidLong === null || fidLong >= 0.995))
      return `The model learned ${languageId} itself, and L* read it out: a ${x.states}-state DFA that is exactly equivalent to the ground truth, agreeing with the model on every test string.`;
    return `The DFA is exactly ${languageId}, yet it disagrees with the model on ${pct(1 - (fidLong ?? fid ?? 1))} of the ${fidLong !== null && fidLong < (fid ?? 1) ? "long" : "test"} strings. Every one of those disagreements is a mistake of the model: L* recovered the language better than the model it was questioning.`;
  }
  if (x.converged === false && fid !== null && dfaAcc !== null && dfaAcc > modelAcc + 0.02)
    return `At ${pct(fid)} fidelity this DFA is not a faithful portrait of the model: L* hit its state budget before it could fit all of the model’s answers, and the answers it could not fit are where the two disagree. Yet it is closer to the truth (${pct(dfaAcc)}) than the model itself (${pct(modelAcc)}).`;
  if (fid !== null && fid >= 0.95)
    return `The DFA copies the model closely (${pct(fid)} fidelity on test strings), mistakes included, so it is not exactly ${languageId}.`;
  return `It agrees with the model on ${pct(fid)} of the test strings and with the truth on ${pct(dfaAcc)}; it is not exactly ${languageId}.`;
}

export function ExtractedDfaSection({ language, model, lastRun }: { language: Language; model: ModelDetail; lastRun: ClassifyResult | null }) {
  const pid = model.pipeline;
  const approachId = `lstar_${pid}` as ApproachId;
  const rec = useAutomaton(language.id, approachId);
  const truthRec = useAutomaton(language.id, "min_dfa");
  const x = model.extracted_dfa;
  const dfa = rec.data?.automaton.kind === "dfa" ? rec.data.automaton : null;
  const minDfa = truthRec.data?.automaton.kind === "dfa" ? truthRec.data.automaton : null;
  const ce = x.counterexample_to_truth ?? null;
  const ceDfaSays = dfa && ce !== null ? runDfa(dfa, ce).accepted : null;
  // When the shapes differ the light table already runs the counterexample through both machines.
  const sheetsRegister = useMemo(() => (dfa && minDfa ? matchDfas(minDfa, dfa).outcome !== "no-match" : true), [dfa, minDfa]);
  const testAcc = model.metrics.test.accuracy;
  const lead = x.equivalent_to_truth === true && testAcc < 0.995 ? `${pct(testAcc)} accurate, and yet the machine L* drew from it is exactly right.` : null;
  const stop =
    x.stop_reason === "equivalent"
      ? "converged: the teacher found no counterexample"
      : x.stop_reason === "max_states"
        ? "stopped at its state budget; this is its last complete hypothesis"
        : x.stop_reason ?? "–";
  return (
    <section aria-labelledby="ml-dfa" className="space-y-12">
      <SectionHeading
        id="ml-dfa"
        title="The DFA hiding inside the model"
        lede={
          <>
            <Term k="lstar">L*</Term> treats the trained model as a teacher. It asks thousands of <Term k="membership-query">membership queries</Term> (is this
            string in the language?) and a few <Term k="equivalence-query">equivalence queries</Term>, then builds the smallest{" "}
            <Term k="dfa">DFA</Term> that agrees with the answers. If the model learned a regular language, this is the machine it learned.
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {x.equivalent_to_truth === true && <Badge tone="accept">exactly equivalent to the ground truth</Badge>}
        {x.equivalent_to_truth === false && <Badge tone="reject">differs from the ground truth</Badge>}
        {x.converged === false && <Badge tone="lamp">L* {stop}</Badge>}
        {x.converged === true && <Badge tone="outline">L* converged</Badge>}
      </div>

      <div className="space-y-12">
        <div className="grid-paper rounded-3xl border border-line bg-panel/40 p-4 sm:p-6">
          {lead && <p className="t-h3 mb-3 max-w-3xl text-ink">{lead}</p>}
          {x.states !== undefined && (
            <p className="mb-4 text-sm text-ink-2">
              <span className="font-display text-2xl font-semibold text-ink">{x.states} states</span>
              {x.states > language.expected_min_states ? (
                <> where {language.expected_min_states} would do: the smallest DFA for {language.id} has {language.expected_min_states}.{x.states > 12 && " Use + to zoom in."}</>
              ) : x.states === language.expected_min_states ? (
                <>, exactly as many as the smallest DFA for {language.id}.</>
              ) : (
                <>, fewer than the {language.expected_min_states} that {language.id} needs, so it cannot be exact.</>
              )}
            </p>
          )}
          {rec.isLoading || truthRec.isLoading ? (
            <div className="space-y-4" role="status" aria-label="Loading the extracted DFA">
              <Skeleton className="h-[300px] w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : rec.error || truthRec.error ? (
            <ErrorState
              message={errorMessage(rec.error ?? truthRec.error)}
              onRetry={() => {
                if (rec.error) rec.refetch();
                if (truthRec.error) truthRec.refetch();
              }}
            />
          ) : dfa && minDfa ? (
            <div className="space-y-5">
              <LightTable truth={minDfa} candidate={dfa} counterexample={ce} candidateLabel="Extracted DFA" maxHeight={300} />
              {lastRun && <LastRunLine dfa={dfa} run={lastRun} languageId={language.id} />}
            </div>
          ) : (
            <ErrorState message="The extracted automaton is not a DFA." />
          )}
        </div>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="grid grid-cols-2 content-start gap-x-8 gap-y-6">
            {[
              { v: int(x.states), l: "states", h: `${int(x.transitions)} transitions` },
              { v: int(x.membership_queries), l: "membership queries" },
              { v: int(x.equivalence_queries), l: "equivalence queries", h: x.counterexamples !== undefined ? `${x.counterexamples} counterexample${x.counterexamples === 1 ? "" : "s"} found` : undefined },
              { v: duration(x.learning_time_s ?? null), l: "to extract" },
            ].map((f, i) => (
              <div key={i} className="border-t border-line pt-3">
                <div className="font-display text-3xl font-semibold leading-none text-ink">{f.v}</div>
                <div className="mt-1.5 text-sm text-ink-2">{f.l}</div>
                {f.h && <div className="mt-0.5 text-xs text-muted">{f.h}</div>}
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <FidelityTable model={model} />
            <p className="text-sm leading-relaxed text-ink-2">{storyFor(model, language.id)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-10 border-t border-line pt-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-center">
        {ce !== null ? (
          <div className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-ink">The shortest string that tells it apart from {language.id}</h3>
            {!sheetsRegister ? null : (
              <Tape input={ce} head={ce.length} status={ceDfaSays === null ? "idle" : ceDfaSays ? "accepted" : "rejected"} size="md" label="Shortest counterexample" />
            )}
            <p className="text-sm text-ink-2">
              {ceDfaSays === null ? (
                <>
                  On <span className="font-mono text-ink">{showString(ce)}</span> the extracted DFA and the ground truth disagree.
                </>
              ) : (
                <>
                  The truth says <span className="font-medium text-ink">{ceDfaSays ? "not in" : "in"} {language.id}</span>; the extracted DFA{" "}
                  <span className={cn("font-medium", ceDfaSays ? "text-accept" : "text-reject")}>{ceDfaSays ? "accepts" : "rejects"}</span> it. Found by
                  searching the <Term k="product">product</Term> of the two DFAs breadth-first.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="font-display text-xl font-semibold text-ink">No string tells it apart from {language.id}</h3>
            <p className="text-sm text-ink-2">
              An <Term k="equivalence">equivalence check</Term> on the product of the extracted DFA and the ground truth found no reachable pair of states that
              disagree. This is a proof, not a test on samples.
            </p>
          </div>
        )}
        <div className="flex lg:justify-end">
          <Link
            to={`/explore/${language.id}/${approachId}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-lamp px-7 text-base font-medium text-[#1a1203] transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
          >
            Open the extracted DFA
          </Link>
        </div>
      </div>
    </section>
  );
}
