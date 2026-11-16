import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { Play } from "lucide-react";
import { Term } from "@/components/ui/Term";
import { showString } from "@/lib/meta";
import type { DfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { accessStrings, plural, runFrom, type SeparationTable } from "./model";
import { StatePill, useElementWidth, useMediaQuery } from "./ui";

interface Pair {
  i: number; // row (later state)
  j: number; // column (earlier state), j < i
}

function cellSize(n: number): number {
  if (n <= 6) return 68;
  if (n <= 9) return 52;
  if (n <= 14) return 38;
  return Math.max(9, Math.floor(560 / (n - 1)));
}

/** Cool drafting blue for suffixes found early, lamp amber for the longest ones. */
function shade(len: number, longest: number): string {
  const t = longest === 0 ? 0.35 : len / longest;
  const p = Math.round(8 + t * 80);
  return `color-mix(in srgb, var(--lamp) ${p}%, color-mix(in srgb, var(--ink-2) 22%, var(--panel)))`;
}

const inkOn = (len: number, longest: number) => ((longest === 0 ? 0.35 : len / longest) > 0.55 ? "var(--bg)" : "var(--ink)");

function RunLine({ dfa, from, suffix }: { dfa: DfaPayload; from: string; suffix: string }) {
  const { path, end } = runFrom(dfa, from, suffix);
  const ok = end !== null && dfa.accepting.includes(end);
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {path.map((q, k) => (
        <span key={k} className="inline-flex items-center gap-1">
          {k > 0 && <span className="font-mono text-[11px] text-muted">{suffix[k - 1]}</span>}
          <StatePill tone={k === path.length - 1 ? (ok ? "accept" : "reject") : "neutral"}>{q}</StatePill>
        </span>
      ))}
      <span className={cn("ml-1.5 text-sm font-medium", ok ? "text-accept" : "text-reject")}>{ok ? "accepts" : "rejects"}</span>
    </div>
  );
}

