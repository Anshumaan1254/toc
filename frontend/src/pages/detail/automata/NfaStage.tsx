import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { Tape, type TapeStatus } from "@/components/tape/Tape";
import { StringInput } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import type { NfaPayload, NfaStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExampleRows, RunConsole, RunPath, RunStatus, useDemoRun, useStageRun, type ExampleSet } from "./DfaStage";
import { setKey, setLabel } from "./model";
import { BlueprintStage, KeyHints, NotationLegend, PlayerBar, StageSheet, StatePill, useElementWidth, useMediaQuery, usePlayerKeys, useStageGeometry } from "./ui";
import { isNfaTrace, type Runner } from "./useRunner";

function SetPills({ states, accepting }: { states: string[]; accepting: Set<string> }) {
  if (states.length === 0) return <StatePill tone="reject">∅</StatePill>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {states.map((q) => (
        <StatePill key={q} tone={accepting.has(q) ? "accept" : "lamp"}>
          {q}
        </StatePill>
      ))}
    </span>
  );
}

type Edge = { from: string; to: string; kind: "symbol" | "epsilon" };

/** The arrows one NFA step travels: symbol arrows into the move set, then ε arrows into the states the closure adds. */
function stepEdges(nfa: NfaPayload, step: NfaStep) {
  const move = new Set(step.move);
  const symbol: Edge[] = [];
  for (const q of step.from) for (const t of nfa.transitions[q]?.[step.symbol] ?? []) if (move.has(t)) symbol.push({ from: q, to: t, kind: "symbol" });
  const added = new Set(step.to.filter((q) => !move.has(q)));
  const epsilon: Edge[] = [];
  for (const q of step.to) for (const t of nfa.epsilon[q] ?? []) if (added.has(t)) epsilon.push({ from: q, to: t, kind: "epsilon" });
  return { symbol, epsilon };
}

