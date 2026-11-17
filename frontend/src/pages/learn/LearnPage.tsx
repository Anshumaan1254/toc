import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import ClickSpark from "@/components/reactbits/ClickSpark";
import { useLenis } from "@/components/layout/SmoothScroll";
import { Button, ErrorState } from "@/components/ui/primitives";
import { errorMessage, useLearn } from "@/lib/api";
import { useThemeColors } from "@/lib/theme";
import type { Learner } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LearnHeader } from "./LearnHeader";
import { LearnerExplain, LearnerPicker } from "./LearnerPicker";
import { PageRail, type RailStop } from "./PageRail";
import { plural, sampleSignature, type Outcome } from "./model";
import { PRESET_BY_ID, PRESETS, presetSamples, samplesFollow } from "./presets";
import { EmptyResult, ResultView } from "./ResultView";
import { analyzeSamples, appendLine, toText, type IssueKind } from "./samples";
import { PresetBar, SampleColumn } from "./SampleEditor";

const FIRST = PRESETS[0];
/** Which blocking problem the status line names first. */
const BLOCK_ORDER: IssueKind[] = ["conflict", "one-sided", "alphabet", "too-many"];
const STOPS: RailStop[] = [
  { id: "examples", label: "Your examples" },
  { id: "learner", label: "Pick a learner" },
  { id: "result", label: "The machine" },
];

/**
 * Page 5: learn a DFA from your own labelled strings, then test it against three ML models
 * trained on the same strings. A calm workbench: examples, learner, machine.
 */
