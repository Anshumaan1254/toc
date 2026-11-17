import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { LightTable } from "@/components/graph/LightTable";
import { ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { errorMessage, useAutomaton, useSummary } from "@/lib/api";
import { runDfa } from "@/lib/automata";
import { int, PIPELINE_BY_ID, showString } from "@/lib/meta";
import type { DfaPayload, LearningTrace } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBands } from "./bands";
import { useActiveStep, useMediaQuery } from "./hooks";
import { firstAccepted, replayLStar, shortestDifference, type Replay, type TableFrame } from "./lstar";
import { ObservationTable } from "./ObservationTable";
import { LSTAR_PIPELINE, type LStarId } from "./results-data";
import { StripTape, VerdictTag } from "./StripTape";
import { Meter, SheetMarks } from "./ui";

type GroupKind = "start" | "fix" | "learn" | "hypothesis" | "counterexample" | "abort" | "result";
interface Group {
  kind: GroupKind;
  frames: number[];
}

/** Merge replay frames into the steps a reader scrolls through. */
function groupFrames(frames: TableFrame[]): Group[] {
  const groups: Group[] = [];
  frames.forEach((f, i) => {
    const last = groups[groups.length - 1];
    if (f.kind === "start") groups.push({ kind: "start", frames: [i] });
    else if (f.kind === "close" || f.kind === "consistent") {
      if (last && (last.kind === "fix" || last.kind === "learn")) last.frames.push(i);
      else groups.push({ kind: "fix", frames: [i] });
    } else if (f.kind === "extend") groups.push({ kind: "learn", frames: [i] });
    else if (f.kind === "hypothesis") groups.push({ kind: "hypothesis", frames: [i] });
    else if (f.kind === "counterexample") groups.push({ kind: "counterexample", frames: [i] });
    else if (f.kind === "abort") {
      if (last && last.kind === "counterexample") {
        last.kind = "abort";
        last.frames.push(i);
      } else groups.push({ kind: "abort", frames: [i] });
    }
  });
  const lastHyp = [...frames.keys()].reverse().find((i) => frames[i].kind === "hypothesis");
  if (lastHyp !== undefined) groups.push({ kind: "result", frames: [lastHyp] });
  return groups;
}

const listOf = (items: string[]) => {
  const shown = items.map((s) => showString(s));
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
};

