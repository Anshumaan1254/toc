import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { Tape } from "@/components/tape/Tape";
import { ErrorState, Skeleton, VerdictStamp } from "@/components/ui/primitives";
import { errorMessage, useAutomaton } from "@/lib/api";
import { runDfa, runNfa } from "@/lib/automata";
import type { AutomatonRecord, DfaPayload, NfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isDfa, stateNotes, subsetsOf } from "../data";
import { useDfaRun } from "../useDfaRun";
import { binValue, discoveredAt, mooreColouring, pumpSplit, trail, withStart } from "./logic";

export interface StageProps {
  /** On screen and the tab visible: loops may advance. */
  live: boolean;
  /** Inline on small screens: shorter graphs. */
  compact?: boolean;
}

/* ------------------------------------------------------------------ shared */

/** Frame counter for one run (0..count-1) that holds on the last frame, then starts the next cycle. */
function useRunFrames(count: number, live: boolean, stepMs = 850, holdMs = 2200) {
  const reduce = useReducedMotion();
  const [st, setSt] = useState({ frame: 0, cycle: 0 });
  const last = st.frame >= count - 1;
  useEffect(() => {
    if (reduce || !live || count <= 0) return;
    const t = window.setTimeout(
      () => setSt((s) => (s.frame >= count - 1 ? { frame: 0, cycle: s.cycle + 1 } : { frame: s.frame + 1, cycle: s.cycle })),
      last ? holdMs : st.frame === 0 ? Math.min(stepMs, 600) : stepMs,
    );
    return () => window.clearTimeout(t);
  }, [st, count, live, reduce, stepMs, holdMs, last]);
  if (reduce) return { frame: Math.max(0, count - 1), cycle: 0, done: true };
  const frame = Math.min(st.frame, Math.max(0, count - 1));
  return { frame, cycle: st.cycle, done: frame >= count - 1 };
}

function Pending({ queries }: { queries: UseQueryResult<AutomatonRecord>[] }) {
  const failed = queries.find((q) => q.error);
  if (failed)
    return (
      <div className="flex h-full min-h-56 items-center">
        <ErrorState
          message={errorMessage(failed.error)}
          onRetry={() => queries.forEach((q) => q.error && void q.refetch())}
          className="w-full"
        />
      </div>
    );
  return <Skeleton className="h-full min-h-56 w-full" />;
}

function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-ink", className)}>{children}</span>;
}

const show = (s: string) => (s === "" ? "ε" : s);
const setText = (xs: string[]) => `{${xs.join(", ")}}`;

function Body({ caption, children, footer, className }: { caption: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-4", className)}>
      <p className="text-sm leading-snug text-ink-2">{caption}</p>
      <div className="relative flex min-h-0 flex-1 flex-col items-stretch justify-center">{children}</div>
      {footer}
    </div>
  );
}

function Outcome({ accepted, label }: { accepted: boolean | null; label?: ReactNode }) {
  if (accepted === null) return <span className="text-xs text-muted">{label ?? "reading…"}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs", accepted ? "bg-accept-soft text-accept" : "bg-reject-soft text-reject")}>
      {label ? <>{label} </> : null}
      {accepted ? "accepts ✓" : "rejects ✕"}
    </span>
  );
}

/* ------------------------------------------------------------------ 1. a DFA run */

const DFA_STRINGS = ["abaabb", "abba", "bbabb"];