export default function LearnPage() {
  const reduce = useReducedMotion();
  const lenis = useLenis();
  const colors = useThemeColors();

  // ---------------------------------------------------------------- the examples
  const [texts, setTexts] = useState(() => {
    const s = presetSamples(FIRST, 1);
    return { accepted: toText(s.accepted), rejected: toText(s.rejected) };
  });
  const [presetId, setPresetId] = useState<string | null>(FIRST.id);
  const [seed, setSeed] = useState(1);
  const [fillKey, setFillKey] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [undo, setUndo] = useState<{ accepted: string; rejected: string } | null>(null);
  const samples = useMemo(() => analyzeSamples(texts.accepted, texts.rejected), [texts]);
  const preset = presetId ? PRESET_BY_ID[presetId] : null;
  const follows = !!preset && samplesFollow(preset, samples.accepted.strings, samples.rejected.strings);

  const edit = (column: "accepted" | "rejected", text: string) => {
    setTexts((t) => ({ ...t, [column]: text }));
    setDirty(true);
    setUndo(null);
  };
  const fill = (id: string, nextSeed: number) => {
    const p = PRESET_BY_ID[id];
    const s = presetSamples(p, nextSeed);
    if (dirty) setUndo(texts);
    setTexts({ accepted: toText(s.accepted), rejected: toText(s.rejected) });
    setPresetId(id);
    setSeed(nextSeed);
    setDirty(false);
    setFillKey((k) => k + 1);
  };

  // ---------------------------------------------------------------- the learner
  const [learner, setLearner] = useState<Learner>("rpni");
  const learn = useLearn();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<{ message: string; signature: string } | null>(null);
  const signature = useMemo(() => sampleSignature(learner, samples.payload), [learner, samples.payload]);
  const resultRef = useRef<HTMLElement>(null);
  const scrollNext = useRef(false);

  const start = (acceptedText: string, rejectedText: string, learnerId: Learner, scroll: boolean) => {
    const st = analyzeSamples(acceptedText, rejectedText);
    if (st.total === 0) return;
    if (st.issues.some((i) => i.severity === "block")) {
      setFlashKey((k) => k + 1);
      return;
    }
    const sig = sampleSignature(learnerId, st.payload);
    const p = presetId ? PRESET_BY_ID[presetId] : null;
    const followed = p && samplesFollow(p, st.accepted.strings, st.rejected.strings) ? p.id : null;
    setFailure(null);
    learn.mutate(
      { samples: st.payload, learner: learnerId },
      {
        onSuccess: (data) => {
          scrollNext.current = scroll;
          setOutcome({ data, learner: learnerId, signature: sig, presetId: followed, samples: st.payload });
        },
        onError: (err) => setFailure({ message: errorMessage(err), signature: sig }),
      },
    );
  };
  const learnNow = () => start(texts.accepted, texts.rejected, learner, true);

  // Bring the new machine into view once it has rendered.
  useEffect(() => {
    if (!outcome || !scrollNext.current) return;
    scrollNext.current = false;
    const el = resultRef.current;
    if (!el) return;
    if (lenis) {
      lenis.resize(); // the cached scroll limit predates the (taller) result
      lenis.scrollTo(el, { offset: -88, duration: 1.1 });
    }
    else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [outcome, lenis, reduce]);

  const addCounterexample = (s: string, accepted: boolean) => {
    const next = accepted ? { ...texts, accepted: appendLine(texts.accepted, s) } : { ...texts, rejected: appendLine(texts.rejected, s) };
    setTexts(next);
    setDirty(true);
    setUndo(null);
    const learnerId = outcome?.learner ?? learner;
    setLearner(learnerId);
    start(next.accepted, next.rejected, learnerId, false);
  };

  // ---------------------------------------------------------------- status next to the button
  const blocking = samples.issues.filter((i) => i.severity === "block");
  const soft = samples.issues.filter((i) => i.severity === "soft");
  const invalid = blocking.filter((i) => i.kind === "invalid").length;
  const firstBlock = BLOCK_ORDER.map((k) => blocking.find((i) => i.kind === k)).find((i) => i !== undefined);
  const showFailure = failure !== null && failure.signature === signature;
  const status =
    samples.total === 0
      ? "Add a few strings to both columns first."
      : invalid > 0
        ? `${invalid === 1 ? "One highlighted line needs" : `${invalid} highlighted lines need`} fixing before the learner can run.`
        : firstBlock
          ? firstBlock.message
          : showFailure
            ? "The learner refused these examples:"
            : soft.length > 0
              ? "These examples will most likely be refused:"
              : `Ready: ${plural(samples.accepted.strings.length, "accepted string")} and ${plural(samples.rejected.strings.length, "rejected string")}.`;
  const canLearn = samples.total > 0 && blocking.length === 0;

  return (
    <>
      <LearnHeader />
      <PageRail stops={STOPS} />

      {/* ---------------------------------------------------------------- examples + learner */}
      <section id="examples" aria-labelledby="examples-title" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-16 pt-7 md:pb-24 md:pt-8">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="examples-title" className="font-display text-2xl font-semibold text-ink md:text-3xl">
            Your examples
          </h2>
          <p className="text-sm text-ink-2">Accepted strings on the left, rejected on the right, one per line. ε alone on a line is the empty string.</p>
        </div>
        <div className="mt-4">
          <PresetBar
            activeId={follows ? presetId : null}
            onPick={(id) => fill(id, 1)}
            onReshuffle={() => presetId && fill(presetId, seed + 1)}
            canUndo={undo !== null}
            onUndo={() => {
              if (!undo) return;
              setTexts(undo);
              setUndo(null);
              setDirty(true);
            }}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          <SampleColumn column="accepted" text={texts.accepted} onChange={(t) => edit("accepted", t)} parsed={samples.accepted} fillKey={fillKey} flashKey={flashKey} />
          <SampleColumn column="rejected" text={texts.rejected} onChange={(t) => edit("rejected", t)} parsed={samples.rejected} fillKey={fillKey} flashKey={flashKey} />
        </div>
        <p className="mt-2 flex min-h-7 flex-wrap items-center gap-2 text-sm text-muted">
          {samples.alphabet.length === 0 ? (
            "The alphabet is inferred from the symbols you type."
          ) : (
            <>
              <span>Alphabet inferred from your strings:</span>
              <span className={cn("flex gap-1", samples.alphabet.length > 4 && "text-reject")}>
                {samples.alphabet.map((c) => (
                  <span
                    key={c}
                    className={cn(
                      "grid h-6 min-w-6 place-items-center rounded-md border px-1.5 font-mono text-[13px]",
                      samples.alphabet.length > 4 ? "border-[color:var(--reject)] text-reject" : "border-line-strong text-ink",
                    )}
                  >
                    {c}
                  </span>
                ))}
              </span>
            </>
          )}
        </p>

        {/* the learner and the button: one row on wider screens; on phones the button bar sticks to the bottom of the screen */}
        <div id="learner" className="scroll-mt-28 max-md:contents md:mt-3 md:flex md:flex-wrap md:items-center md:gap-x-5 md:gap-y-2">
          <h2 className="sr-only">Pick a learner</h2>
          <div className="min-w-0 max-md:mt-4 md:order-1">
            <LearnerPicker value={learner} onChange={setLearner} />
          </div>
          <LearnerExplain value={learner} className="max-md:mt-3 md:order-3 md:basis-full" />
          <div
            className={cn(
              "sticky bottom-0 z-20 flex min-w-0 items-center gap-x-4 gap-y-2",
              "max-md:-mx-6 max-md:mt-2 max-md:border-t max-md:border-line max-md:bg-bg/92 max-md:px-6 max-md:py-3 max-md:backdrop-blur-md",
              "md:static md:order-2 md:flex-1",
            )}
          >
            <ClickSpark sparkColor={[colors.lamp, colors.accept]} sparkCount={10} sparkRadius={34} sparkSize={9} duration={520} style={{ width: "auto", height: "auto", display: "inline-block", flexShrink: 0 }}>
              <Button size="lg" onClick={learnNow} loading={learn.isPending} disabled={!canLearn} aria-describedby="learn-status">
                Learn the automaton
              </Button>
            </ClickSpark>
            <p id="learn-status" className={cn("min-w-0 flex-1 text-sm max-md:text-[13px] max-md:leading-snug", blocking.length > 0 ? "text-reject" : "text-ink-2")} aria-live="polite">
              {status}
            </p>
          </div>
        </div>

        {soft.length > 0 && blocking.length === 0 && !showFailure && (
          <ul className="mt-4 max-w-3xl space-y-2">
            {soft.map((issue) => (
              <li key={issue.message} className="flex gap-3 rounded-xl border border-line bg-panel/85 px-4 py-3 text-sm text-ink shadow-[inset_3px_0_0_var(--line-strong)]">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
        {showFailure && <ErrorState className="mt-4 max-w-3xl" message={failure.message} />}
      </section>

      {/* ---------------------------------------------------------------- the machine */}
      <section id="result" ref={resultRef} aria-labelledby="result-title" className="scroll-mt-24 pb-28">
        {outcome ? (
          <ResultView
            key={outcome.data.session_id}
            outcome={outcome}
            stale={outcome.signature !== signature}
            busy={learn.isPending}
            preset={follows ? preset : outcome.presetId ? PRESET_BY_ID[outcome.presetId] : null}
            onRelearn={() => start(texts.accepted, texts.rejected, learner, false)}
            onAddCounterexample={addCounterexample}
          />
        ) : (
          <EmptyResult busy={learn.isPending} count={samples.payload.length} />
        )}
      </section>
    </>
  );
}