export function NfaStage({
  nfa,
  runner,
  examples,
  dfaStateOf,
  demo,
}: {
  nfa: NfaPayload;
  runner: Runner;
  examples: ExampleSet;
  /** Set key -> name of the subset-construction DFA state for that set. */
  dfaStateOf: Map<string, string>;
  demo?: string;
}) {
  const narrow = useMediaQuery("(max-width: 639px)");
  const reduce = useReducedMotion();
  const wide = nfa.states.length > 12;
  const maxHeight = narrow ? 420 : wide ? 520 : 440;
  const col = useElementWidth<HTMLDivElement>();
  const { layout, rankdir, radius, pan } = useStageGeometry(nfa, narrow, col.width, maxHeight);
  const accepting = useMemo(() => new Set(nfa.accepting), [nfa]);
  const ref = useDemoRun(runner, demo);
  const stage = useStageRun(runner, narrow);

  const r = runner.result;
  const trace = runner.live && r && isNfaTrace(r.trace) ? r.trace : null;
  const idx = runner.index;
  const step = trace && idx >= 0 ? trace.steps[idx] : null;
  const edges = useMemo(() => (step ? stepEdges(nfa, step) : null), [nfa, step]);

  // Each step is two beats: symbol tokens carry the set to move(), then ε tokens grow it to its closure
  // while the tape head stays put. `closedKey` is the step whose closure beat has arrived.
  const stepKey = `${r?.string ?? ""}:${idx}`;
  const half = !!edges && edges.epsilon.length > 0 && !reduce;
  const [closedKey, setClosedKey] = useState("");
  const stepMs = runner.player.stepMs;
  useEffect(() => {
    if (!half) return;
    const t = window.setTimeout(() => setClosedKey(stepKey), Math.round(stepMs * 0.55));
    return () => window.clearTimeout(t);
  }, [half, stepKey, stepMs]);
  useEffect(() => setClosedKey(""), [r]);
  const phase: "move" | "closure" = half && closedKey !== stepKey ? "move" : "closure";

  const active = trace ? (step ? (phase === "move" ? step.move : step.to) : trace.initial) : [];
  const liveEdges = !edges ? undefined : phase === "move" || !half ? edges.symbol : edges.epsilon;
  const visited = useMemo(() => {
    if (!trace) return undefined;
    const out: { from: string; to: string }[] = [];
    for (const s of trace.steps.slice(0, Math.max(0, idx))) {
      const e = stepEdges(nfa, s);
      out.push(...e.symbol, ...e.epsilon);
    }
    if (half && phase === "closure" && edges) out.push(...edges.symbol);
    return out;
  }, [trace, idx, nfa, half, phase, edges]);
  usePlayerKeys(ref, runner.player, !!trace);
  const verdict = runner.done && r && phase === "closure" ? (r.accepted ? "accept" : "reject") : null;
  const tapeInput = trace ? r!.string : runner.draft;
  const status: TapeStatus = !trace ? "idle" : runner.done ? (r!.accepted ? "accepted" : "rejected") : "running";
  const sets = useMemo(() => (trace ? [trace.initial, ...trace.steps.map((s) => s.to)] : []), [trace]);
  const symbols = useMemo(() => (trace ? trace.steps.map((s) => s.symbol) : []), [trace]);
  const dfaState = trace ? dfaStateOf.get(setKey(active)) : undefined;
  const closureAdds = step ? step.to.filter((q) => !step.move.includes(q)) : [];
  const startClosure = trace ? trace.initial.filter((q) => !nfa.start.includes(q)) : [];

  return (
    <div ref={ref}>
      <div ref={stage.ref} className="scroll-mt-24">
      <BlueprintStage>
        <div className={cn("grid", !wide && "lg:grid-cols-[minmax(0,1fr)_minmax(320px,368px)] lg:grid-rows-[minmax(0,1fr)_auto]")}>
          <div ref={col.ref} className={cn("relative flex min-h-[300px] min-w-0 flex-col px-3 pb-4 pt-4 sm:px-6 sm:pt-5", !wide && "lg:col-start-1 lg:row-start-1")}>
            <NotationLegend epsilon={nfa.has_epsilon} className="relative z-10 max-w-[calc(100%-7rem)]" />
            {pan && <p className="t-caption relative z-10 mt-2 max-w-[calc(100%-7rem)] text-muted">The sheet scrolls sideways and follows the active states.</p>}
            <StageSheet layout={layout} pan={pan} focus={active.length ? active : nfa.start}>
              {(sheetHeight) => (
                <AutomatonGraph
                  automaton={nfa}
                  active={active}
                  activeEdge={null}
                  activeEdges={liveEdges}
                  visited={visited}
                  tokenKey={`${stepKey}:${phase}`}
                  tokenMs={phase === "closure" && half ? 180 : Math.min(420, Math.round(stepMs * (half ? 0.5 : 0.6)))}
                  verdict={verdict}
                  rankdir={rankdir}
                  radius={radius}
                  maxHeight={sheetHeight ?? maxHeight}
                  zoomable={!pan}
                  animateIn={nfa.states.length <= 24}
                  ariaLabel={`State diagram of the ${nfa.states.length}-state NFA${nfa.has_epsilon ? " with ε-moves (dashed)" : ""}. Start ${setLabel(nfa.start)}; accepting ${setLabel(nfa.accepting)}.${trace ? ` Active states: ${setLabel(active)}.` : ""}`}
                />
              )}
            </StageSheet>
          </div>

          <div className={cn("min-w-0 border-t border-line bg-[color:var(--bg)]/55 px-4 pb-5 pt-2 backdrop-blur-[2px] sm:px-6", !wide && "lg:col-start-1 lg:row-start-2")}>
            <div className="flex justify-center">
              <div className="min-w-0 max-w-full">
                <Tape input={tapeInput} head={trace ? idx + 1 : 0} status={status} size={narrow ? "sm" : "lg"} />
              </div>
            </div>
            <div className="mt-3 min-h-[4.5rem] space-y-2 text-sm text-ink-2">
              {!trace ? (
                <p>
                  The machine starts with <span className="font-mono text-ink">{setLabel(nfa.start)}</span> active
                  {nfa.has_epsilon ? ", plus every state its ε-moves reach." : "."}
                </p>
              ) : !step ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span>Active before reading anything:</span>
                  <SetPills states={trace.initial} accepting={accepting} />
                  {startClosure.length > 0 && <span className="text-muted">({startClosure.length} added by ε-moves from the start)</span>}
                </p>
              ) : (
                <>
                  <p className="font-mono text-[13px] text-ink">
                    move({setLabel(step.from)}, <span className="text-lamp">{step.symbol}</span>) = {setLabel(step.move)}
                    {closureAdds.length > 0 && <span className="text-ink-2">, ε-closure adds {setLabel(closureAdds)}</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span>Active now:</span>
                    <SetPills states={step.to} accepting={accepting} />
                    {step.to.length === 0 ? (
                      <span className="text-reject">no state survives, so the NFA is stuck and will reject</span>
                    ) : step.to.length > 1 ? (
                      <span className="text-muted">the machine is in all of these at once</span>
                    ) : null}
                  </p>
                </>
              )}
              {trace && dfaState && (
                <p className="text-xs text-muted">
                  The subset construction calls this set DFA state <span className="font-mono text-ink-2">{dfaState}</span>.
                </p>
              )}
            </div>
            <PlayerBar player={runner.player} total={trace ? runner.steps : 0} stepLabel="Symbol" name="run" className="mt-3" />
            <KeyHints className="mt-2" />
          </div>

          <RunConsole
            wide={wide}
            intro={
              <div>
                <h2 className="font-display text-[28px] font-semibold leading-tight text-ink">Run a string</h2>
                <p className="mt-1.5 text-sm text-ink-2">
                  An NFA can be in several states at once. On each symbol every active state follows all of its arrows
                  {nfa.has_epsilon ? (
                    <>
                      , then the set grows by its <Term k="epsilon-closure">ε-closure</Term>
                    </>
                  ) : null}
                  . The string is accepted if any active state is accepting.
                </p>
              </div>
            }
            input={
              <StringInput
                value={runner.draft}
                onChange={runner.setDraft}
                onSubmit={() => stage.go(runner.draft)}
                alphabet={nfa.alphabet}
                submitLabel="Run the string"
                loading={runner.pending}
                label="Your string"
              />
            }
            examples={<ExampleRows examples={examples} onPick={stage.go} current={trace ? r!.string : undefined} wrongLabel="Machine is wrong" />}
            status={
              <RunStatus runner={runner} family="truth" isTruth={false}>
                {trace && sets.length > 1 && <RunPath states={sets.map(setLabel)} symbols={symbols} index={idx} onSeek={runner.player.seek} />}
              </RunStatus>
            }
          />
        </div>
      </BlueprintStage>
      </div>
    </div>
  );
}
