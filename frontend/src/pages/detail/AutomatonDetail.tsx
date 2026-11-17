import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { LightTable } from "@/components/graph/LightTable";
import { errorMessage, useAutomaton } from "@/lib/api";
import { ErrorState, Skeleton, Tabs, type TabItem } from "@/components/ui/primitives";
import { PIPELINE_BY_ID } from "@/lib/meta";
import type { DfaPayload } from "@/lib/types";
import type { DetailProps } from "./DetailPage";
import { DfaStage, type ExampleSet } from "./automata/DfaStage";
import { LstarStory, MinDfaStory, PassiveStory, TruthStory } from "./automata/Learning";
import { MetricsPanel } from "./automata/Metrics";
import { MinimizationView, SizeStory } from "./automata/Minimization";
import { disagreements, exampleStrings, plural, separationFromRows, separationTable, stateNotes } from "./automata/model";
import { WhyMinimal } from "./automata/NerodeTable";
import { StateTable, TransitionTable } from "./automata/Tables";
import { Chapter } from "./automata/ui";
import { useLinkedString, useRunner, useScrollTo } from "./automata/useRunner";

export default function AutomatonDetail({ language, approach }: DetailProps) {
  const query = useAutomaton(language.id, approach.id);
  const truthQuery = useAutomaton(language.id, "dfa");
  const minQuery = useAutomaton(language.id, "min_dfa");
  const runner = useRunner(language.id, approach.id);
  const stage = useScrollTo();

  const record = query.data;
  const dfa = record?.automaton.kind === "dfa" ? (record.automaton as DfaPayload) : null;
  const truth = truthQuery.data?.automaton.kind === "dfa" ? (truthQuery.data.automaton as DfaPayload) : null;
  const minDfa = minQuery.data?.automaton.kind === "dfa" ? (minQuery.data.automaton as DfaPayload) : null;
  const link = useLinkedString(runner, dfa?.alphabet);
  const notes = useMemo(() => (dfa ? stateNotes(dfa) : {}), [dfa]);

  const examples = useMemo<ExampleSet>(() => {
    if (!dfa) return { accepted: [], rejected: [], wrong: [] };
    const judge = truth ?? dfa;
    const { accepted, rejected } = exampleStrings(judge, 3, 9);
    const wrong: string[] = [];
    const cex = record?.metrics?.counterexample_to_truth;
    if (cex !== null && cex !== undefined) wrong.push(cex);
    if (truth && approach.family === "learned") for (const w of disagreements(dfa, truth, 4)) if (!wrong.includes(w)) wrong.push(w);
    return { accepted, rejected, wrong: wrong.slice(0, 3) };
  }, [dfa, truth, record, approach.family]);

  const separation = useMemo(() => {
    if (!dfa) return null;
    const rows = record?.distinguishing_suffixes;
    return rows && rows.length > 0 ? separationFromRows(dfa, rows) : separationTable(dfa);
  }, [dfa, record]);

  // On narrow screens the tab rail scrolls; bring the tab that opens first into view.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = tabsRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    list.scrollLeft += tab.getBoundingClientRect().left - list.getBoundingClientRect().left - 16;
  }, [record]);

  if (query.isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading the automaton">
        <Skeleton className="h-[560px] w-full rounded-[28px]" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.error || !record) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  if (!dfa || !separation) return <ErrorState message="This record does not contain a DFA." />;

  const runAndShow = (s: string) => {
    runner.setDraft(s);
    stage.scroll(() => runner.run(s));
  };
  const isLstar = approach.id.startsWith("lstar_");
  const isPassive = approach.id === "rpni" || approach.id === "edsm";
  const learned = approach.family === "learned";
  const modelName = approach.pipeline ? PIPELINE_BY_ID[approach.pipeline].name : "model";
  const metrics = record.metrics ?? null;
  const consistent = typeof record.stats?.consistent_with_training === "boolean" ? record.stats.consistent_with_training : null;
  const demo = link.linked !== null ? (link.valid ? link.linked : undefined) : (examples.accepted.find((s) => s.length >= 3) ?? examples.accepted[0]);
  const converged = record.learning?.converged ?? metrics?.converged ?? null;
  const stageNote = isLstar && converged === false && dfa.states.length > 20 ? `${dfa.states.length} states: this is a model that never settled on a rule.` : undefined;

  let describe: ((q: string) => ReactNode) | undefined;
  let describeLabel: string | undefined;
  if (Object.keys(notes).length > 0) {
    describe = (q) => notes[q] ?? "–";
    describeLabel = "What it remembers";
  } else if (record.minimization) {
    const groups = record.minimization.groups;
    describe = (q) => <span className="font-mono text-[13px]">{(groups[q] ?? [q]).join(", ")}</span>;
    describeLabel = "Subset-DFA states merged into it";
  }

  let story: ReactNode;
  if (isLstar && record.learning) story = <LstarStory learning={record.learning} metrics={metrics} modelName={modelName} />;
  else if (isPassive && record.learning) story = <PassiveStory learning={record.learning} metrics={metrics} dfa={dfa} approachId={approach.id as "rpni" | "edsm"} consistent={consistent} />;
  else if (approach.id === "min_dfa") story = <MinDfaStory record={record} language={language} />;
  else story = <TruthStory dfa={dfa} language={language} />;

  const tabs: TabItem[] = [
    { id: "states", label: "State table", content: <StateTable dfa={dfa} describe={describe} describeLabel={describeLabel} onRun={runAndShow} /> },
    { id: "delta", label: "Transition table", content: <TransitionTable dfa={dfa} /> },
    {
      id: "minimization",
      label: "Minimization",
      content: record.minimization ? (
        <MinimizationView minimization={record.minimization} after={dfa} />
      ) : (
        <SizeStory dfa={dfa} approachId={approach.id} language={language} metrics={metrics} learning={record.learning} />
      ),
    },
    {
      id: "minimal",
      label: "Why it is minimal",
      content: (
        <WhyMinimal
          dfa={dfa}
          table={separation}
          minimumStates={language.expected_min_states}
          languageId={language.id}
          equivalent={metrics?.equivalent_to_truth ?? (approach.family === "truth" ? true : null)}
          onRun={runAndShow}
        />
      ),
    },
    { id: "story", label: learned ? "How it was learned" : "How it was built", content: story },
  ];
  const initialTab = approach.id === "min_dfa" ? "minimization" : learned ? "story" : "states";

  return (
    <div className="space-y-32">
      <div ref={stage.ref} className="scroll-mt-24">
        <DfaStage dfa={dfa} notes={notes} runner={runner} examples={examples} family={approach.family} isTruth={approach.id === "dfa"} demo={demo} note={stageNote} />
      </div>

      {learned && metrics && (
        <Chapter
          id="how-well"
          title="How well it works"
          lede={
            <p>
              Accuracy counts mistakes on held-out strings. The equivalence check goes further: it compares this machine with the ground truth on every
              possible string.
            </p>
          }
        >
          <MetricsPanel metrics={metrics} dfa={dfa} isLstar={isLstar} onRun={runAndShow} />
          {minDfa && (
            <div className="mt-16 space-y-4">
              <h3 className="t-h3 text-ink">On the light table</h3>
              <p className="max-w-3xl text-ink-2">
                The minimal ground-truth DFA is drawn in ink; this machine is laid over it on tracing paper. If the two are the same machine, every
                state and arrow registers.
              </p>
              <LightTable truth={minDfa} candidate={dfa} counterexample={metrics.counterexample_to_truth} candidateLabel={approach.name} />
            </div>
          )}
        </Chapter>
      )}

      <Chapter
        id="inspect"
        title="Inspect the machine"
        lede={
          <p>
            Five views of the same {plural(dfa.states.length, "state")}: who they are, the transition function, how small the machine can get, the
            proof that it cannot get smaller, and where it came from.
          </p>
        }
      >
        <div ref={tabsRef}>
          <Tabs items={tabs} initial={initialTab} label="Ways to inspect the automaton" />
        </div>
      </Chapter>
    </div>
  );
}
