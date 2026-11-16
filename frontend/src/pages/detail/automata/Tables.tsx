import { useMemo, type ReactNode } from "react";
import { Play } from "lucide-react";
import { showString } from "@/lib/meta";
import type { DfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { accessStrings, trapStates } from "./model";

export function StartIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" className={className} aria-hidden>
      <line x1="0" y1="5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 1.5 L17 5 L11 8.5 z" fill="currentColor" />
    </svg>
  );
}

export function AcceptIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Scroll box for tall tables: its own wheel scrolling (Lenis is told to leave it alone), sticky header. */
export function TableScroller({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div
      className={cn("max-h-[540px] overflow-auto rounded-2xl border border-line bg-panel/60", className)}
      data-lenis-prevent
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  );
}

const th = "sticky top-0 z-[1] border-b border-line bg-panel px-4 py-2.5 text-left text-xs font-medium text-ink-2";
const td = "border-b border-line/70 px-4 py-2.5 align-middle";

export function StateTable({
  dfa,
  describe,
  describeLabel,
  onRun,
}: {
  dfa: DfaPayload;
  describe?: (state: string) => ReactNode;
  describeLabel?: string;
  onRun: (s: string) => void;
}) {
  const access = useMemo(() => accessStrings(dfa), [dfa]);
  const traps = useMemo(() => trapStates(dfa), [dfa]);
  const accepting = useMemo(() => new Set(dfa.accepting), [dfa]);
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-ink-2">
        One row per state. The shortest string that reaches a state is a handy name for what the state means; press it to run that string
        through the machine above.
      </p>
      <TableScroller label="State table">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">States of the DFA with their role and the shortest string reaching each one</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>State</th>
              <th scope="col" className={th}>Start</th>
              <th scope="col" className={th}>Accepting</th>
              <th scope="col" className={th}>Shortest string reaching it</th>
              {describe && <th scope="col" className={th}>{describeLabel ?? "Note"}</th>}
            </tr>
          </thead>
          <tbody>
            {dfa.states.map((q) => {
              const w = access.get(q);
              return (
                <tr key={q} className={cn("transition-colors hover:bg-panel-2/50", traps.has(q) && "text-muted")}>
                  <th scope="row" className={cn(td, "font-mono text-[15px] font-medium text-ink")}>
                    {q}
                    {traps.has(q) && <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-sans text-[11px] font-normal text-muted">trap</span>}
                  </th>
                  <td className={td}>{q === dfa.start ? <span className="inline-flex items-center gap-1.5 text-ink"><StartIcon />yes</span> : <span className="text-muted">–</span>}</td>
                  <td className={td}>
                    {accepting.has(q) ? (
                      <span className="inline-flex items-center gap-1.5 text-accept">
                        <AcceptIcon />
                        accepts
                      </span>
                    ) : (
                      <span className="text-muted">rejects</span>
                    )}
                  </td>
                  <td className={td}>
                    {w === undefined ? (
                      <span className="text-muted">unreachable</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRun(w)}
                        className="group inline-flex items-center gap-2 rounded-lg border border-line px-2 py-0.5 font-mono text-[13px] text-ink hover:border-[color:var(--lamp)]/60 hover:bg-lamp-soft"
                        title="Run this string through the machine"
                      >
                        {showString(w)}
                        <Play size={11} className="text-muted group-hover:text-lamp" aria-hidden />
                        <span className="sr-only">Run it</span>
                      </button>
                    )}
                  </td>
                  {describe && <td className={cn(td, "text-ink-2")}>{describe(q)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroller>
    </div>
  );
}

export function TransitionTable({ dfa }: { dfa: DfaPayload }) {
  const traps = useMemo(() => trapStates(dfa), [dfa]);
  const accepting = useMemo(() => new Set(dfa.accepting), [dfa]);
  const loops = useMemo(() => dfa.states.reduce((n, q) => n + dfa.alphabet.filter((s) => dfa.transitions[q]?.[s] === q).length, 0), [dfa]);
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-ink-2">
        The transition function δ as a table: row = current state, column = symbol read, cell = next state. A DFA has exactly one entry per
        cell, {dfa.states.length} × {dfa.alphabet.length} = {dfa.states.length * dfa.alphabet.length} in all{loops > 0 ? `, ${loops} of them loops back to the same state` : ""}.
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <StartIcon /> start state
        </span>
        <span className="inline-flex items-center gap-1.5 text-accept">
          <AcceptIcon /> <span className="text-ink-2">accepting state</span>
        </span>
        {traps.size > 0 && <span className="text-muted">faded rows are trap states</span>}
      </div>
      <TableScroller label="Transition table" className="inline-block max-w-full">
        <table className="border-separate border-spacing-0 font-mono text-[15px]">
          <caption className="sr-only">Transition function: next state for each state and symbol</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(th, "pr-10 font-sans")}>
                δ
              </th>
              {dfa.alphabet.map((s) => (
                <th key={s} scope="col" className={cn(th, "min-w-[96px] text-center font-mono text-sm text-ink")}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dfa.states.map((q) => (
              <tr key={q} className={cn("transition-colors hover:bg-panel-2/50", traps.has(q) && "opacity-55")}>
                <th scope="row" className={cn(td, "pr-10 text-left font-medium text-ink")}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex w-[18px] justify-center text-ink-2">{q === dfa.start && <StartIcon />}</span>
                    <span className="inline-flex w-4 justify-center text-accept">{accepting.has(q) && <AcceptIcon />}</span>
                    {q}
                    <span className="sr-only">
                      {q === dfa.start ? ", start" : ""}
                      {accepting.has(q) ? ", accepting" : ""}
                    </span>
                  </span>
                </th>
                {dfa.alphabet.map((s) => {
                  const t = dfa.transitions[q]?.[s];
                  return (
                    <td key={s} className={cn(td, "text-center", t === q ? "text-ink-2" : "text-ink")}>
                      {t ?? <span className="text-muted">∅</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
    </div>
  );
}
