import { useMemo } from "react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { Tape, type TapeStatus } from "@/components/tape/Tape";
import { StringInput } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import type { NfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExampleRows, RunConsole, RunPath, RunStatus, useDemoRun, type ExampleSet } from "./DfaStage";
import { setKey, setLabel } from "./model";
import { BlueprintStage, NotationLegend, PlayerBar, StatePill, stateRadius, useGraphBox, useMediaQuery } from "./ui";
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
  const wide = nfa.states.length > 12;
  const rankdir = narrow && nfa.states.length > 3 ? "TB" : "LR";
  const box = useGraphBox(nfa, rankdir);
  const radius = useMemo(() => stateRadius(nfa), [nfa]);
  const accepting = useMemo(() => new Set(nfa.accepting), [nfa]);
  const ref = useDemoRun(runner, demo);

  const r = runner.result;
  const trace = runner.live && r && isNfaTrace(r.trace) ? r.trace : null;
  const idx = runner.index;
  const step = trace && idx >= 0 ? trace.steps[idx] : null;
  const active = trace ? (step ? step.to : trace.initial) : [];
  const verdict = runner.done && r ? (r.accepted ? "accept" : "reject") : null;
  const tapeInput = trace ? r!.string : runner.draft;
  const status: TapeStatus = !trace ? "idle" : runner.done ? (r!.accepted ? "accepted" : "rejected") : "running";
  const sets = useMemo(() => (trace ? [trace.initial, ...trace.steps.map((s) => s.to)] : []), [trace]);
  const symbols = useMemo(() => (trace ? trace.steps.map((s) => s.symbol) : []), [trace]);
  const dfaState = trace ? dfaStateOf.get(setKey(active)) : undefined;
  const closureAdds = step ? step.to.filter((q) => !step.move.includes(q)) : [];
  const startClosure = trace ? trace.initial.filter((q) => !nfa.start.includes(q)) : [];

  return (
    <div ref={ref}>
      <BlueprintStage>
        <div className={cn("grid", !wide && "lg:grid-cols-[minmax(0,1fr)_minmax(320px,368px)] lg:grid-rows-[minmax(0,1fr)_auto]")}>
          <div className={cn("relative flex min-h-[300px] min-w-0 flex-col px-3 pb-4 pt-4 sm:px-6 sm:pt-5", !wide && "lg:col-start-1 lg:row-start-1")}>
            <NotationLegend epsilon={nfa.has_epsilon} className="relative z-10 max-w-[calc(100%-7rem)]" />
            <div className="mx-auto my-auto w-full py-3" style={{ maxWidth: Math.max(300, box.width * 1.55) }}>
              <AutomatonGraph
                automaton={nfa}
                active={active}
                activeEdge={null}
                verdict={verdict}
                rankdir={rankdir}
                radius={radius}
                maxHeight={narrow ? 420 : wide ? 520 : 440}
                zoomable
                ariaLabel={`State diagram of the ${nfa.states.length}-state NFA${nfa.has_epsilon ? " with ε-moves (dashed)" : ""}. Start ${setLabel(nfa.start)}; accepting ${setLabel(nfa.accepting)}.${trace ? ` Active states: ${setLabel(active)}.` : ""}`}
              />
            </div>
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
                    {step.to.length === 0 && <span className="text-reject">no state survives, so the NFA is stuck and will reject</span>}
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
                onSubmit={() => runner.run(runner.draft)}
                alphabet={nfa.alphabet}
                submitLabel="Run the string"
                loading={runner.pending}
                label="Your string"
              />
            }
            examples={<ExampleRows examples={examples} onPick={runner.run} current={trace ? r!.string : undefined} wrongLabel="Machine is wrong" />}
            status={
              <RunStatus runner={runner} family="truth" isTruth={false}>
                {trace && sets.length > 1 && <RunPath states={sets.map(setLabel)} symbols={symbols} index={idx} onSeek={runner.player.seek} />}
              </RunStatus>
            }
          />
        </div>
      </BlueprintStage>
    </div>
  );
}
