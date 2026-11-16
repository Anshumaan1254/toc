import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useTracePlayer } from "@/components/graph/useTracePlayer";
import { Tape } from "@/components/tape/Tape";
import { VerdictStamp } from "@/components/ui/primitives";
import { BorderBeam } from "@/components/magicui/border-beam";
import { showString } from "@/lib/meta";
import type { LearnResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GraphViewport } from "./GraphViewport";
import type { Frame, Run } from "./model";

const stepMsFor = (n: number) => Math.max(170, Math.min(600, Math.round(5200 / Math.max(1, n))));

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * Plays one tested string through the machine. Mounted fresh for every run (keyed by run id),
 * so the trace player always starts from the first symbol, then reports each frame upward.
 */
function RunView({ run, onFrame }: { run: Run; onFrame: (f: Frame) => void }) {
  const { trace, string, accepted } = run.result;
  const steps = trace.steps;
  const player = useTracePlayer(steps.length, { stepMs: stepMsFor(steps.length) });
  const { play } = player;
  // Start on mount; this effect runs after the player's own reset effect.
  useEffect(() => {
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const i = player.index;
  const step = i >= 0 ? steps[i] : null;
  const state = step ? step.to : trace.start;
  const done = player.done;
  useEffect(() => {
    onFrame({
      runId: run.id,
      active: state ? [state] : [],
      edge: step && step.from && step.to ? { from: step.from, to: step.to } : null,
      tokenKey: i,
      done,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, done, run.id]);

  const caption = done
    ? `Finished in ${trace.final ?? "no state"}, ${accepted ? "an accepting" : "a rejecting"} state.`
    : step
      ? null
      : `Starting in ${trace.start}.`;

  return (
    <div className="space-y-3">
      <Tape input={string} head={i + 1} status={done ? (accepted ? "accepted" : "rejected") : "running"} size="md" label="Tested string" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center" role="group" aria-label="Playback">
          <IconButton label="Replay from the start" onClick={player.restart}>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton label="Previous symbol" onClick={player.prev} disabled={i < 0}>
            <ChevronLeft size={17} />
          </IconButton>
          <IconButton label={player.playing ? "Pause" : "Play"} onClick={player.toggle} disabled={steps.length === 0}>
            {player.playing ? <Pause size={15} /> : <Play size={15} />}
          </IconButton>
          <IconButton label="Next symbol" onClick={player.next} disabled={done}>
            <ChevronRight size={17} />
          </IconButton>
          <IconButton label="Skip to the verdict" onClick={player.jumpToEnd} disabled={done}>
            <SkipForward size={15} />
          </IconButton>
        </div>
        <p className="min-w-0 flex-1 font-mono text-sm text-ink-2" aria-live="off">
          {step && !done ? (
            <>
              δ({step.from}, <span className="text-lamp">{step.symbol}</span>) = {step.to}
            </>
          ) : (
            <span className="font-sans">{caption}</span>
          )}
        </p>
        {done ? (
          <VerdictStamp accepted={accepted} className="-my-2 shrink-0" />
        ) : (
          <span className="tabular text-sm text-muted">
            {Math.max(0, i + 1)} / {steps.length} {steps.length === 1 ? "symbol" : "symbols"}
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {done ? `The learned DFA ${accepted ? "accepts" : "rejects"} ${showString(string)}.` : ""}
      </p>
    </div>
  );
}

export function MachinePanel({
  result,
  run,
  frame,
  onFrame,
  pair,
  busy,
}: {
  result: LearnResult;
  run: Run | null;
  frame: Frame | null;
  onFrame: (f: Frame) => void;
  pair: [string, string] | null;
  busy: boolean;
}) {
  const reduce = useReducedMotion();
  const dfa = result.automaton;
  const live = run && frame && frame.runId === run.id ? frame : null;
  const dimmed = pair ? dfa.states.filter((s) => s !== pair[0] && s !== pair[1]) : [];
  const verdict = live?.done && run ? (run.result.accepted ? "accept" : "reject") : null;
  const describe = `Learned DFA with ${dfa.states.length} ${dfa.states.length === 1 ? "state" : "states"} over {${dfa.alphabet.join(", ")}}. Start state ${dfa.start}; accepting ${
    dfa.accepting.join(", ") || "none"
  }. Transitions: ${dfa.states.map((p) => dfa.alphabet.map((c) => `${p} on ${c} to ${dfa.transitions[p]?.[c] ?? "nowhere"}`).join(", ")).join("; ")}.`;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-panel/80 shadow-[var(--shadow)]">
      <div className="grid-paper absolute inset-0" aria-hidden />
      {busy && !reduce && <BorderBeam size={180} duration={2.4} borderWidth={2} colorFrom="var(--lamp)" colorTo="var(--accept)" />}

      <div className="relative px-4 pb-2 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium text-ink-2">The learned DFA, minimized</p>
          <GraphLegend />
        </div>
        <div className={cn("transition-opacity duration-300", busy && "opacity-40")}>
          <div className="mt-2">
            <GraphViewport
              dfa={dfa}
              active={live?.active ?? []}
              edge={live?.edge ?? null}
              tokenKey={live ? `${live.runId}-${live.tokenKey}` : undefined}
              verdict={verdict}
              dimmed={dimmed}
              focus={pair ? [pair[0], pair[1]] : (live?.active ?? [])}
              ariaLabel={describe}
            />
          </div>
        </div>
        <AnimatePresence>
          {busy && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center text-sm font-medium text-ink"
              role="status"
            >
              <span className="rounded-full border border-line bg-panel px-4 py-2 shadow-[var(--shadow)]">Learning a new machine…</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="relative border-t border-line bg-panel/90 px-4 py-4 sm:px-5">
        {run ? (
          <RunView key={run.id} run={run} onFrame={onFrame} />
        ) : (
          <p className="py-2 text-sm text-muted">Test a string and the read head will walk it through this machine, one symbol at a time.</p>
        )}
      </div>
    </div>
  );
}

function GraphLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
          <line x1="1" y1="6" x2="17" y2="6" stroke="var(--ink-2)" strokeWidth="1.5" />
          <path d="M15 2 L21 6 L15 10 z" fill="var(--ink-2)" />
        </svg>
        start
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="6" fill="none" stroke="var(--ink-2)" strokeWidth="1.3" />
          <circle cx="7" cy="7" r="3.6" fill="none" stroke="var(--ink-2)" strokeWidth="1.1" />
        </svg>
        accepting
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-lamp shadow-[0_0_8px_var(--lamp)]" aria-hidden />
        read head
      </li>
    </ul>
  );
}
