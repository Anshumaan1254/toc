import { useMemo, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { seededRandom } from "@/lib/automata";
import { ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { errorMessage, useAutomaton, useLanguages } from "@/lib/api";
import { int } from "@/lib/meta";
import type { DatasetReport, DfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CoverageGrid } from "./CoverageGrid";
import { useActiveStep, useMediaQuery, useTicker } from "./hooks";
import { accepts, countTable, randomEdit, sampleUniform, shortlexAt, stringsUpTo, structured, type Edited, type StructuredKind } from "./strings";
import { StripTape, VerdictTag } from "./StripTape";
import { SegmentBar } from "./SegmentBar";
import { SheetMarks } from "./ui";

const DEMO_LANGUAGE = "L3";

type StepId = "exhaustive" | "uniform" | "edits" | "structured" | "long";

const GROUPS: { id: Exclude<StepId, "long">; name: string; keys: string[] }[] = [
  { id: "exhaustive", name: "Every short string", keys: ["exhaustive"] },
  { id: "uniform", name: "Exact random samples", keys: ["dfa_uniform_positive", "dfa_uniform_negative"] },
  { id: "edits", name: "Edits across the boundary", keys: ["hard_negative_edit", "near_miss_positive_edit"] },
  { id: "structured", name: "Runs, repeats, palindromes", keys: ["structured_run", "structured_repeat", "structured_palindrome"] },
];

const sumKeys = (report: DatasetReport, keys: string[]) =>
  Object.values(report.strategies).reduce((acc, per) => acc + keys.reduce((s, k) => s + (per[k] ?? 0), 0), 0);

/** Sticky "drafting sheet" that demonstrates each generation strategy on a real ground-truth DFA. */
export function StringBench({ report, splitSizes }: { report: DatasetReport; splitSizes?: Record<string, number> }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  // phones get the compact demos; tablets keep full-size ones even in the stacked layout
  const roomy = useMediaQuery("(min-width: 768px)");
  const { active, register } = useActiveStep(5, wide ? 0.5 : 0.74);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageInView = useInView(stageRef, { margin: "-10% 0px -10% 0px" });
  const dfaQuery = useAutomaton(DEMO_LANGUAGE, "dfa");
  const languages = useLanguages();
  const dfa = dfaQuery.data?.automaton.kind === "dfa" ? dfaQuery.data.automaton : null;
  const langName = languages.data?.find((l) => l.id === DEMO_LANGUAGE)?.name;

  const buckets = report.config.buckets;
  const exhaustiveMax = Math.max(...buckets.filter((b) => b.size === null).map((b) => b.hi));
  const sampled = buckets.filter((b) => b.size !== null && b.pool === "main");
  const longBuckets = buckets.filter((b) => b.pool === "long");
  const longPerLanguage = longBuckets.reduce((s, b) => s + (b.size ?? 0), 0);
  const firstLanguage = Object.keys(report.strategies)[0];
  const exhaustivePerLanguage = report.strategies[firstLanguage]?.exhaustive ?? 0;
  const totals = Object.fromEntries(GROUPS.map((g) => [g.id, sumKeys(report, g.keys)])) as Record<Exclude<StepId, "long">, number>;
  const hardNeg = sumKeys(report, ["hard_negative_edit"]);
  const nearMiss = sumKeys(report, ["near_miss_positive_edit"]);
  const sampledLo = Math.min(...sampled.map((b) => b.lo));
  const sampledHi = Math.max(...sampled.map((b) => b.hi));
  const longLo = Math.min(...longBuckets.map((b) => b.lo));
  const longHi = Math.max(...longBuckets.map((b) => b.hi));

  const steps: { id: StepId; title: string; body: ReactNode }[] = [
    {
      id: "exhaustive",
      title: `Every string up to length ${exhaustiveMax}`,
      body: (
        <>
          Short strings are few enough to take all of them: the {int(exhaustivePerLanguage)} strings of length 0 to {exhaustiveMax}, for every language,
          including the empty string ε. Nothing short is left to chance.
        </>
      ),
    },
    {
      id: "uniform",
      title: "Exact random samples",
      body: (
        <>
          Longer strings are sampled:{" "}
          {new Set(sampled.map((b) => b.size)).size === 1
            ? `${int(sampled[0]?.size)} per language in each of the length bands ${sampled.map((b) => `${b.lo}–${b.hi}`).join(" and ")}`
            : sampled.map((b) => `${int(b.size)} of length ${b.lo}–${b.hi}`).join(" and ")}
          , exactly half of them accepted. A counting table over the ground-truth DFA knows how many
          accepted strings of each length leave every state, so each accepted string of a given length is equally likely to be drawn. Rejected strings are
          drawn the same way.
        </>
      ),
    },
    {
      id: "edits",
      title: "One edit across the boundary",
      body: (
        <>
          Random strings are easy to tell apart. The hard ones sit right next to the boundary, so the generator takes accepted strings and applies one or two
          random edits (substitute, insert or delete) until the result is rejected: {int(hardNeg)} hard negatives in all. The mirror image, rejected strings
          edited into the language, adds {int(nearMiss)} near-miss positives.
        </>
      ),
    },
    {
      id: "structured",
      title: "Runs, repeats and palindromes",
      body: (
        <>
          Long runs of one symbol, short patterns repeated over and over, and palindromes catch models that lean on surface statistics: {int(totals.structured)}{" "}
          of them across all {Object.keys(report.strategies).length} languages, labelled by the DFA like every other string.
        </>
      ),
    },
    {
      id: "long",
      title: "A longer test nobody trains on",
      body: (
        <>
          Strings of length {longLo} to {longHi} form a separate pool, {int(longPerLanguage)} per language. No model ever trains on them. They answer one question:
          did a model learn the rule, or only the lengths it was shown?
        </>
      ),
    },
  ];
  const step = steps[active]?.id ?? "exhaustive";
  const running = stageInView;

  const mix = GROUPS.map((g) => ({ id: g.id, name: g.name, value: totals[g.id] }));
  const pools = splitSizes
    ? [
        { id: "train", name: "Training", value: splitSizes.train ?? 0 },
        { id: "val", name: "Validation", value: splitSizes.val ?? 0 },
        { id: "test", name: "Test", value: splitSizes.test ?? 0 },
        { id: "long", name: `Long pool (${longLo}–${longHi})`, value: splitSizes.long ?? 0 },
      ]
    : null;

  return (
    <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-x-12 px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* the sheet: sticky on every size; on phones it sits under the nav and the steps scroll below it */}
      <div className="sticky top-[6.5rem] z-10 -mx-6 bg-bg/90 px-6 pb-3 pt-2 backdrop-blur-md lg:order-2 lg:top-24 lg:mx-0 lg:flex lg:h-[calc(100svh-8rem)] lg:items-center lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div ref={stageRef} className="grid-paper relative w-full overflow-hidden rounded-3xl border border-line bg-panel/80 p-4 shadow-[var(--shadow)] md:p-7">
          <SheetMarks />
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-2">
              <span className="font-mono text-ink">{DEMO_LANGUAGE}</span>
              {langName ? `: ${langName.toLowerCase()}` : ""}
            </span>
            <span className="text-muted">{steps[active]?.title}</span>
          </div>
          <div className="relative mt-3 h-[13.5rem] overflow-hidden md:mt-5 md:h-[19rem]">
            {dfa ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  className="absolute inset-0"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.28 }}
                >
                  {step === "exhaustive" && <ExhaustiveDemo dfa={dfa} maxLen={exhaustiveMax} running={running} />}
                  {step === "uniform" && <UniformDemo dfa={dfa} length={12} running={running} compact={!roomy} />}
                  {step === "edits" && <EditsDemo dfa={dfa} running={running} compact={!roomy} />}
                  {step === "structured" && <StructuredDemo dfa={dfa} running={running} compact={!roomy} />}
                  {step === "long" && <LongDemo dfa={dfa} lo={longLo} hi={longHi} running={running} />}
                </motion.div>
              </AnimatePresence>
            ) : dfaQuery.isError ? (
              <div className="grid h-full place-items-center">
                <ErrorState message={`The demo automaton could not be loaded. ${errorMessage(dfaQuery.error)}`} onRetry={() => dfaQuery.refetch()} />
              </div>
            ) : (
              <LoadingBlock className="h-full justify-center" label="Loading the ground-truth DFA…" />
            )}
          </div>
          <div className="mt-3 md:mt-5">
            {step === "long" && pools ? (
              <SegmentBar parts={pools} highlight="long" label="Rows per split, all languages" />
            ) : (
              <SegmentBar parts={mix} highlight={step} label="Rows per generation strategy, all languages" />
            )}
          </div>
        </div>
      </div>

      {/* the steps */}
      <ol className="relative pb-[18svh] pt-[6svh] lg:order-1 lg:py-[22svh]">
        {steps.map((s, i) => (
          <li
            key={s.id}
            ref={register(i)}
            className={cn(
              "flex min-h-[64svh] flex-col justify-start pt-6 transition-opacity duration-500 lg:min-h-[78svh] lg:justify-center lg:pt-0",
              i === active ? "opacity-100" : "opacity-35",
            )}
          >
            <h4 className="font-display text-2xl font-semibold leading-tight text-ink md:text-[2rem]">{s.title}</h4>
            <p className="mt-3 max-w-md text-base leading-relaxed text-ink-2 md:text-[17px]">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ demos

function Caption({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-snug text-ink-2">{children}</p>;
}

/** Shortlex enumeration, accelerating so one loop covers every length in a few seconds. */
function ExhaustiveDemo({ dfa, maxLen, running }: { dfa: DfaPayload; maxLen: number; running: boolean }) {
  const reduce = useReducedMotion();
  const tick = useTicker(running && !reduce, 120);
  const total = useMemo(() => stringsUpTo(dfa.alphabet.length, maxLen), [dfa, maxLen]);
  const indices = useMemo(() => {
    const out: number[] = [];
    for (let k = 0; k < total; k += 1 + Math.floor(k / 14)) out.push(k);
    out.push(total - 1);
    for (let i = 0; i < 14; i++) out.push(total - 1); // rest on the full grid before looping
    return out;
  }, [total]);
  const k = reduce ? total - 1 : indices[tick % indices.length];
  const current = shortlexAt(dfa.alphabet, k);
  const ok = accepts(dfa, current);
  const acceptedSoFar = useMemo(() => {
    let n = 0;
    for (let i = 0; i <= k; i++) if (accepts(dfa, shortlexAt(dfa.alphabet, i))) n++;
    return n;
  }, [dfa, k]);
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
      <div className="flex min-h-11 flex-wrap items-center gap-3">
        <StripTape input={current} size="sm" status={ok ? "accepted" : "rejected"} label="Current string" />
        <VerdictTag accepted={ok} />
      </div>
      <CoverageGrid dfa={dfa} total={total} upto={k} />
      <Caption>
        String <span className="tabular font-mono text-ink">{int(k + 1)}</span> of <span className="tabular font-mono text-ink">{int(total)}</span> in shortlex
        order, one square each: <span className="text-accept">{int(acceptedSoFar)} accepted</span>, <span className="text-reject">{int(k + 1 - acceptedSoFar)} rejected</span>{" "}
        so far.
      </Caption>
    </div>
  );
}

/** Write a uniformly sampled string symbol by symbol while the token walks the DFA. */
function UniformDemo({ dfa, length, running, compact }: { dfa: DfaPayload; length: number; running: boolean; compact: boolean }) {
  const reduce = useReducedMotion();
  const tick = useTicker(running && !reduce, 240);
  const table = useMemo(() => countTable(dfa, length), [dfa, length]);
  const accepted = table[length][dfa.start];
  const all = dfa.alphabet.length ** length;
  const cycle = length + 7; // write + hold
  const round = Math.floor(tick / cycle);
  const pos = reduce ? length : Math.min(length, tick % cycle);
  const wantAccepted = round % 2 === 0;
  const sample = useMemo(() => sampleUniform(dfa, table, length, wantAccepted, seededRandom(7 + round * 31)) ?? "", [dfa, table, length, wantAccepted, round]);
  const shown = sample.slice(0, pos);
  let state = dfa.start;
  let prev: string | null = null;
  for (const ch of shown) {
    prev = state;
    state = dfa.transitions[state][ch];
  }
  const done = pos >= length;
  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto_auto] gap-2 md:gap-3">
      <div className="min-h-0">
        <AutomatonGraph
          automaton={dfa}
          active={[state]}
          activeEdge={prev ? { from: prev, to: state } : null}
          tokenKey={pos}
          verdict={done ? (wantAccepted ? "accept" : "reject") : null}
          zoomable={false}
          animateIn={false}
          maxHeight={compact ? 92 : 150}
          radius={compact ? 16 : 19}
          ariaLabel={`Ground-truth DFA with ${dfa.num_states} states; the token follows the sampled string.`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StripTape input={shown || ""} size={compact ? "xs" : "sm"} label="Sampled string" animateKey={round} status={done ? (wantAccepted ? "accepted" : "rejected") : "idle"} />
        {done && <VerdictTag accepted={wantAccepted} />}
      </div>
      <Caption>
        Of the <span className="tabular font-mono text-ink">{int(all)}</span> strings of length {length}, <span className="tabular font-mono text-ink">{int(accepted)}</span>{" "}
        are accepted. Each is drawn with the same chance, 1 in {int(accepted)}.
      </Caption>
    </div>
  );
}

function describeEdit(e: Edited): string {
  const nth = (i: number) => {
    const n = i + 1;
    const s = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
    return `${n}${s}`;
  };
  if (e.op === "substitute") return `substitute the ${nth(e.at)} symbol: ${e.before[e.at]} becomes ${e.after[e.at]}`;
  if (e.op === "insert") return `insert ${e.after[e.at]} as the ${nth(e.at)} symbol`;
  return `delete the ${nth(e.at)} symbol (${e.before[e.at]})`;
}

/** An accepted string pushed out of the language by one edit (and the mirror image). */
function EditsDemo({ dfa, running, compact }: { dfa: DfaPayload; running: boolean; compact: boolean }) {
  const reduce = useReducedMotion();
  const tick = useTicker(running && !reduce, 2800);
  const table = useMemo(() => countTable(dfa, 12), [dfa]);
  const example = useMemo(() => {
    const rand = seededRandom(1234 + tick * 17);
    const fromAccepted = tick % 3 !== 2; // two hard negatives, then one near-miss positive
    for (let tries = 0; tries < 200; tries++) {
      const len = (compact ? 6 : 7) + Math.floor(rand() * (compact ? 3 : 4));
      const base = sampleUniform(dfa, table, len, fromAccepted, rand);
      if (base === null) continue;
      const e = randomEdit(base, dfa.alphabet, rand);
      if (accepts(dfa, e.after) !== fromAccepted) return { edit: e, fromAccepted };
    }
    return null;
  }, [dfa, table, tick]);
  if (!example) return null;
  const { edit, fromAccepted } = example;
  return (
    <div className={cn("flex h-full flex-col justify-center", compact ? "gap-2" : "gap-4")}>
      <div className="space-y-1">
        <div className="text-xs text-muted">before</div>
        <div className="flex items-center gap-2 md:gap-3">
          <StripTape input={edit.before} size={compact ? "xs" : "sm"} tones={edit.op === "delete" ? { [edit.at]: "struck" } : {}} status={fromAccepted ? "accepted" : "rejected"} label="Before the edit" animateKey={`b${tick}`} />
          <VerdictTag accepted={fromAccepted} compact={compact} />
        </div>
      </div>
      <div className="font-mono text-xs text-lamp">{describeEdit(edit)}</div>
      <div className="space-y-1">
        <div className="text-xs text-muted">after one edit</div>
        <div className="flex items-center gap-2 md:gap-3">
          <StripTape input={edit.after} size={compact ? "xs" : "sm"} tones={edit.op === "delete" ? {} : { [edit.at]: "lamp" }} status={fromAccepted ? "rejected" : "accepted"} label="After the edit" animateKey={`a${tick}`} />
          <VerdictTag accepted={!fromAccepted} compact={compact} />
        </div>
      </div>
      <Caption>{fromAccepted ? "A hard negative: one symbol away from an accepted string." : "A near-miss positive: one symbol away from a rejected string."}</Caption>
    </div>
  );
}

const KINDS: { kind: StructuredKind; name: string }[] = [
  { kind: "run", name: "Runs" },
  { kind: "repeat", name: "Repeated pattern" },
  { kind: "palindrome", name: "Palindrome" },
];

function StructuredDemo({ dfa, running, compact }: { dfa: DfaPayload; running: boolean; compact: boolean }) {
  const reduce = useReducedMotion();
  const tick = useTicker(running && !reduce, 3000);
  const rows = useMemo(() => {
    const rand = seededRandom(99 + tick * 13);
    const make = (kind: StructuredKind) => {
      // examples that use both symbols read better than "0000000000"
      for (let tries = 0; tries < 40; tries++) {
        const s = structured(kind, (compact ? 7 : 9) + Math.floor(rand() * (compact ? 3 : 4)), dfa.alphabet, rand);
        if (new Set(s).size > 1) return s;
      }
      return structured(kind, 10, dfa.alphabet, rand);
    };
    // show both verdicts when the language allows it within a few tries
    for (let tries = 0; tries < 30; tries++) {
      const out = KINDS.map((k) => {
        const s = make(k.kind);
        return { ...k, s, ok: accepts(dfa, s) };
      });
      if (out.some((r) => r.ok) && out.some((r) => !r.ok)) return out;
      if (tries === 29) return out;
    }
    return [];
  }, [dfa, tick, compact]);
  return (
    <div className={cn("flex h-full flex-col justify-center", compact ? "gap-2.5" : "gap-4")}>
      {rows.map((r) => (
        <div key={r.kind} className="space-y-1">
          <div className="text-xs text-muted">{r.name}</div>
          <div className="flex items-center gap-2 md:gap-3">
            <StripTape input={r.s} size="xs" status={r.ok ? "accepted" : "rejected"} label={r.name} animateKey={`${r.kind}${tick}`} />
            <VerdictTag accepted={r.ok} compact={compact} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LongDemo({ dfa, lo, hi, running }: { dfa: DfaPayload; lo: number; hi: number; running: boolean }) {
  const reduce = useReducedMotion();
  const tick = useTicker(running && !reduce, 2600);
  const table = useMemo(() => countTable(dfa, hi), [dfa, hi]);
  const ex = useMemo(() => {
    const rand = seededRandom(4242 + tick * 7);
    const len = lo + Math.floor(rand() * (hi - lo + 1));
    const want = tick % 2 === 0;
    return { s: sampleUniform(dfa, table, len, want, rand) ?? "", want, len };
  }, [dfa, table, lo, hi, tick]);
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="text-xs text-muted">
        {ex.len} symbols, longer than anything in training
      </div>
      <StripTape input={ex.s} size="xs" status={ex.want ? "accepted" : "rejected"} label="Long string" animateKey={tick} />
      <div>
        <VerdictTag accepted={ex.want} />
      </div>
    </div>
  );
}
