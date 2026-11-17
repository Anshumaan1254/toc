import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { Tape, type TapeStatus } from "@/components/tape/Tape";
import { ErrorState, Kbd, StringInput, VerdictStamp } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api";
import { duration } from "@/lib/meta";
import type { DfaPayload, Family } from "@/lib/types";
import { cn } from "@/lib/utils";
import { trapStates } from "./model";
import { BlueprintStage, KeyHints, NotationLegend, PlayerBar, StageSheet, StatePill, StringChip, useElementWidth, useMediaQuery, usePlayerKeys, useStageGeometry } from "./ui";
import { isDfaTrace, useScrollTo, type Runner } from "./useRunner";

export interface ExampleSet {
  accepted: string[];
  rejected: string[];
  wrong: string[];
}

export function ExampleRows({ examples, onPick, current, wrongLabel }: { examples: ExampleSet; onPick: (s: string) => void; current?: string; wrongLabel: string }) {
  const rows: { label: string; tone: "accept" | "reject" | "lamp"; items: string[]; title: string }[] = [
    { label: "In the language", tone: "accept", items: examples.accepted, title: "The ground truth accepts this string" },
    { label: "Not in it", tone: "reject", items: examples.rejected, title: "The ground truth rejects this string" },
    { label: wrongLabel, tone: "lamp", items: examples.wrong, title: "This machine and the ground truth disagree here" },
  ];
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium text-ink-2">Or pick a string</p>
      {rows
        .filter((r) => r.items.length > 0)
        .map((r) => (
          <div key={r.label} className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-2">
            <span className="pt-1.5 text-xs text-muted">{r.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {r.items.map((s) => (
                <StringChip key={s} value={s} tone={r.tone} title={r.title} onClick={() => onPick(s)} active={current === s} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/** Agreement with the ground truth plus timing, under the verdict stamp. */
function OutcomeNote({ runner, family, isTruth }: { runner: Runner; family: Family; isTruth: boolean }) {
  const r = runner.result;
  return (
    <div aria-live="polite" className="min-h-[3.25rem] text-sm">
      {runner.done && r && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} className="space-y-1">
          {isTruth ? (
            <p className="text-ink-2">This machine defines the language, so its answer is the ground truth.</p>
          ) : r.correct ? (
            <p className="text-ink-2">
              <span className="font-medium text-accept">Correct.</span> The ground truth also {r.truth ? "accepts" : "rejects"} it.
            </p>
          ) : (
            <p className="text-ink-2">
              <span className="font-medium text-reject">Wrong.</span> The ground truth {r.truth ? "accepts" : "rejects"} this string
              {family === "learned" ? ", so the learned machine is not the true language here." : "."}
            </p>
          )}
          <p className="text-muted">
            Decided in <span className="font-mono text-ink-2">{duration(r.time_ms / 1000)}</span> on the server, {r.length} {r.length === 1 ? "symbol" : "symbols"}.
          </p>
        </motion.div>
      )}
    </div>
  );
}

/** Verdict stamp, progress line, agreement with the truth, and the run itself (children). */
export function RunStatus({ runner, family, isTruth, children }: { runner: Runner; family: Family; isTruth: boolean; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const r = runner.result;
  const tracing = runner.live && !!r;
  return (
    <div className="space-y-3">
      {runner.error ? (
        <ErrorState message={errorMessage(runner.error)} onRetry={runner.retry} />
      ) : (
        <>
          <div className="flex min-h-[3.25rem] items-center gap-4">
            <VerdictStamp accepted={runner.done && r ? r.accepted : null} size="lg" />
            <AnimatePresence mode="wait">
              {!runner.done && (
                <motion.p key={tracing ? "running" : "idle"} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-muted">
                  {runner.pending ? (
                    "Running…"
                  ) : tracing ? (
                    `Reading symbol ${Math.min(runner.index + 2, runner.steps)} of ${runner.steps}…`
                  ) : (
                    <>
                      Press <Kbd>Enter</Kbd> to feed it in.
                    </>
                  )}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <OutcomeNote runner={runner} family={family} isTruth={isTruth} />
        </>
      )}
      {children}
    </div>
  );
}

/** The console beside (or, for big machines, under) the graph. */
export function RunConsole({ wide, intro, input, examples, status }: { wide: boolean; intro: ReactNode; input: ReactNode; examples: ReactNode; status: ReactNode }) {
  return (
    <aside
      aria-label="Run a string"
      className={cn(
        "min-w-0 border-t border-line bg-panel/70 p-5 backdrop-blur-sm sm:p-6",
        wide ? "grid gap-6 lg:grid-cols-2 lg:gap-x-12" : "flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-t-0",
      )}
    >
      <div className="flex min-w-0 flex-col gap-6">
        {intro}
        {input}
        {examples}
      </div>
      <div className={cn("min-w-0", wide ? "lg:border-l lg:border-line lg:pl-12" : "mt-auto border-t border-line pt-5")}>{status}</div>
    </aside>
  );
}

export function RunPath({ states, symbols, index, onSeek }: { states: string[]; symbols: string[]; index: number; onSeek: (i: number) => void }) {
  return (
    <div className={cn("max-h-36 overflow-y-auto pr-1", states.length > 24 && "max-h-28")} data-lenis-prevent>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label="The run, state by state">
        {states.map((q, i) => {
          const step = i - 1;
          const tone = step === index ? "lamp" : step < index ? "neutral" : "muted";
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && (
                <span className="font-mono text-[11px] text-muted" aria-hidden>
                  {symbols[i - 1]}
                </span>
              )}
              <button type="button" onClick={() => onSeek(step)} className="rounded-md" aria-label={i === 0 ? `Start in ${q}` : `After reading ${symbols[i - 1]}: ${q}`}>
                <StatePill tone={tone}>{q}</StatePill>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Starts one example run when the stage first scrolls into view, so the machine is already moving.
 * Never replaces a string the visitor (or a ?s= link) already put in the field.
 */
export function useDemoRun(runner: Runner, demo: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const autoRan = useRef(false);
  const { result, pending, run, draft } = runner;
  useEffect(() => {
    if (!seen || autoRan.current || demo === undefined) return;
    autoRan.current = true;
    if (!result && !pending && draft === "") run(demo);
  }, [seen, demo, result, pending, run, draft]);
  return ref;
}

/**
 * On a phone the console sits under the graph and the tape, so a run started from it would play
 * off-screen: bring the stage into view first, then run.
 */
export function useStageRun(runner: Runner, narrow: boolean) {
  const sheet = useScrollTo();
  const { run, setDraft } = runner;
  const go = (s: string) => {
    if (!narrow) return run(s);
    setDraft(s);
    sheet.scroll(() => run(s));
  };
  return { ref: sheet.ref, go };
}

export function DfaStage({
  dfa,
  notes,
  runner,
  examples,
  family,
  isTruth,
  demo,
  note,
}: {
  dfa: DfaPayload;
  notes: Record<string, string>;
  runner: Runner;
  examples: ExampleSet;
  family: Family;
  isTruth: boolean;
  demo?: string;
  /** A remark under the legend (e.g. why an unconverged L* machine is so big). */
  note?: ReactNode;
}) {
  const narrow = useMediaQuery("(max-width: 639px)");
  const wide = dfa.states.length > 12;
  const maxHeight = narrow ? 420 : wide ? 560 : 440;
  const col = useElementWidth<HTMLDivElement>();
  const { layout, rankdir, radius, pan } = useStageGeometry(dfa, narrow, col.width, maxHeight);
  const traps = useMemo(() => trapStates(dfa), [dfa]);
  const ref = useDemoRun(runner, demo);
  const stage = useStageRun(runner, narrow);

  const r = runner.result;
  const trace = runner.live && r && isDfaTrace(r.trace) ? r.trace : null;
  const idx = runner.index;
  const current = trace ? (idx < 0 ? trace.start : trace.steps[idx]?.to ?? null) : null;
  const step = trace && idx >= 0 ? trace.steps[idx] : null;
  const edge = step && step.from !== null && step.to !== null ? { from: step.from, to: step.to } : null;
  const verdict = runner.done && r ? (r.accepted ? "accept" : "reject") : null;
  const tapeInput = trace ? r!.string : runner.draft;
  const status: TapeStatus = !trace ? "idle" : runner.done ? (r!.accepted ? "accepted" : "rejected") : "running";
  const states = useMemo(() => (trace ? [trace.start, ...trace.steps.map((s) => s.to ?? "–")] : []), [trace]);
  const symbols = useMemo(() => (trace ? trace.steps.map((s) => s.symbol) : []), [trace]);
  const stateNote = current ? notes[current] : undefined;
  const visited = useMemo(
    () => (trace ? trace.steps.slice(0, Math.max(0, idx)).flatMap((s) => (s.from !== null && s.to !== null ? [{ from: s.from, to: s.to }] : [])) : undefined),
    [trace, idx],
  );
  usePlayerKeys(ref, runner.player, !!trace);

  return (
    <div ref={ref}>
      <div ref={stage.ref} className="scroll-mt-24">
      <BlueprintStage>
        <div className={cn("grid", !wide && "lg:grid-cols-[minmax(0,1fr)_minmax(320px,368px)] lg:grid-rows-[minmax(0,1fr)_auto]")}>
          {/* graph */}
          <div ref={col.ref} className={cn("relative flex min-h-[300px] min-w-0 flex-col px-3 pb-4 pt-4 sm:px-6 sm:pt-5", !wide && "lg:col-start-1 lg:row-start-1")}>
            <NotationLegend hasTrap={traps.size > 0} className="relative z-10 max-w-[calc(100%-7rem)]" />
            {(note || pan) && (
              <p className="t-caption relative z-10 mt-2 max-w-[calc(100%-7rem)] text-muted">
                {note}
                {note && pan ? " " : null}
                {pan && "The sheet scrolls sideways and follows the read head."}
              </p>
            )}
            <StageSheet layout={layout} pan={pan} focus={current ? [current] : [dfa.start]}>
              {(sheetHeight) => (
                <AutomatonGraph
                  automaton={dfa}
                  active={current ? [current] : []}
                  activeEdge={edge}
                  visited={visited}
                  tokenKey={`${r?.string ?? ""}:${idx}`}
                  verdict={verdict}
                  notes={notes}
                  rankdir={rankdir}
                  radius={radius}
                  maxHeight={sheetHeight ?? maxHeight}
                  zoomable={!pan}
                  animateIn={dfa.states.length <= 24}
                  ariaLabel={`State diagram of the ${dfa.states.length}-state DFA. Start state ${dfa.start}; accepting ${dfa.accepting.join(", ") || "none"}.${current ? ` The read head is in ${current}.` : ""}`}
                />
              )}
            </StageSheet>
          </div>

          {/* tape + player */}
          <div className={cn("min-w-0 border-t border-line bg-[color:var(--bg)]/55 px-4 pb-5 pt-2 backdrop-blur-[2px] sm:px-6", !wide && "lg:col-start-1 lg:row-start-2")}>
            <div className="flex justify-center">
              <div className="min-w-0 max-w-full">
                <Tape input={tapeInput} head={trace ? idx + 1 : 0} status={status} size={narrow ? "sm" : "lg"} />
              </div>
            </div>
            <div className="mt-3 flex min-h-[2.75rem] flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <p className="min-w-0 text-sm text-ink-2">
                {!trace ? (
                  <>
                    The machine waits in its start state <span className="font-mono text-ink">{dfa.start}</span>.
                  </>
                ) : step ? (
                  <>
                    <span className="font-mono text-ink">
                      δ({step.from}, <span className="text-lamp">{step.symbol}</span>) = {step.to}
                    </span>
                    {stateNote && <span className="text-muted">: {stateNote}</span>}
                  </>
                ) : (
                  <>
                    Start in <span className="font-mono text-ink">{trace.start}</span>
                    {stateNote && <span className="text-muted">: {stateNote}</span>}
                  </>
                )}
              </p>
              {runner.done && r && (
                <p className="text-sm text-ink-2">
                  Ends in <span className="font-mono text-ink">{trace?.final ?? "–"}</span>, {r.accepted ? "an accepting state" : "not an accepting state"}.
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
                  Each symbol follows exactly one arrow, so the machine is always in one state. It accepts if it ends in a double circle.
                </p>
              </div>
            }
            input={
              <StringInput
                value={runner.draft}
                onChange={runner.setDraft}
                onSubmit={() => stage.go(runner.draft)}
                alphabet={dfa.alphabet}
                submitLabel="Run the string"
                loading={runner.pending}
                label="Your string"
              />
            }
            examples={<ExampleRows examples={examples} onPick={stage.go} current={trace ? r!.string : undefined} wrongLabel="Machine is wrong" />}
            status={
              <RunStatus runner={runner} family={family} isTruth={isTruth}>
                {trace && states.length > 1 && <RunPath states={states} symbols={symbols} index={idx} onSeek={runner.player.seek} />}
              </RunStatus>
            }
          />
        </div>
      </BlueprintStage>
      </div>
    </div>
  );
}