export function DfaStage({ live, compact }: StageProps) {
  const q = useAutomaton("L7", "dfa");
  const dfa = isDfa(q.data?.automaton) ? q.data.automaton : undefined;
  const [k, setK] = useState(0);
  const input = DFA_STRINGS[k % DFA_STRINGS.length];
  const run = useDfaRun(dfa, input, k, { stepMs: 620, typeMs: 70 });
  const notes = useMemo(() => stateNotes(dfa), [dfa]);
  useEffect(() => {
    if (run.phase !== "done" || !live) return;
    const t = window.setTimeout(() => setK((v) => v + 1), 2200);
    return () => window.clearTimeout(t);
  }, [run.phase, live]);
  if (!dfa) return <Pending queries={[q]} />;
  const note = run.current ? notes[run.current] : undefined;
  return (
    <Body
      caption={
        <>
          L7, strings that end in <Mono>abb</Mono>: the ground-truth DFA, {dfa.states.length} states and {dfa.num_transitions} transitions.
        </>
      }
      footer={
        <div className="space-y-2">
          <p className="min-h-5 text-sm text-ink-2">
            <Mono className="text-lamp">{run.current}</Mono> {note && <>remembers: {note}</>}
          </p>
          <div className="flex items-end justify-between gap-4">
            <Tape input={run.tape} head={run.head} status={run.status} size={compact ? "sm" : "md"} className="min-w-0 flex-1" label="Input tape for L7" />
            <div className="w-36 shrink-0" aria-hidden>
              <VerdictStamp accepted={run.phase === "done" ? run.accepted : null} />
            </div>
          </div>
        </div>
      }
    >
      <AutomatonGraph
        automaton={dfa}
        active={run.current ? [run.current] : []}
        activeEdge={run.edge}
        tokenKey={run.tokenKey}
        verdict={run.verdict}
        notes={notes}
        radius={24}
        zoomable={false}
        maxHeight={compact ? 200 : 320}
      />
    </Body>
  );
}

/* ------------------------------------------------------------------ 2. an NFA with ε-moves */

const NFA_STRINGS = ["babb", "abab", "aabb"];

export function NfaStage({ live, compact }: StageProps) {
  const q = useAutomaton("L7", "nfa");
  const thompson = useAutomaton("L1", "nfa");
  const nfa: NfaPayload | undefined = q.data?.automaton.kind === "nfa" ? q.data.automaton : undefined;
  const [k, setK] = useState(0);
  const input = NFA_STRINGS[k % NFA_STRINGS.length];
  const res = useMemo(() => (nfa ? runNfa(nfa, input) : null), [nfa, input]);
  const { frame, cycle, done } = useRunFrames(input.length + 1, live, 1000, 2400);
  useEffect(() => setK(cycle), [cycle]);
  if (!nfa || !res) return <Pending queries={[q]} />;
  const set = res.sets[Math.min(frame, res.sets.length - 1)] ?? [];
  const th = thompson.data?.automaton.kind === "nfa" ? thompson.data.automaton : null;
  const eps = th ? Object.values(th.epsilon).reduce((n, xs) => n + xs.length, 0) : null;
  return (
    <Body
      caption={
        <>
          L7 again, now as an NFA: <Mono>{nfa.start.join(", ")}</Mono> reads anything and, on an <Mono>a</Mono>, also guesses that the final{" "}
          <Mono>abb</Mono> starts right here. Every guess runs in parallel.
        </>
      }
      footer={
        <div className="space-y-2">
          <p className="min-h-10 text-sm text-ink-2">
            Active after {frame} {frame === 1 ? "symbol" : "symbols"}: <Mono className="text-lamp">{setText(set)}</Mono>{" "}
            <span className="text-muted">
              ({set.length} {set.length === 1 ? "state" : "states at once"})
            </span>
          </p>
          <div className="flex items-end justify-between gap-4">
            <Tape input={input} head={frame} status={done ? (res.accepted ? "accepted" : "rejected") : "running"} size={compact ? "sm" : "md"} className="min-w-0 flex-1" />
            <Outcome accepted={done ? res.accepted : null} />
          </div>
          {th && eps !== null && (
            <p className="border-t border-line pt-3 text-xs text-muted">
              Most NFAs in this project come from Thompson&apos;s construction, which also glues pieces together with ε-moves: L1&apos;s has{" "}
              {th.states.length} states and {eps} ε-moves.
            </p>
          )}
        </div>
      }
    >
      <AutomatonGraph
        automaton={nfa}
        active={set}
        verdict={done ? (res.accepted ? "accept" : "reject") : null}
        radius={26}
        zoomable={false}
        maxHeight={compact ? 160 : 230}
        ariaLabel={`NFA for L7 with ${nfa.states.length} states; the lit states are the current active set.`}
      />
    </Body>
  );
}

/* ------------------------------------------------------------------ 3. subset construction */