function S({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap rounded bg-panel-2 px-1 font-mono text-[0.92em] text-ink">{children}</span>;
}

/**
 * Scroll-driven walk through a real L* run: the observation table fills, closes, gains a
 * column, guesses a DFA, meets counterexamples and (for L6 / random forest) hits its state
 * budget and keeps the last complete guess.
 */
export function LStarStory({ language, approach, describe }: { language: string; approach: LStarId; describe?: (s: string) => string | null }) {
  const rec = useAutomaton(language, approach);
  const truth = useAutomaton(language, "dfa");
  const summary = useSummary();
  const oracle = rec.data?.automaton.kind === "dfa" ? rec.data.automaton : null;
  const learning = rec.data?.learning;
  const replay = useMemo(() => (oracle && learning ? replayLStar(oracle, learning) : null), [oracle, learning]);

  if (rec.isError || truth.isError) {
    return <ErrorState message={errorMessage(rec.error ?? truth.error)} onRetry={() => (rec.refetch(), truth.refetch())} />;
  }
  if (!replay || !learning || !truth.data || !summary.data) return <LoadingBlock label="Loading the L* trace…" />;
  const truthDfa = truth.data.automaton.kind === "dfa" ? truth.data.automaton : null;
  if (!replay.verified || !truthDfa) return <RoundsFallback learning={learning} />;
  const pipeline = LSTAR_PIPELINE[approach];
  const ml = summary.data.ml[language]?.[pipeline];
  const budget = Number(summary.data.meta.extraction_config?.max_states ?? NaN);
  return (
    <Story
      replay={replay}
      learning={learning}
      truth={truthDfa}
      model={PIPELINE_BY_ID[pipeline].name.toLowerCase()}
      modelAccuracy={ml?.test.accuracy ?? null}
      metrics={rec.data?.metrics ?? null}
      budget={Number.isFinite(budget) ? budget : null}
      describe={describe}
    />
  );
}

interface StoryProps {
  replay: Replay;
  learning: LearningTrace;
  truth: DfaPayload;
  model: string;
  modelAccuracy: number | null;
  metrics: { test: { accuracy: number; fidelity?: number }; long: { accuracy: number }; membership_queries?: number | null; equivalent_to_truth: boolean } | null;
  budget: number | null;
  describe?: (s: string) => string | null;
}

function Story({ replay, learning, truth, model, modelAccuracy, metrics, budget, describe }: StoryProps) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const roomy = useMediaQuery("(min-width: 768px)");
  const bands = useBands();
  const groups = useMemo(() => groupFrames(replay.frames), [replay]);
  const { active, register } = useActiveStep(groups.length, wide ? 0.5 : 0.78);
  const { ask, frames } = replay;
  let hypCount = 0;
  const steps = groups.map((g, gi) => {
    const f = frames[g.frames[g.frames.length - 1]];
    const all = g.frames.map((i) => frames[i]);
    const added = all.flatMap((x) => x.added);
    const seps = all.map((x) => x.separator).filter((x): x is NonNullable<TableFrame["separator"]> => !!x);
    const closes = all.filter((x) => x.kind === "close").flatMap((x) => x.added);
    let title = "";
    let body: ReactNode = null;
    const sepText = seps.map((sp, k) => {
      const sa = sp.a + sp.symbol + sp.suffix;
      const sb = sp.b + sp.symbol + sp.suffix;
      return (
        <span key={k}>
          {" "}
          Rows <S>{showString(sp.a)}</S> and <S>{showString(sp.b)}</S> agree on every column, yet one more <S>{sp.symbol}</S> tells them apart:{" "}
          <S>{showString(sa)}</S> is {ask(sa) ? "accepted" : "rejected"} and <S>{showString(sb)}</S> is {ask(sb) ? "accepted" : "rejected"}. That makes the table
          inconsistent, so L* adds the column <S>{showString(sp.experiment)}</S>.
        </span>
      );
    });
    const closeText =
      closes.length > 0 ? (
        <span>
          {" "}
          Row{closes.length > 1 ? "s" : ""} <S>{listOf(closes)}</S> below the line match{closes.length > 1 ? "" : "es"} no row above it, so{" "}
          {closes.length > 1 ? "they are" : "it is"} a new state: L* moves {closes.length > 1 ? "them" : "it"} up and asks about the extensions.
        </span>
      ) : null;
    if (g.kind === "start") {
      const asked = [...f.S, ...f.ext].flatMap((r) => f.E.map((e) => r + e));
      title = "Ask the shortest questions";
      body = (
        <>
          L* keeps an <Term k="observation-table">observation table</Term>. Rows are prefixes, columns are suffixes, and every cell holds the model&apos;s answer to
          a <Term k="membership-query">membership query</Term>: is prefix + suffix in the language? It starts from the empty string and asks the {model} about{" "}
          <S>{listOf(asked)}</S>.
        </>
      );
    } else if (g.kind === "fix") {
      title = seps.length && closes.length ? "Close it, make it consistent" : seps.length ? "Make the table consistent" : "Make the table closed";
      body = (
        <>
          Rows above the line will become states, so every row below it must match one of them: the table must be <Term k="closed">closed</Term>.
          {closeText}
          {sepText}
        </>
      );
    } else if (g.kind === "learn") {
      const cex = frames[g.frames[0]].counterexample?.string ?? "";
      title = "Learn from the counterexample";
      body = (
        <>
          Angluin&apos;s repair is blunt: add <S>{showString(cex)}</S> and every prefix of it as rows ({added.length ? <S>{listOf(added)}</S> : "none are new"}),
          ask the new questions, and fix the table again.
          {closeText}
          {sepText}
        </>
      );
    } else if (g.kind === "hypothesis") {
      hypCount += 1;
      const hyp = f.hypothesis!;
      const diff = shortestDifference(hyp, truth);
      title = hypCount === 1 ? "Make a first guess" : "A better guess";
      body = (
        <>
          The table is <Term k="closed">closed</Term> and <Term k="consistent">consistent</Term>, so each distinct row above the line becomes a state: guess{" "}
          {hypCount} has {hyp.num_states}, <S>{hyp.states.join(", ")}</S>, each named after the row that defines it. It accepts <S>{listOf(firstAccepted(hyp, 5))}</S>, and so on.
          {diff === null ? " It is exactly the ground-truth DFA." : null}
        </>
      );
    } else if (g.kind === "counterexample" || g.kind === "abort") {
      const c = f.counterexample!;
      const modelAccepts = !c.hypothesisAccepts;
      const truthAccepts = runDfa(truth, c.string).accepted;
      const note = describe?.(c.string);
      const abort = g.kind === "abort" ? frames[g.frames[g.frames.length - 1]].aborted : undefined;
      title = g.kind === "abort" ? `Where the ${model} is wrong` : "Ask whether the guess is right";
      body =
        g.kind === "abort" ? (
          <>
            The next disagreement is <S>{showString(c.string)}</S>
            {note ? ` (${note})` : ""}. The guess {c.hypothesisAccepts ? "accepts" : "rejects"} it, the {model} {modelAccepts ? "accepts" : "rejects"} it, and the
            truth sides with the {truthAccepts === c.hypothesisAccepts ? "guess" : model}. Repairing the guess would mean copying the {model}&apos;s mistakes: the table
            grows to {abort?.S ?? "more"} prefixes and {abort?.E ?? "more"} columns{budget ? `, past the budget of ${budget} states` : ""}, so L* stops and keeps its
            last complete guess.
          </>
        ) : (
          <>
            An <Term k="equivalence-query">equivalence query</Term> asks whether the guess is the language. Nobody can answer that for a {model}, so it is tested
            instead: guess and model are compared on thousands of strings ({int(learning.eq_strings_tested ?? 0)} over the whole run). They disagree on{" "}
            <S>{showString(c.string)}</S>
            {note ? ` (${note})` : ""}: the {model} says {modelAccepts ? "yes" : "no"}, the guess says {c.hypothesisAccepts ? "yes" : "no"}, and this time the{" "}
            {truthAccepts === modelAccepts ? `${model} is right` : "guess is right"}. That string is the <Term k="counterexample">counterexample</Term>.
          </>
        );
    } else {
      title = "Accuracy is not fidelity";
      body = (
        <>
          {modelAccuracy !== null && <>The {model} is right on {(modelAccuracy * 100).toFixed(1)}% of test strings. </>}
          {metrics && (
            <>
              The DFA pulled out of it is right on {(metrics.test.accuracy * 100).toFixed(0)}%, and on {(metrics.long.accuracy * 100).toFixed(0)}% of strings of
              length {bands.longWords}.{" "}
              {metrics.test.fidelity !== undefined && (
                <>
                  The two agree on {(metrics.test.fidelity * 100).toFixed(1)}% of test strings: that is the DFA&apos;s <Term k="fidelity">fidelity</Term> to the{" "}
                  {model}.
                </>
              )}{" "}
              {metrics.membership_queries ? <>In total L* asked the {model} about {int(metrics.membership_queries)} different strings.</> : null}
            </>
          )}
        </>
      );
    }
    return { id: `${g.kind}-${gi}`, group: g, frame: f, title, body, added, seps };
  });

  const current = steps[Math.min(active, steps.length - 1)];
  return (
    <div className="relative grid grid-cols-1 gap-x-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="sticky top-[6.5rem] z-10 -mx-6 bg-bg/92 px-6 pb-3 pt-2 backdrop-blur-md lg:order-2 lg:top-24 lg:mx-0 lg:flex lg:h-[calc(100svh-8rem)] lg:items-center lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Stage step={current} replay={replay} truth={truth} model={model} modelAccuracy={modelAccuracy} metrics={metrics} compact={!roomy} />
      </div>
      <ol className="relative pb-[16svh] pt-[4svh] lg:order-1 lg:py-[20svh]">
        {steps.map((s, i) => (
          <li
            key={s.id}
            ref={register(i)}
            className={cn("flex min-h-[62svh] flex-col pt-6 transition-opacity duration-500 lg:min-h-[74svh] lg:justify-center lg:pt-0", i === active ? "opacity-100" : "opacity-35")}
          >
            <h4 className="font-display text-2xl font-semibold leading-tight text-ink md:text-[2rem]">{s.title}</h4>
            <p className="mt-3 max-w-md text-base leading-relaxed text-ink-2 md:text-[17px]">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

type StepView = { id: string; group: Group; frame: TableFrame; added: string[]; seps: NonNullable<TableFrame["separator"]>[] };

function Stage({
  step,
  replay,
  truth,
  model,
  modelAccuracy,
  metrics,
  compact,
}: {
  step: StepView;
  replay: Replay;
  truth: DfaPayload;
  model: string;
  modelAccuracy: number | null;
  metrics: StoryProps["metrics"];
  compact: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px -15% 0px" });
  const { frame, group } = step;
  // while a counterexample is being worked in, keep showing the guess it refuted (faded)
  const previous = group.kind === "learn" || group.kind === "fix" ? replay.frames.slice(0, group.frames[0] + 1).reverse().find((x) => x.hypothesis)?.hypothesis : undefined;
  const hyp = frame.hypothesis ?? previous;
  const stale = !frame.hypothesis && !!previous;
  const cex = group.kind === "counterexample" || group.kind === "abort" ? frame.counterexample : undefined;
  const aborted = group.kind === "abort" ? replay.frames[group.frames[group.frames.length - 1]].aborted : undefined;
  const runner = useRunner(hyp ?? null, cex?.string ?? null, inView);
  const isResult = group.kind === "result";
  const freshCols = step.seps.map((s) => s.experiment);
  const focus = step.seps.flatMap((s) => [s.a, s.b]);
  const exact = hyp ? shortestDifference(hyp, truth) === null : false;
  return (
    <div ref={ref} className="grid-paper relative w-full overflow-hidden rounded-3xl border border-line bg-panel/85 p-3.5 shadow-[var(--shadow)] md:p-6">
      <SheetMarks />
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs md:text-sm">
        <span className="text-ink-2">
          Round <span className="font-mono text-ink">{frame.round}</span>
          {aborted ? <span className="text-lamp"> stopped</span> : null}
        </span>
        <span className="text-muted">
          <span className="tabular font-mono text-ink">{isResult && metrics?.membership_queries ? int(metrics.membership_queries) : int(frame.queries)}</span>{" "}
          {isResult ? "strings asked in total" : "strings asked so far"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 md:mt-5 md:gap-6">
        <div className="relative">
          <ObservationTable frame={frame} ask={replay.ask} fresh={step.added} freshCols={freshCols} focus={focus} compact={compact} dimmed={!!aborted} />
          {aborted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-xl border border-[color:var(--lamp)] bg-panel/95 p-3 text-center shadow-[var(--shadow)]"
            >
              <div className="font-display text-2xl font-semibold text-lamp md:text-3xl">
                {aborted.S} × {aborted.E}
              </div>
              <div className="mt-1 text-xs leading-snug text-ink-2">prefixes × columns, past the state budget</div>
            </motion.div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          {isResult && hyp && !compact ? (
            <LightTable truth={truth} candidate={hyp} candidateLabel="Extracted DFA" maxHeight={170} />
          ) : (
          <div className={cn("relative rounded-xl border border-line bg-bg/40", compact ? "h-[8.5rem]" : "h-[15rem]")}>
            <AnimatePresence mode="wait" initial={false}>
              {hyp ? (
                <motion.div
                  key={hyp.states.join("|") + hyp.accepting.join("|")}
                  className="absolute inset-0 grid place-items-center p-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: stale ? 0.35 : 1 }}
                  exit={{ opacity: 0 }}
                >
                  <AutomatonGraph
                    automaton={hyp}
                    active={runner.state ? [runner.state] : isResult ? [hyp.start] : []}
                    activeEdge={runner.edge}
                    tokenKey={runner.index}
                    verdict={runner.done && cex ? (cex.hypothesisAccepts ? "accept" : "reject") : isResult && exact ? "accept" : null}
                    zoomable={false}
                    maxHeight={compact ? 130 : 228}
                    radius={compact ? 15 : 21}
                    ariaLabel={`Hypothesis DFA with ${hyp.num_states} states; each state [w] is named by the access string w of its row.`}
                  />
                </motion.div>
              ) : (
                <motion.div key="none" className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-muted md:text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  No guess yet: the table is still being filled.
                </motion.div>
              )}
            </AnimatePresence>
            {hyp && (
              <span className="absolute left-2 top-1.5 text-[10.5px] text-muted md:text-xs">
                {isResult ? "the extracted DFA" : stale ? "previous guess, being revised" : "current guess"}
                {exact && !stale && <span className="ml-2 text-accept">✓ matches the ground truth</span>}
              </span>
            )}
          </div>
          )}
          <Teacher step={step} cex={cex} runnerDone={runner.done} model={model} modelAccuracy={modelAccuracy} metrics={metrics} truth={truth} compact={compact} />
        </div>
      </div>
    </div>
  );
}

function Teacher({
  step,
  cex,
  runnerDone,
  model,
  modelAccuracy,
  metrics,
  truth,
  compact,
}: {
  step: StepView;
  cex?: { string: string; hypothesisAccepts: boolean };
  runnerDone: boolean;
  model: string;
  modelAccuracy: number | null;
  metrics: StoryProps["metrics"];
  truth: DfaPayload;
  compact: boolean;
}) {
  if (cex) {
    const truthAccepts = runDfa(truth, cex.string).accepted;
    return (
      <div className="space-y-2">
        <StripTape input={cex.string} size={compact ? "xs" : "sm"} label="Counterexample" animateKey={cex.string} />
        <div
          className={cn(
            "grid items-center gap-x-3 gap-y-1 text-xs transition-opacity duration-300",
            compact ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[7.5rem_auto]",
            runnerDone ? "opacity-100" : "opacity-40",
          )}
          aria-live="polite"
        >
          <span className="text-muted">the {model}</span>
          <VerdictTag accepted={!cex.hypothesisAccepts} className="justify-self-start" compact={compact} />
          <span className="text-muted">the guess</span>
          <VerdictTag accepted={cex.hypothesisAccepts} className="justify-self-start" compact={compact} />
          <span className="text-muted">the truth</span>
          <VerdictTag accepted={truthAccepts} className="justify-self-start" compact={compact} />
        </div>
      </div>
    );
  }
  if (step.group.kind === "result" && metrics) {
    const rows = [
      { label: `the ${model}, accuracy`, value: modelAccuracy ?? 0, color: "var(--series-rf)" },
      { label: "extracted DFA, accuracy", value: metrics.test.accuracy, color: "var(--accept)" },
      { label: "DFA agrees with the model", value: metrics.test.fidelity ?? 0, color: "var(--ink-2)" },
    ];
    return (
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-2">{r.label}</span>
              <span className="tabular font-mono text-ink">{(r.value * 100).toFixed(1)}%</span>
            </div>
            <Meter value={r.value} color={r.color} label={`${r.label}: ${(r.value * 100).toFixed(1)}%`} className="mt-1" />
          </div>
        ))}
      </div>
    );
  }
  const f = step.frame;
  return (
    <p className="text-xs leading-relaxed text-ink-2 md:text-sm">
      <span className="font-mono text-ink">{f.S.length}</span> {f.S.length === 1 ? "row" : "rows"} above the line,{" "}
      <span className="font-mono text-ink">{f.ext.length}</span> below,{" "}
      <span className="font-mono text-ink">{f.E.length}</span> column{f.E.length === 1 ? "" : "s"}. In the cells, <span className="font-mono text-accept">1</span>{" "}
      means the model accepts prefix + suffix and <span className="font-mono text-reject">0</span> that it rejects it.
    </p>
  );
}

/** Walks the read head through `input` on `dfa` once whenever the input changes (and is in view). */
function useRunner(dfa: DfaPayload | null, input: string | null, enabled: boolean) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    setIndex(input === null ? -1 : reduce ? (input?.length ?? 0) - 1 : -1);
  }, [input, reduce, dfa]);
  useEffect(() => {
    if (!enabled || input === null || reduce) return;
    if (index >= input.length - 1) return;
    const t = window.setTimeout(() => setIndex((i) => i + 1), index < 0 ? 500 : 420);
    return () => window.clearTimeout(t);
  }, [enabled, input, index, reduce]);
  if (!dfa || input === null) return { state: null as string | null, edge: null, index, done: false };
  const run = runDfa(dfa, input.slice(0, index + 1));
  const last = run.steps[run.steps.length - 1];
  return {
    state: index < 0 ? dfa.start : run.final,
    edge: last ? { from: last.from, to: last.to } : null,
    index,
    done: index >= input.length - 1,
  };
}

/** If the replay cannot be verified against the recorded trace, show the recorded rounds only. */
function RoundsFallback({ learning }: { learning: LearningTrace }) {
  return (
    <ol className="space-y-3">
      {(learning.rounds ?? []).map((r) => (
        <li key={r.round} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-3 text-ink-2">
          <span className="font-display text-lg font-semibold text-ink">Round {r.round}</span>
          <span>
            {r.S} prefixes, {r.E} columns
          </span>
          <span>{r.aborted ? "stopped at the state budget" : `${r.states} states`}</span>
          {r.counterexample !== null && (
            <span>
              counterexample <span className="font-mono text-ink">{showString(r.counterexample)}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
