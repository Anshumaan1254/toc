import { useMemo } from "react";
import { errorMessage, useAutomaton } from "@/lib/api";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import type { NfaPayload } from "@/lib/types";
import type { DetailProps } from "./DetailPage";
import type { ExampleSet } from "./automata/DfaStage";
import { exampleStrings, plural, setKey, subsetsOf } from "./automata/model";
import { NfaStage } from "./automata/NfaStage";
import { SubsetConstruction } from "./automata/SubsetConstruction";
import { Chapter } from "./automata/ui";
import { useLinkedString, useRunner } from "./automata/useRunner";

export default function NfaDetail({ language, approach }: DetailProps) {
  const query = useAutomaton(language.id, approach.id);
  const runner = useRunner(language.id, approach.id);
  const record = query.data;
  const nfa = record?.automaton.kind === "nfa" ? (record.automaton as NfaPayload) : null;
  const sc = record?.subset_construction;
  const link = useLinkedString(runner, nfa?.alphabet);

  // The subset DFA accepts exactly the NFA's language, so it can label example strings locally.
  const examples = useMemo<ExampleSet>(() => {
    if (!sc) return { accepted: [], rejected: [], wrong: [] };
    const { accepted, rejected } = exampleStrings(sc.dfa, 3, 9);
    return { accepted, rejected, wrong: [] };
  }, [sc]);
  const dfaStateOf = useMemo(() => {
    const out = new Map<string, string>();
    if (sc) for (const [name, set] of Object.entries(subsetsOf(sc.dfa))) out.set(setKey(set), name);
    return out;
  }, [sc]);

  if (query.isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading the NFA">
        <Skeleton className="h-[560px] w-full rounded-[28px]" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.error || !record) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  if (!nfa) return <ErrorState message="This record does not contain an NFA." />;

  const demo = link.linked !== null ? (link.valid ? link.linked : undefined) : (examples.accepted.find((s) => s.length >= 3) ?? examples.accepted[0]);
  const construction = typeof nfa.meta?.construction === "string" ? nfa.meta.construction : null;
  const eps = Object.values(nfa.epsilon).reduce((n, list) => n + list.length, 0);

  return (
    <div className="space-y-32">
      <NfaStage nfa={nfa} runner={runner} examples={examples} dfaStateOf={dfaStateOf} demo={demo} />

      {sc ? (
        <Chapter
          id="subset-construction"
          title="Subset construction, step by step"
          lede={
            <>
              <p>
                A computer cannot guess, so to run this NFA it tracks the set of states that could be active. The{" "}
                <Term k="subset-construction">subset construction</Term> turns that idea into a DFA: each DFA state is one such set, and its arrow on a
                symbol leads to the set reachable by that symbol plus the <Term k="epsilon-closure">ε-closure</Term>, every state reachable by
                ε-moves alone.
              </p>
              <p className="mt-3 text-base text-muted">
                {construction === "thompson"
                  ? `This NFA came from the regular expression by Thompson's construction: ${plural(nfa.states.length, "state")}, ${plural(eps, "ε-move")}.`
                  : `This NFA was written by hand: ${plural(nfa.states.length, "state")}${eps > 0 ? `, ${plural(eps, "ε-move")}` : ", no ε-moves"}.`}{" "}
                The construction takes {plural(sc.steps.length, "step")}: one per DFA state and symbol.
              </p>
            </>
          }
        >
          <SubsetConstruction nfa={nfa} dfa={sc.dfa} steps={sc.steps} />
        </Chapter>
      ) : (
        <ErrorState message="This record has no subset construction to show." />
      )}
    </div>
  );
}