export function SubsetStage({ live, compact }: StageProps) {
  const q = useAutomaton("L9", "nfa");
  const rec = q.data;
  const nfa: NfaPayload | undefined = rec?.automaton.kind === "nfa" ? rec.automaton : undefined;
  const sc = rec?.subset_construction;
  const { frame } = useRunFrames((sc?.steps.length ?? 0) + 1, live, 720, 3200);
  const subsets = useMemo(() => subsetsOf(sc?.dfa), [sc]);
  if (!nfa || !sc) return <Pending queries={[q]} />;
  const disc = discoveredAt(sc.dfa.start, sc.steps, frame);
  const step = frame > 0 ? sc.steps[frame - 1] : null;
  const done = new Map<string, string>();
  sc.steps.slice(0, frame).forEach((st) => done.set(`${st.from}\u0000${st.symbol}`, st.to));
  const accepting = new Set(sc.dfa.accepting);
  return (
    <Body
      caption={
        <>
          L9, the third symbol from the end is 1. The {nfa.states.length}-state NFA guesses where that symbol is; the subset construction turns
          every set of states it can be in into one DFA state.
        </>
      }
      footer={
        <p className="min-h-10 text-sm text-ink-2">
          {step ? (
            <>
              From <Mono>{step.from}</Mono> on <Mono className="text-lamp">{step.symbol}</Mono> the NFA can reach <Mono>{setText(step.closure)}</Mono>
              {step.new ? <span className="text-lamp">: a new state, {step.to}.</span> : <span className="text-muted">: that is {step.to} again.</span>}
            </>
          ) : (
            <>
              Start from the ε-closure of the NFA&apos;s start state: <Mono>{setText(subsets[sc.dfa.start] ?? [])}</Mono> becomes{" "}
              <Mono>{sc.dfa.start}</Mono>.
            </>
          )}{" "}
          {frame === sc.steps.length && (
            <span className="text-ink">
              Done: {nfa.states.length} NFA states, {sc.dfa.states.length} DFA states.
            </span>
          )}
        </p>
      }
    >
      <AutomatonGraph
        automaton={nfa}
        active={step ? step.closure : nfa.start}
        radius={compact ? 18 : 22}
        zoomable={false}
        maxHeight={compact ? 90 : 120}
        ariaLabel={`L9 NFA with ${nfa.states.length} states; the lit states are the set being built.`}
      />
      <table className="mt-4 w-full border-collapse font-mono text-[13px]" aria-label="Subset construction table for L9">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 pr-2 font-normal">DFA</th>
            <th className="py-1 pr-2 font-normal">set of NFA states</th>
            {sc.dfa.alphabet.map((a) => (
              <th key={a} className={cn("w-14 py-1 text-center font-normal", step?.symbol === a && "text-lamp")}>
                on {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sc.dfa.states.map((st) => {
            const seen = disc.has(st);
            const fresh = !!step?.new && step.to === st;
            const isFrom = step?.from === st;
            return (
              <tr key={st} className={cn("border-t border-line transition-opacity duration-300", !seen && "opacity-25")}>
                <td className={cn("py-[3px] pr-2", isFrom ? "text-lamp" : "text-ink")}>
                  <span className="inline-block w-3 text-muted">{st === sc.dfa.start ? "→" : ""}</span>
                  {st}
                  {accepting.has(st) && <span className="text-accept">*</span>}
                </td>
                <td className="py-[3px] pr-2">
                  <span className={cn("rounded px-1 transition-colors duration-300", fresh ? "bg-lamp-soft text-ink" : "text-ink-2")}>
                    {seen ? setText(subsets[st] ?? []) : "?"}
                  </span>
                </td>
                {sc.dfa.alphabet.map((a) => {
                  const to = done.get(`${st}\u0000${a}`);
                  const now = step?.from === st && step.symbol === a;
                  return (
                    <td key={a} className="py-[3px] text-center">
                      <span
                        className={cn(
                          "inline-block min-w-8 rounded px-1 transition-colors duration-200",
                          now ? "bg-lamp-soft text-lamp ring-1 ring-[color:var(--lamp)]" : "text-ink",
                        )}
                      >
                        {to ?? ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Body>
  );
}

/* ------------------------------------------------------------------ 4. minimization (Moore rounds, then the merged DFA) */

/** Same order as the group tints in AutomatonGraph, so chips and drawn states match. */
const BLOCK_COLOURS = ["var(--series-lr)", "var(--series-dt)", "var(--series-rf)", "var(--series-stack)", "var(--series-rpni)", "var(--series-edsm)"];
const blockColour = (i: number) => BLOCK_COLOURS[i % BLOCK_COLOURS.length];

export function MinimizeStage({ live, compact, language = "L8" }: StageProps & { language?: string }) {
  const q = useAutomaton(language, "min_dfa");
  const min = q.data?.minimization;
  const after = isDfa(q.data?.automaton) ? q.data.automaton : undefined;
  const colouring = useMemo(() => (min ? mooreColouring(min) : null), [min]);
  const rounds = min?.moore_rounds.length ?? 0;
  const { frame } = useRunFrames(rounds + 1, live, 2300, 3800);
  const reduce = useReducedMotion();
  if (!min || !after || !colouring) return <Pending queries={[q]} />;
  const merged = frame >= rounds;
  const r = Math.min(frame, rounds - 1);
  const partition = min.moore_rounds[r];
  const colourOf = colouring.rounds[r];
  const before = min.before;
  const spring = { type: "spring" as const, stiffness: 240, damping: 30 };
  return (
    <Body
      caption={
        <>
          {language}: the subset construction produced {min.states_before} states. Each box holds states that no string tried so far can tell apart.
          The two dots under a state show which boxes its{" "}
          {before.alphabet.map((sym, i) => (
            <span key={sym}>
              {i > 0 && " and "}
              <Mono>{sym}</Mono>
            </span>
          ))}{" "}
          arrows lead to.
        </>
      }
      footer={
        <div className="space-y-3">
          <p className="min-h-10 text-sm text-ink-2">
            {merged ? (
              <>
                No box splits any more, so each of the <span className="text-ink">{after.states.length} boxes</span> becomes one state:{" "}
                {min.states_before} states shrink to {min.states_after}.
              </>
            ) : frame === 0 ? (
              <>Start with two boxes: accepting and non-accepting states. States in one box whose dots differ will be split.</>
            ) : (
              <>
                Round {frame}: every box whose states had different dots was split. <span className="text-ink">{partition.length} boxes.</span>
              </>
            )}
          </p>
          <ol className="flex gap-1" aria-label="Moore rounds">
            {Array.from({ length: rounds + 1 }, (_, i) => (
              <li
                key={i}
                className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i === frame ? "bg-lamp" : i < frame ? "bg-[color:var(--ink-2)]/60" : "bg-panel-2")}
                aria-current={i === frame ? "step" : undefined}
              >
                <span className="sr-only">{i < rounds ? `Round ${i}` : "Merged"}</span>
              </li>
            ))}
          </ol>
        </div>
      }
    >
      <LayoutGroup id={`moore-${language}`}>
        <ul className="flex flex-wrap content-start gap-2.5" aria-label={`Partition after round ${r}: ${partition.length} boxes`}>
          {partition.map((block) => {
            const c = colourOf[block[0]] ?? 0;
            return (
              <motion.li
                layout={!reduce}
                key={c}
                transition={spring}
                className="flex flex-wrap gap-1 rounded-lg border p-1.5"
                style={{ borderColor: blockColour(c), background: `color-mix(in srgb, ${blockColour(c)} 9%, transparent)` }}
              >
                {block.map((st) => (
                  <motion.span
                    layout={!reduce}
                    layoutId={reduce ? undefined : `moore-${language}-${st}`}
                    key={st}
                    transition={spring}
                    className="flex w-9 flex-col items-center gap-1 rounded-md bg-[color:var(--bg)]/75 pb-1.5 pt-1 font-mono text-[13px] text-ink"
                    title={before.alphabet.map((sym) => `${sym} → ${before.transitions[st]?.[sym] ?? "–"}`).join(", ")}
                  >
                    {st}
                    <span className="flex gap-[3px]" aria-hidden>
                      {before.alphabet.map((sym) => {
                        const to = before.transitions[st]?.[sym];
                        const tc = to !== undefined ? colourOf[to] : undefined;
                        return (
                          <span
                            key={sym}
                            className="h-[7px] w-[7px] rounded-full"
                            style={{ background: tc === undefined ? "var(--muted)" : blockColour(tc) }}
                          />
                        );
                      })}
                    </span>
                  </motion.span>
                ))}
              </motion.li>
            );
          })}
        </ul>
      </LayoutGroup>
      <div className={cn("mt-5 flex items-center justify-center", compact ? "min-h-[150px]" : "min-h-[190px]")}>
        <AnimatePresence mode="wait" initial={false}>
          {merged ? (
            <motion.div
              key="after"
              className="w-full"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <AutomatonGraph
                automaton={after}
                groups={colouring.finalOf}
                radius={25}
                zoomable={false}
                maxHeight={compact ? 150 : 190}
                ariaLabel={`Minimized DFA for ${language} with ${after.states.length} states.`}
              />
            </motion.div>
          ) : (
            <motion.p
              key="wait"
              className="max-w-sm text-center text-sm text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              The minimal machine appears here once a round splits nothing.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </Body>
  );
}

/* ------------------------------------------------------------------ 5. equivalence: the product construction */

export function ProductStage({ live, compact }: StageProps) {
  const truthQ = useAutomaton("L7", "dfa");
  const learnedQ = useAutomaton("L7", "rpni");
  const truth = isDfa(truthQ.data?.automaton) ? truthQ.data.automaton : undefined;
  const learned = isDfa(learnedQ.data?.automaton) ? learnedQ.data.automaton : undefined;
  const cex = learnedQ.data?.metrics?.counterexample_to_truth ?? null;
  const word = cex ?? "";
  const { frame, done } = useRunFrames(word.length + 1, live, 1000, 2800);
  if (!truth || !learned) return <Pending queries={[truthQ, learnedQ]} />;
  const tA = trail(truth, word);
  const tB = trail(learned, word);
  const accA = runDfa(truth, word).accepted;
  const accB = runDfa(learned, word).accepted;
  const pairs = tA.map((p, i) => [p, tB[i]] as const);
  const graph = (dfa: DfaPayload, t: string[], acc: boolean, label: string) => (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex items-center justify-between gap-2 text-xs text-ink-2">
        <span>{label}</span>
        <Outcome accepted={done ? acc : null} label={show(word)} />
      </figcaption>
      <AutomatonGraph
        automaton={dfa}
        active={[t[frame]]}
        activeEdge={frame > 0 ? { from: t[frame - 1], to: t[frame] } : null}
        tokenKey={frame}
        verdict={done ? (acc ? "accept" : "reject") : null}
        radius={20}
        zoomable={false}
        maxHeight={compact ? 120 : 170}
        ariaLabel={`${label}: ${dfa.states.length} states.`}
      />
    </figure>
  );
  return (
    <Body
      caption={
        <>
          The ground-truth DFA for L7 and the DFA that RPNI learned from the training strings, run side by side on pairs of states.
        </>
      }
      footer={
        <div className="space-y-2">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-xs" aria-label="Pairs of states visited">
            {pairs.map(([a, b], i) => {
              const shown = i <= frame;
              const bad = i === pairs.length - 1 && cex !== null && done;
              return (
                <li key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className={cn("text-muted", !shown && "opacity-0")}>─{word[i - 1]}→</span>}
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 transition-all duration-300",
                      !shown && "opacity-0",
                      bad ? "border-[color:var(--reject)] bg-reject-soft text-reject" : i === frame ? "border-[color:var(--lamp)] text-ink" : "border-line text-ink-2",
                    )}
                  >
                    ({a}, {b})
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="min-h-10 text-sm text-ink-2">
            {cex === null ? (
              <>The search finds no pair that disagrees: the two machines are equivalent.</>
            ) : done ? (
              <>
                The pair <Mono>({tA[tA.length - 1]}, {tB[tB.length - 1]})</Mono> disagrees, so <Mono className="text-lamp">{show(cex)}</Mono> is the
                shortest counterexample: the truth {accA ? "accepts" : "rejects"} it, RPNI&apos;s machine {accB ? "accepts" : "rejects"} it.
              </>
            ) : (
              <>Breadth-first search over pairs of states, one symbol at a time…</>
            )}
          </p>
        </div>
      }
    >
      <div className="grid gap-5">
        {graph(truth, tA, accA, "Ground truth")}
        {graph(learned, tB, accB, "Learned by RPNI")}
      </div>
    </Body>
  );
}

/* ------------------------------------------------------------------ 6. Myhill–Nerode: a separating suffix */

/** Shortest access string for each state (BFS from the start). */
function accessStrings(dfa: DfaPayload): Record<string, string> {
  const out: Record<string, string> = { [dfa.start]: "" };
  const queue = [dfa.start];
  while (queue.length) {
    const p = queue.shift()!;
    for (const s of dfa.alphabet) {
      const q = dfa.transitions[p]?.[s];
      if (q !== undefined && !(q in out)) {
        out[q] = out[p] + s;
        queue.push(q);
      }
    }
  }
  return out;
}

export function SuffixStage({ live, compact }: StageProps) {
  const q = useAutomaton("L7", "dfa");
  const dfa = isDfa(q.data?.automaton) ? q.data.automaton : undefined;
  const rows = useMemo(() => {
    const all = q.data?.distinguishing_suffixes ?? [];
    // Show the interesting pairs (a non-empty suffix) first.
    return [...all.filter((r) => r.suffix !== ""), ...all.filter((r) => r.suffix === "")];
  }, [q.data]);
  const access = useMemo(() => (dfa ? accessStrings(dfa) : {}), [dfa]);
  const [pair, setPair] = useState(0);
  const row = rows.length ? rows[pair % rows.length] : null;
  const suffix = row?.suffix ?? "";
  const { frame, cycle, done } = useRunFrames(suffix.length + 1, live, 900, 2600);
  useEffect(() => setPair(cycle), [cycle]);
  if (!dfa || !row) return <Pending queries={[q]} />;
  const tp = trail(withStart(dfa, row.p), suffix);
  const tq = trail(withStart(dfa, row.q), suffix);
  const accP = dfa.accepting.includes(tp[tp.length - 1]);
  const accQ = dfa.accepting.includes(tq[tq.length - 1]);
  const states = dfa.states;
  const one = (from: string, t: string[], acc: boolean) => (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <span>
          From <Mono className="text-lamp">{from}</Mono>, reached by <Mono>{show(access[from] ?? "?")}</Mono>
        </span>
        <Outcome accepted={done ? acc : null} label={show((access[from] ?? "") + suffix)} />
      </figcaption>
      <AutomatonGraph
        automaton={withStart(dfa, from)}
        active={[t[Math.min(frame, t.length - 1)]]}
        activeEdge={frame > 0 ? { from: t[frame - 1], to: t[frame] } : null}
        tokenKey={`${pair}:${frame}`}
        verdict={done ? (acc ? "accept" : "reject") : null}
        radius={20}
        zoomable={false}
        maxHeight={compact ? 110 : 140}
        ariaLabel={`L7 DFA started in ${from}.`}
      />
    </figure>
  );
  return (
    <Body
      caption={
        <>
          L7: for every pair of states the API lists a shortest suffix that separates them. Read it from both states: one run accepts, the other
          rejects.
        </>
      }
      footer={
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <table className="border-collapse font-mono text-xs" aria-label="Separating suffix for each pair of states">
            <tbody>
              {states.slice(1).map((r, i) => (
                <tr key={r}>
                  <th scope="row" className="pr-2 text-right font-medium text-muted">
                    {r}
                  </th>
                  {states.slice(0, i + 1).map((c) => {
                    const cell = rows.find((x) => (x.p === c && x.q === r) || (x.p === r && x.q === c));
                    const on = cell === row;
                    return (
                      <td key={c} className="p-0.5">
                        <span
                          className={cn(
                            "grid h-7 w-11 place-items-center rounded border transition-colors duration-300",
                            on ? "border-[color:var(--lamp)] bg-lamp-soft text-ink" : "border-line text-ink-2",
                          )}
                        >
                          {cell ? show(cell.suffix) : ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td />
                {states.slice(0, -1).map((c) => (
                  <td key={c} className="pt-1 text-center text-muted">
                    {c}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="min-w-[12rem] flex-1 text-sm text-ink-2">
            Suffix <Mono className="text-lamp">{show(suffix)}</Mono> separates <Mono>{row.p}</Mono> and <Mono>{row.q}</Mono>, so they can never be
            merged.
          </p>
        </div>
      }
    >
      <div className="grid gap-3">
        {one(row.p, tp, accP)}
        {one(row.q, tq, accQ)}
      </div>
    </Body>
  );
}

/* ------------------------------------------------------------------ 7. the limit: pumping a loop */

const PUMP_BASE = "1001";
const PUMP_KS = [1, 0, 2, 3];

export function PumpStage({ live, compact }: StageProps) {
  const q = useAutomaton("L6", "dfa");
  const dfa = isDfa(q.data?.automaton) ? q.data.automaton : undefined;
  const split = useMemo(() => (dfa ? pumpSplit(dfa, PUMP_BASE) : null), [dfa]);
  const [ki, setKi] = useState(0);
  const k = PUMP_KS[ki % PUMP_KS.length];
  const word = split ? split.x + split.y.repeat(k) + split.z : PUMP_BASE;
  const { frame, cycle, done } = useRunFrames(word.length + 1, live, 520, 2200);
  useEffect(() => setKi(cycle), [cycle]);
  const notes = useMemo(() => stateNotes(dfa), [dfa]);
  if (!dfa || !split) return <Pending queries={[q]} />;
  const t = trail(dfa, word);
  const accepted = dfa.accepting.includes(t[t.length - 1]);
  const segs: { ch: string; kind: "x" | "y" | "z"; rep: number }[] = [
    ...[...split.x].map((ch) => ({ ch, kind: "x" as const, rep: 0 })),
    ...Array.from({ length: k }, (_, r) => [...split.y].map((ch) => ({ ch, kind: "y" as const, rep: r }))).flat(),
    ...[...split.z].map((ch) => ({ ch, kind: "z" as const, rep: 0 })),
  ];
  return (
    <Body
      caption={
        <>
          L6, binary multiples of 3, needs only {dfa.states.length} states. Reading <Mono>{PUMP_BASE}</Mono> it enters{" "}
          <Mono className="text-lamp">{split.state}</Mono> twice, so the part in between, <Mono className="text-lamp">{split.y}</Mono>, is a loop.
        </>
      }
      footer={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1" role="img" aria-label={`Tape ${word}: x = ${split.x}, y repeated ${k} times, z = ${split.z}`}>
            {segs.map((c, i) => (
              <span
                key={i}
                className={cn(
                  "grid h-9 w-8 place-items-center rounded-md border font-mono text-base transition-colors",
                  c.kind === "y" ? (c.rep % 2 ? "border-[color:var(--lamp)]/60 bg-lamp-soft text-ink" : "border-[color:var(--lamp)] bg-lamp-soft text-ink") : "border-line-strong text-ink-2",
                  i < frame && "opacity-60",
                  i === frame && "ring-2 ring-[color:var(--lamp)]",
                )}
              >
                {c.ch}
              </span>
            ))}
            {segs.length === 0 && <span className="font-mono text-muted">ε</span>}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs" aria-label="Pumped strings">
            {PUMP_KS.slice()
              .sort((a, b) => a - b)
              .map((kk) => {
                const w = split.x + split.y.repeat(kk) + split.z;
                const ok = runDfa(dfa, w).accepted;
                return (
                  <li key={kk} className={cn("rounded-md px-2 py-1", kk === k ? "bg-panel-2 text-ink" : "text-ink-2")}>
                    y<sup>{kk}</sup>: {show(w)} = {binValue(w)} <span className={ok ? "text-accept" : "text-reject"}>{ok ? "✓" : "✕"}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      }
    >
      <AutomatonGraph
        automaton={dfa}
        active={[t[Math.min(frame, t.length - 1)]]}
        activeEdge={frame > 0 ? { from: t[frame - 1], to: t[frame] } : null}
        tokenKey={`${ki}:${frame}`}
        verdict={done ? (accepted ? "accept" : "reject") : null}
        notes={notes}
        radius={26}
        zoomable={false}
        maxHeight={compact ? 190 : 260}
        ariaLabel={`L6 DFA with ${dfa.states.length} states: remainder of the value modulo 3.`}
      />
    </Body>
  );
}