export function WhyMinimal({
  dfa,
  table,
  minimumStates,
  languageId,
  equivalent,
  onRun,
}: {
  dfa: DfaPayload;
  table: SeparationTable;
  minimumStates: number;
  languageId: string;
  equivalent: boolean | null;
  onRun: (s: string) => void;
}) {
  const n = dfa.states.length;
  const reduce = useReducedMotion();
  const access = useMemo(() => accessStrings(dfa), [dfa]);
  const reachable = access.size;
  const initial = useMemo<Pair>(() => {
    let best: Pair = { i: 1, j: 0 };
    let bestLen = -1;
    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) {
        const w = table.suffix(dfa.states[j], dfa.states[i]);
        const len = w === null ? 999 : w.length;
        if (len > bestLen) {
          bestLen = len;
          best = { i, j };
        }
      }
    }
    return best;
  }, [dfa, table, n]);
  const [sel, setSel] = useState<Pair>(initial);
  const gridRef = useRef<HTMLDivElement>(null);
  const shown = useInView(gridRef, { once: true, margin: "0px 0px -10% 0px" });
  const root = useElementWidth<HTMLDivElement>();
  const besideDetail = useMediaQuery("(min-width: 1024px)");
  const withLabels = n <= 22;
  // Fit the triangle to the room it has (beside the pair detail on desktop, full width on phones).
  const room = root.width > 0 ? (besideDetail ? Math.min(600, root.width * 0.52) : root.width) : 560;
  const fit = Math.floor((room - (withLabels ? 34 : 0)) / Math.max(1, n - 1)) - 3;
  const size = Math.max(n <= 14 ? 26 : 6, Math.min(cellSize(n), fit));
  const withText = n <= 14;

  if (n < 2) {
    return <p className="text-ink-2">A one-state DFA has no pairs to separate: it is trivially minimal.</p>;
  }

  const p = dfa.states[sel.j];
  const q = dfa.states[sel.i];
  const w = table.suffix(p, q);
  const unseparated = table.pairs - table.separated;
  const minimal = unseparated === 0 && reachable === n;

  const move = (e: KeyboardEvent) => {
    let { i, j } = sel;
    if (e.key === "ArrowUp") i = Math.max(Math.max(1, j + 1), i - 1);
    else if (e.key === "ArrowDown") i = Math.min(n - 1, i + 1);
    else if (e.key === "ArrowLeft") j = Math.max(0, j - 1);
    else if (e.key === "ArrowRight") j = Math.min(i - 1, j + 1);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = i - 1;
    else return;
    e.preventDefault();
    setSel({ i, j });
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${i}-${j}"]`)?.focus();
  };

  const xs = access.get(p);
  const ys = access.get(q);

  return (
    <div ref={root.ref} className="space-y-8">
      <p className="max-w-3xl text-ink-2">
        <Term k="myhill-nerode">Myhill–Nerode</Term> says two states may merge only if no continuation (a suffix) makes one accept and the other
        reject. Each cell holds the shortest suffix that separates a pair of states. The cells light up in the order the table-filling
        algorithm finds them: first the pairs that ε already separates, then suffixes of length 1, and so on.
      </p>

      <div className="grid items-start gap-10 lg:grid-cols-[auto_minmax(0,1fr)]">
        {/* the triangle */}
        <div className="max-w-full overflow-x-auto pb-2">
          <div
            ref={gridRef}
            role="group"
            aria-label={`Separation table for ${n} states: ${table.separated} of ${table.pairs} pairs separated. Use the arrow keys to move between pairs.`}
            onKeyDown={move}
            className="inline-grid gap-[3px]"
            style={{ gridTemplateColumns: `${withLabels ? "auto " : ""}repeat(${n - 1}, ${size}px)` }}
          >
            {Array.from({ length: n - 1 }, (_, r) => {
              const i = r + 1;
              return [
                withLabels && (
                  <div key={`row-${i}`} className="flex items-center justify-end pr-2 font-mono text-xs text-ink-2" style={{ height: size }}>
                    {dfa.states[i]}
                  </div>
                ),
                ...Array.from({ length: n - 1 }, (_, j) => {
                  if (j >= i) return <div key={`${i}-${j}`} aria-hidden style={{ height: size }} />;
                  const sfx = table.suffix(dfa.states[j], dfa.states[i]);
                  const len = sfx === null ? 0 : sfx.length;
                  const active = sel.i === i && sel.j === j;
                  const delay = reduce ? 0 : (sfx === null ? table.longest + 1 : len) * 260 + (i + j) * 6;
                  return (
                    <button
                      key={`${i}-${j}`}
                      type="button"
                      data-cell={`${i}-${j}`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setSel({ i, j })}
                      onMouseEnter={() => setSel({ i, j })}
                      onFocus={() => setSel({ i, j })}
                      aria-label={`${dfa.states[j]} and ${dfa.states[i]}: ${sfx === null ? "no separating suffix" : `separated by ${showString(sfx)}`}`}
                      aria-pressed={active}
                      className={cn(
                        "relative grid place-items-center overflow-hidden rounded-[5px] font-mono leading-none text-ink outline-offset-2",
                        size >= 52 ? "text-[13px]" : "text-[11px]",
                        active && "ring-2 ring-[color:var(--ink)] ring-offset-1 ring-offset-[color:var(--bg)]",
                      )}
                      style={{
                        height: size,
                        background: sfx === null ? "var(--reject-soft)" : shade(len, table.longest),
                        color: sfx === null ? "var(--reject)" : inkOn(len, table.longest),
                        opacity: shown || reduce ? 1 : 0,
                        transform: shown || reduce ? "scale(1)" : "scale(0.55)",
                        transition: `opacity 380ms ease ${delay}ms, transform 420ms cubic-bezier(.2,.8,.2,1.2) ${delay}ms`,
                      }}
                    >
                      {withText && <span className="max-w-full truncate px-0.5">{sfx === null ? "≡" : showString(sfx)}</span>}
                    </button>
                  );
                }),
              ];
            })}
            {withLabels && (
              <>
                <div aria-hidden />
                {dfa.states.slice(0, n - 1).map((s) => (
                  <div key={`col-${s}`} className="truncate pt-1 text-center font-mono text-xs text-ink-2" aria-hidden>
                    {s}
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span>short suffix</span>
            <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${shade(0, 1)}, ${shade(1, 1)})` }} />
            <span>long suffix</span>
          </div>
        </div>

        {/* the selected pair */}
        <div className="min-w-0 space-y-5 lg:pt-2" aria-live="polite">
          <div>
            <p className="text-sm text-muted">Selected pair</p>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">
              <span className="font-mono">{p}</span> <span className="text-muted">and</span> <span className="font-mono">{q}</span>
            </p>
          </div>
          {w === null ? (
            <p className="text-ink-2">No suffix separates these two states: they accept exactly the same continuations, so they could be merged.</p>
          ) : (
            <>
              <p className="text-ink-2">
                Shortest separating suffix:{" "}
                <span className="rounded-md bg-lamp-soft px-2 py-0.5 font-mono text-[15px] text-ink">{showString(w)}</span>
                {w === "" && <span className="text-muted"> (one accepts already, the other does not)</span>}
              </p>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs text-muted">From {p}, read {showString(w)}</p>
                  <RunLine dfa={dfa} from={p} suffix={w} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-muted">From {q}, read {showString(w)}</p>
                  <RunLine dfa={dfa} from={q} suffix={w} />
                </div>
              </div>
              {xs !== undefined && ys !== undefined && (
                <div className="space-y-2 border-t border-line pt-4 text-sm text-ink-2">
                  <p>
                    As whole strings: {p} is reached by <span className="font-mono text-ink">{showString(xs)}</span> and {q} by{" "}
                    <span className="font-mono text-ink">{showString(ys)}</span>. Append {showString(w)} to both and the machine answers differently, so
                    no smaller DFA can treat them as one state.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[xs + w, ys + w].map((s, k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onRun(s)}
                        className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 font-mono text-[13px] text-ink hover:border-[color:var(--lamp)]/60 hover:bg-lamp-soft"
                      >
                        {showString(s)} <Play size={11} className="text-muted" aria-hidden />
                        <span className="sr-only">Run it</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="max-w-3xl border-l-2 border-[color:var(--lamp)] pl-5 text-ink-2">
        {minimal ? (
          <p>
            All {plural(table.pairs, "pair")} of states are separated and every state is reachable from the start, so no two states can merge:{" "}
            <span className="text-ink">{plural(n, "state")} is the minimum</span> for the language this DFA accepts.
            {equivalent === false && minimumStates < n && (
              <>
                {" "}
                That language is not {languageId}, though: the true language needs only {plural(minimumStates, "state")}. The extra states encode
                the mistakes it learned.
              </>
            )}
            {equivalent === true && minimumStates === n && <> That matches the minimal DFA for {languageId}.</>}
          </p>
        ) : (
          <p>
            {unseparated > 0 && <>{plural(unseparated, "pair")} of states cannot be separated by any suffix, so they could merge. </>}
            {reachable < n && <>{plural(n - reachable, "state")} cannot be reached from the start and could be dropped. </>}
            This DFA is not minimal.
          </p>
        )}
        {table.longest > 0 && <p className="mt-2 text-sm text-muted">The longest shortest-suffix is {plural(table.longest, "symbol")} long.</p>}
      </div>
    </div>
  );
}
