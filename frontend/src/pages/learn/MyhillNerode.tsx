import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useWidth } from "@/components/charts/Charts";
import { Term } from "@/components/ui/Term";
import type { DfaPayload, SuffixRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { walk } from "./model";

const pairKey = (p: string, q: string) => (p < q ? `${p}\u0000${q}` : `${q}\u0000${p}`);
const show = (s: string) => (s === "" ? "ε" : s);
const COMPACT_FROM = 10; // states; beyond this the cells become a heat grid without text

/**
 * The table-filling picture of Myhill–Nerode: for every pair of states, the shortest suffix that
 * sends one to an accepting state and the other to a rejecting one. If every cell is filled, no two
 * states can merge and the DFA is minimal. Pointing at a cell spotlights that pair in the graph;
 * a click pins it. Big machines get a compact heat grid (darker = longer suffix needed).
 */
export function MyhillNerode({
  dfa,
  rows,
  pair,
  onPair,
}: {
  dfa: DfaPayload;
  rows: SuffixRow[];
  pair: [string, string] | null;
  onPair: (p: [string, string] | null) => void;
}) {
  const states = dfa.states;
  const n = states.length;
  const lookup = useMemo(() => new Map(rows.map((r) => [pairKey(r.p, r.q), r.suffix])), [rows]);
  const [pinned, setPinned] = useState<[string, string] | null>(null);
  const [boxRef, width] = useWidth<HTMLDivElement>();
  // Roving focus: the table is one tab stop; arrow keys walk the staircase (row r has r + 1 cells).
  const [cursor, setCursor] = useState<[number, number]>([0, 0]);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, ri: number, ci: number) => {
    const rows = n - 1;
    let r = ri;
    let c = ci;
    if (e.key === "ArrowRight") c += 1;
    else if (e.key === "ArrowLeft") c -= 1;
    else if (e.key === "ArrowDown") r += 1;
    else if (e.key === "ArrowUp") r -= 1;
    else if (e.key === "Home") c = 0;
    else if (e.key === "End") c = r;
    else return;
    e.preventDefault();
    r = Math.max(0, Math.min(rows - 1, r));
    c = Math.max(0, Math.min(r, c));
    setCursor([r, c]);
    cells.current.get(`${r}-${c}`)?.focus();
  };
  const accepting = new Set(dfa.accepting);
  const compact = n >= COMPACT_FROM;
  const longest = rows.reduce((m, r) => Math.max(m, r.suffix.length), 0);
  const textCell = Math.min(76, Math.max(36, 14 + Math.max(1, longest) * 8));
  const heatCell = width > 0 ? Math.max(14, Math.min(28, Math.floor((width - 40) / Math.max(1, n - 1)) - 3)) : 18;
  const cell = compact ? heatCell : textCell;
  const missing = n > 1 ? (n * (n - 1)) / 2 - rows.length : 0;

  const explain = (() => {
    if (!pair) return null;
    const [p, q] = pair;
    const w = lookup.get(pairKey(p, q));
    if (w === undefined) return `${p} and ${q} behave the same on every suffix, so they could be merged.`;
    const ep = walk(dfa, p, w);
    const eq = walk(dfa, q, w);
    const acc = (s: string | null) => (s !== null && accepting.has(s) ? "accepts" : "rejects");
    if (w === "") return `${p} ${acc(p)} right away and ${q} ${acc(q)}: the empty suffix ε already tells them apart.`;
    return `After reading ${w}, ${p} lands in ${ep ?? "no state"} and ${acc(ep)}, while ${q} lands in ${eq ?? "no state"} and ${acc(eq)}.`;
  })();

  const heat = (w: string) => `color-mix(in srgb, var(--ink-2) ${Math.round(12 + 60 * (longest ? w.length / longest : 0))}%, transparent)`;

  return (
    <section aria-labelledby="mn-title" className="space-y-4 border-t border-line pt-8">
      <div>
        <h3 id="mn-title" className="font-display text-2xl font-semibold text-ink">
          Why it cannot be smaller
        </h3>
        <p className="mt-1 text-ink-2">
          {n === 1 ? (
            <>A single state has nothing to tell apart: the machine gives the same answer to every string.</>
          ) : (
            <>
              {compact ? "Each cell stands for a pair of states and the shortest suffix" : "Each cell holds the shortest suffix"} that leads one state of
              the pair to accept and the other to reject. Every pair has one, so by <Term k="myhill-nerode">Myhill–Nerode</Term> no two states can be
              merged. Point at a cell (or use the arrow keys) to light its pair in the graph; click to pin it.
            </>
          )}
        </p>
      </div>

      {n > 1 && (
        <>
          <div ref={boxRef} className="-mx-1 overflow-x-auto px-1 pb-1">
            <table className="border-separate border-spacing-[3px] font-mono text-xs" onMouseLeave={() => onPair(pinned)}>
              <caption className="sr-only">Shortest distinguishing suffix for every pair of states</caption>
              <tbody>
                {states.slice(1).map((rowState, ri) => (
                  <tr key={rowState}>
                    <th scope="row" className={cn("pr-1.5 text-right font-medium text-ink-2", compact && "text-[10px]")} style={{ height: compact ? cell : 30 }}>
                      {rowState}
                    </th>
                    {states.slice(0, ri + 1).map((colState, ci) => {
                      const k = pairKey(rowState, colState);
                      const w = lookup.get(k);
                      const on = pair !== null && pairKey(pair[0], pair[1]) === k;
                      const isPinned = pinned !== null && pairKey(pinned[0], pinned[1]) === k;
                      return (
                        <td key={colState} className="p-0">
                          <button
                            type="button"
                            ref={(el) => {
                              if (el) cells.current.set(`${ri}-${ci}`, el);
                              else cells.current.delete(`${ri}-${ci}`);
                            }}
                            tabIndex={cursor[0] === ri && cursor[1] === ci ? 0 : -1}
                            onKeyDown={(e) => onKey(e, ri, ci)}
                            onMouseEnter={() => onPair([colState, rowState])}
                            onFocus={() => {
                              setCursor([ri, ci]);
                              onPair([colState, rowState]);
                            }}
                            onBlur={() => onPair(pinned)}
                            onClick={() => {
                              setPinned(isPinned ? null : [colState, rowState]);
                              onPair([colState, rowState]);
                            }}
                            aria-label={w === undefined ? `${colState} and ${rowState}: no separating suffix` : `${colState} and ${rowState}: separated by ${show(w)}`}
                            aria-pressed={isPinned}
                            title={`${colState}, ${rowState}: ${w === undefined ? "equivalent" : show(w)}`}
                            style={{ width: cell, height: compact ? cell : 30, background: compact && w !== undefined && !on ? heat(w) : undefined }}
                            className={cn(
                              "block truncate border transition-colors",
                              compact ? "rounded-[4px]" : "rounded-md px-1",
                              w === undefined
                                ? "border-[color:var(--reject)] bg-reject-soft text-reject"
                                : compact
                                  ? "border-transparent"
                                  : w === ""
                                    ? "border-line bg-panel-2/40 text-muted"
                                    : "border-line bg-panel text-ink",
                              on && "border-[color:var(--lamp)] bg-lamp text-ink",
                              on && !compact && "bg-lamp-soft",
                              isPinned && "ring-2 ring-[color:var(--lamp)] ring-offset-1 ring-offset-[color:var(--bg)]",
                            )}
                          >
                            {compact ? <span className="sr-only">{w === undefined ? "≡" : show(w)}</span> : w === undefined ? "≡" : show(w)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td />
                  {states.slice(0, -1).map((s) => (
                    <th key={s} scope="col" className={cn("pt-1 text-center font-medium text-ink-2", compact && "text-[10px]")}>
                      {compact ? <span className="inline-block [writing-mode:vertical-rl] rotate-180">{s}</span> : s}
                    </th>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {compact && (
            <div className="flex items-center gap-2 text-xs text-muted" aria-hidden>
              <span className="h-3 w-3 rounded-[3px]" style={{ background: heat("") }} />
              ε
              <span className="h-2 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${heat("")}, ${heat("x".repeat(longest))})` }} />
              <span className="h-3 w-3 rounded-[3px]" style={{ background: heat("x".repeat(longest)) }} />
              {longest} {longest === 1 ? "symbol" : "symbols"}
            </div>
          )}
          <p className="min-h-10 text-sm text-ink-2" aria-live="polite">
            {explain ?? (missing > 0 ? `${missing} pairs have no separating suffix, so this machine is not minimal.` : `${rows.length} pairs, all told apart.`)}
          </p>
        </>
      )}
    </section>
  );
}
