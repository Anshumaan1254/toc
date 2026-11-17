import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { Tape } from "@/components/tape/Tape";
import { Button, ErrorState, Skeleton, VerdictStamp } from "@/components/ui/primitives";
import { errorMessage, useLanguages } from "@/lib/api";
import { showString } from "@/lib/meta";
import type { DfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { binaryValue, stateNotes, useTruthDfas } from "./data";
import { useMediaQuery } from "./hooks";
import { useDfaRun } from "./useDfaRun";
import { CropMarks, InlineSkeleton } from "./ui";

/** Demo strings per language; every verdict shown is computed by running the real DFA. */
const DEMOS = [
  { id: "L7", strings: ["abaabb", "babba", "aabb", "ababab"] },
  { id: "L2", strings: ["11001", "0110", "101"] },
  { id: "L6", strings: ["1100", "1011", "10010"] },
] as const;
const DEMO_IDS = DEMOS.map((d) => d.id);
const HOLD_MS = 2300;

export interface MachineStep {
  /** The DFA that is running and the state the token is arriving at. */
  dfa: DfaPayload;
  state: string;
  verdict: "accept" | "reject" | null;
}

/**
 * The hero's live machine: a ground-truth DFA from the API reading strings off a tape,
 * cycling through a few strings and languages; visitors can run their own string.
 */
export function HeroMachine({ live, onStep, className }: { live: boolean; onStep?: (s: MachineStep, graphEl: HTMLElement | null) => void; className?: string }) {
  const reduce = useReducedMotion();
  const wide = useMediaQuery("(min-width: 640px)");
  const dfas = useTruthDfas(DEMO_IDS);
  const languages = useLanguages();
  const [cursor, setCursor] = useState({ lang: 0, str: 0 });
  const [manual, setManual] = useState<string | null>(null);
  const [lockLang, setLockLang] = useState(false);
  const [holding, setHolding] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [announce, setAnnounce] = useState("");
  const graphBox = useRef<HTMLDivElement>(null);

  const demo = DEMOS[cursor.lang];
  const dfa = dfas.byId[demo.id];
  const input = manual ?? demo.strings[cursor.str];
  const run = useDfaRun(dfa, input, runKey, { stepMs: 560, typeMs: 75 });
  const lang = languages.data?.find((l) => l.id === demo.id);
  const notes = useMemo(() => stateNotes(dfa), [dfa]);

  // Advance the demo after the verdict has been on screen for a moment.
  useEffect(() => {
    if (run.phase !== "done" || manual !== null || !live || holding || reduce) return;
    const t = window.setTimeout(() => {
      setCursor((c) => {
        const next = c.str + 1;
        if (next < DEMOS[c.lang].strings.length) return { lang: c.lang, str: next };
        return { lang: lockLang ? c.lang : (c.lang + 1) % DEMOS.length, str: 0 };
      });
      setRunKey((k) => k + 1);
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [run.phase, manual, live, holding, reduce, lockLang]);

  // Tell the background where the read head just moved (it ripples the drafting grid).
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  useEffect(() => {
    if (!dfa || !run.current || run.phase === "typing" || run.phase === "idle") return;
    if (run.index < 0 && run.phase !== "done") return;
    onStepRef.current?.({ dfa, state: run.current, verdict: run.verdict }, graphBox.current);
  }, [dfa, run.current, run.index, run.phase, run.verdict]);

  // Announce only the visitor's own runs (the looping demo stays quiet for screen readers).
  useEffect(() => {
    if (manual === null || run.phase !== "done" || !dfa) return;
    setAnnounce(
      `${showString(manual)} is ${run.accepted ? "accepted" : "rejected"} by ${demo.id}: the machine stops in state ${run.finalState ?? "none"}.`,
    );
  }, [manual, run.phase, run.accepted, run.finalState, demo.id, dfa]);

  const pickLanguage = (i: number) => {
    setCursor({ lang: i, str: 0 });
    setLockLang(true);
    setManual(null);
    setRunKey((k) => k + 1);
  };
  const runOwn = (s: string) => {
    setManual(s);
    setRunKey((k) => k + 1);
  };
  const resume = () => {
    setManual(null);
    setCursor((c) => ({ lang: c.lang, str: (c.str + 1) % DEMOS[c.lang].strings.length }));
    setRunKey((k) => k + 1);
  };

  const note = run.current ? notes[run.current] : undefined;
  const readSoFar = demo.id === "L6" && run.phase !== "typing" ? input.slice(0, Math.max(0, run.head)) : null;

  return (
    <div className={cn("relative", className)}>
      <CropMarks />
      <div className="relative px-1 py-2 sm:px-5 sm:py-3">
        {/* language picker: three quiet text links (amber is kept for the read head) */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1" role="radiogroup" aria-label="Choose the machine">
          {DEMOS.map((d, i) => {
            const meta = languages.data?.find((l) => l.id === d.id);
            const on = i === cursor.lang;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickLanguage(i)}
                className={cn(
                  "t-caption flex min-h-8 items-baseline gap-1.5 py-1 text-left transition-colors",
                  on ? "text-ink!" : "text-muted hover:text-ink-2!",
                )}
              >
                <span className="font-mono text-xs">{d.id}</span>
                <span
                  className={cn(
                    "max-w-[11rem] truncate border-b pb-px",
                    on ? "border-[color:var(--ink)]" : "border-transparent",
                  )}
                >
                  {meta?.name ?? "…"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 hidden min-h-[2.6rem] max-w-xl text-sm leading-snug text-muted sm:block">
          {lang ? (
            <>
              {lang.description}
              {lang.regex !== lang.name && (
                <>
                  {" "}
                  Regular expression <span className="whitespace-nowrap font-mono text-ink-2">{lang.regex}</span>.
                </>
              )}
            </>
          ) : (
            <InlineSkeleton className="w-3/4" />
          )}
        </p>

        {/* the machine */}
        <div ref={graphBox} className="relative mt-2 flex h-[clamp(180px,24vh,215px)] items-center justify-center">
          {dfas.error && !dfa ? (
            <ErrorState message={errorMessage(dfas.error)} onRetry={dfas.refetch} className="w-full" />
          ) : !dfa ? (
            <Skeleton className="h-full w-full rounded-2xl" />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={demo.id}
                className="flex h-full w-full items-center justify-center"
                initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
                transition={{ duration: 0.35 }}
              >
                <AutomatonGraph
                  automaton={dfa}
                  active={run.current ? [run.current] : []}
                  activeEdge={run.edge}
                  tokenKey={run.tokenKey}
                  verdict={run.verdict}
                  notes={notes}
                  radius={25}
                  zoomable={false}
                  maxHeight={215}
                  className="max-h-full"
                  ariaLabel={`The ground-truth DFA for ${demo.id} with ${dfa.states.length} states, start state ${dfa.start}, accepting ${dfa.accepting.join(", ")}.`}
                />
              </motion.div>
            </AnimatePresence>
          )}
          {/* the inspector's stamp lands on the drawing */}
          <div className="pointer-events-none absolute -top-1 right-0 sm:right-2" aria-hidden={manual === null}>
            <VerdictStamp accepted={run.phase === "done" ? run.accepted : null} size={wide ? "lg" : "md"} />
          </div>
        </div>

        {/* what the current state remembers */}
        <p className="mt-1 flex min-h-6 flex-wrap items-baseline gap-x-2 text-sm" aria-hidden={manual === null}>
          <span className="text-muted">In state</span>
          <span className="font-mono font-semibold text-lamp">{run.current ?? "–"}</span>
          {note && <span className="text-ink-2">the machine remembers: {note}</span>}
          {readSoFar !== null && readSoFar.length > 0 && (
            <span className="font-mono text-muted">
              ({readSoFar}
              <sub>2</sub> = {binaryValue(readSoFar)})
            </span>
          )}
        </p>

        {/* the tape */}
        <Tape input={run.tape} head={run.head} status={run.status} size={wide ? "lg" : "md"} className="mt-1" label={`Input tape for ${demo.id}`} />

        <RunForm
          key={demo.id}
          alphabet={dfa?.alphabet ?? []}
          lang={demo.id}
          disabled={!dfa}
          onRun={runOwn}
          onFocusChange={setHolding}
          manual={manual !== null}
          onResume={resume}
        />
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  );
}


function RunForm({
  alphabet,
  lang,
  disabled,
  onRun,
  onFocusChange,
  manual,
  onResume,
}: {
  alphabet: string[];
  lang: string;
  disabled: boolean;
  onRun: (s: string) => void;
  onFocusChange: (focused: boolean) => void;
  manual: boolean;
  onResume: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const invalid = [...new Set([...value].filter((c) => !alphabet.includes(c)))];
  const ok = invalid.length === 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ok && !disabled) onRun(value);
  };
  const sample = alphabet.length ? `${alphabet[0]}${alphabet[1] ?? ""}${alphabet[1] ?? ""}${alphabet[0]}` : "";
  return (
    <form onSubmit={submit} className="mt-4" onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={id} className="shrink-0 text-sm font-medium text-ink-2">
          Run your own string
        </label>
        <div
          className={cn(
            "flex h-11 min-w-[15rem] flex-1 items-center rounded-full border bg-panel/80 pl-4 pr-1.5 backdrop-blur-sm transition-colors focus-within:border-[color:var(--lamp)]",
            ok ? "border-line-strong" : "border-[color:var(--reject)]",
          )}
        >
          <input
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\s+/g, "").slice(0, 24))}
            maxLength={24}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!ok}
            aria-describedby={`${id}-hint`}
            placeholder={sample ? `for example ${sample}` : ""}
            className="h-full min-w-0 flex-1 bg-transparent font-mono text-base tracking-wider text-ink outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted/70 focus-visible:outline-none!"
            disabled={disabled}
          />
          <Button type="submit" size="sm" disabled={!ok || disabled} className="h-8 shrink-0">
            Run on {lang}
          </Button>
        </div>
        {manual && (
          <Button type="button" variant="ghost" size="sm" onClick={onResume}>
            Back to the demo
          </Button>
        )}
      </div>
      <p id={`${id}-hint`} className={cn("mt-1.5 min-h-4 text-xs leading-4", ok ? "text-muted" : "text-reject")} aria-live="polite">
        {alphabet.length === 0
          ? "The machine is loading."
          : ok
          ? `Use the symbols ${alphabet.join(" and ")}. Leave it empty to run ε, the empty string.`
          : `${invalid.map((c) => `“${c}”`).join(", ")} ${invalid.length === 1 ? "is" : "are"} not in the alphabet {${alphabet.join(", ")}}.`}
      </p>
    </form>
  );
}
