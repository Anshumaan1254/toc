import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { AlertTriangle, Shuffle } from "lucide-react";
import { errorMessage, useClassify } from "@/lib/api";
import { pct, showString } from "@/lib/meta";
import type { Approach, ClassifyResult, Language, ModelDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tape, type TapeStatus } from "@/components/tape/Tape";
import { Badge, Button, Gauge, StringInput, VerdictStamp } from "@/components/ui/primitives";
import { BorderBeam } from "@/components/magicui/border-beam";
import { useThemeColors } from "@/lib/theme";
import { examplesFor, randomLongString } from "./examples";
import { featureNames } from "./features";
import { FeatureMatrix } from "./FeatureMatrix";
import { GlitchField } from "./GlitchField";
import { ModelStage } from "./ModelStage";
import { Reasoning } from "./Reasoning";
import { SectionHeading } from "./SectionHeading";
import { SignalBeams } from "./SignalBeams";
import { atLeast, useReadHead, useRunSequence, type Phase } from "./useRunSequence";
import { featureWeights } from "./weights";

const MODEL_TITLE: Record<string, { title: string; hint: string }> = {
  logistic_regression: { title: "Weighted sum", hint: "one weight per feature, then a sigmoid" },
  decision_tree: { title: "Decision tree", hint: "yes/no questions down to a leaf" },
  random_forest: { title: "Random forest", hint: "many trees, averaged" },
  stacking: { title: "Stacked ensemble", hint: "three models and a judge" },
};

type StationState = "idle" | "active" | "done";

function Station({
  title,
  hint,
  state,
  children,
  stationRef,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  state: StationState;
  children: ReactNode;
  stationRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  return (
    <div
      ref={stationRef}
      className={cn(
        "relative z-[1] flex min-w-0 flex-col rounded-2xl border bg-panel/90 p-4 backdrop-blur-sm transition-[border-color,box-shadow] duration-300",
        state === "active" && "border-[color:var(--lamp)] shadow-[0_0_0_1px_var(--lamp),0_0_40px_-12px_var(--lamp)]",
        state === "done" && "border-[color:color-mix(in_srgb,var(--lamp)_45%,transparent)]",
        state === "idle" && "border-line",
        className,
      )}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full transition-colors", state === "active" ? "bg-lamp shadow-[0_0_8px_var(--lamp)]" : state === "done" ? "bg-lamp/60" : "bg-line-strong")}
          aria-hidden
        />
      </div>
      {hint && <p className="-mt-2 mb-3 text-xs text-muted">{hint}</p>}
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

const stationState = (phase: Phase, own: Phase, next: Phase): StationState => (phase === own ? "active" : atLeast(phase, next) ? "done" : "idle");

export function PipelineSection({
  language,
  approach,
  model,
  onResult,
}: {
  language: Language;
  approach: Approach;
  model: ModelDetail;
  onResult: (r: ClassifyResult) => void;
}) {
  const reduce = !!useReducedMotion();
  const colors = useThemeColors();
  const examples = useMemo(() => examplesFor(language.id, language.alphabet), [language.id, language.alphabet]);
  const [draft, setDraft] = useState(examples[0] ?? "");
  const [runId, setRunId] = useState(0);
  const [runInput, setRunInput] = useState(examples[0] ?? "");
  const [res, setRes] = useState<{ id: number; data: ClassifyResult } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [seed, setSeed] = useState(1);
  const latest = useRef(0);
  const { mutateAsync } = useClassify();

  const run = useCallback(
    (s: string) => {
      const id = ++latest.current;
      setRunId(id);
      setRunInput(s);
      setErr(null);
      mutateAsync({ language: language.id, approach: approach.id, string: s })
        .then((data) => {
          if (latest.current !== id) return;
          setRes({ id, data });
          onResult(data);
        })
        .catch((e: unknown) => {
          if (latest.current === id) setErr(errorMessage(e));
        });
    },
    [mutateAsync, language.id, approach.id, onResult],
  );

  // Run the first example once, as soon as the pipeline is on screen, so it is never empty.
  const sheetRef = useRef<HTMLDivElement>(null);
  const pipeRef = useRef<HTMLDivElement>(null);
  const inView = useInView(pipeRef, { once: true, amount: 0.3, margin: "0px 0px -8% 0px" });
  useEffect(() => {
    if (inView && latest.current === 0 && examples.length) run(examples[0]);
  }, [inView, examples, run]);

  const ready = res !== null && res.id === runId;
  const result = ready ? res.data : null;
  const seq = useRunSequence(runId, runInput.length, ready, reduce);
  const phase: Phase = err ? "idle" : seq;
  const head = useReadHead(runId, runInput.length, phase);
  const busy = phase !== "idle" && phase !== "done";

  const values = useMemo(() => (result?.ml ? new Map(result.ml.active_features.map((f) => [f.feature, f.value])) : null), [result]);
  const important = useMemo(() => new Set(featureWeights(model.explanation).slice(0, 12).map((f) => f.feature)), [model.explanation]);
  const [nFeatures, setNFeatures] = useState(() => featureNames(language.alphabet).length);
  useEffect(() => {
    if (result?.ml?.n_features) setNFeatures(result.ml.n_features);
  }, [result]);

  // stations and the wires between them
  const tapeRef = useRef<HTMLDivElement>(null);
  const featRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  const stations = useMemo(() => [tapeRef, featRef, modelRef, verdictRef], []);
  const lit = atLeast(phase, "decision") ? 3 : atLeast(phase, "model") ? 2 : atLeast(phase, "features") ? 1 : 0;
  const fire = phase === "features" ? 0 : phase === "model" ? 1 : phase === "decision" ? 2 : -1;

  const tapeStatus: TapeStatus = phase === "idle" ? "idle" : atLeast(phase, "decision") && result ? (result.accepted ? "accepted" : "rejected") : "running";
  const meta = MODEL_TITLE[model.explanation?.type ?? ""] ?? { title: model.name, hint: "" };
  const long = runInput.length > 20;

  return (
    <section aria-labelledby="ml-watch" className="space-y-10">
      <SectionHeading
        id="ml-watch"
        title="Watch it decide"
        lede={
          <>
            A string goes in, becomes {nFeatures} numbers, the {meta.title.toLowerCase()} weighs them, and out comes a probability. Pick an example
            or type your own; the long ones are longer than anything the model trained on.
          </>
        }
      />

      <div ref={sheetRef} className="grid-paper relative overflow-hidden rounded-[28px] border border-line bg-panel/30 p-4 sm:p-6 lg:p-8">
        <GlitchField symbols={language.alphabet} busy={busy} />
        {busy && !reduce && <BorderBeam size={140} duration={2.4} colorFrom={colors.lamp} colorTo="transparent" borderWidth={1.5} />}

        <div className="relative z-[1] grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end">
          <StringInput
            value={draft}
            onChange={setDraft}
            onSubmit={() => run(draft)}
            alphabet={language.alphabet}
            submitLabel="Run the string"
            label="Your string"
          />
          <div className="pb-7">
            <p className="mb-2 text-sm font-medium text-ink-2">Examples</p>
            <div className="flex flex-wrap gap-2">
              {examples.map((s) => (
                <button
                  key={s || "eps"}
                  type="button"
                  onClick={() => {
                    setDraft(s);
                    run(s);
                  }}
                  title={showString(s)}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-full border bg-panel/80 px-3 font-mono text-sm text-ink transition-colors hover:border-ink-2",
                    runInput === s && runId > 0 ? "border-[color:var(--lamp)]" : "border-line-strong",
                  )}
                >
                  {s.length > 12 ? `${s.slice(0, 9)}…` : showString(s)}
                  {s.length > 20 && <span className="font-sans text-[11px] text-lamp">{s.length} symbols</span>}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const s = randomLongString(language.alphabet, seed);
                  setSeed((v) => v + 1);
                  setDraft(s);
                  run(s);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-sm text-ink-2 transition-colors hover:border-ink-2 hover:text-ink"
              >
                <Shuffle size={14} aria-hidden /> Random long string
              </button>
            </div>
          </div>
        </div>

        <div ref={pipeRef} className="relative mt-6 grid gap-9 md:grid-cols-2 md:items-center md:gap-x-12 md:gap-y-14 lg:mt-8 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.9fr)] xl:gap-10">
          <SignalBeams containerRef={pipeRef} nodes={stations} lit={lit} fire={fire} fireKey={`${runId}-${phase}`} reduce={reduce} />

          <Station title="The string" hint={`${runInput.length} symbol${runInput.length === 1 ? "" : "s"}, read left to right`} state={stationState(phase, "reading", "features")} stationRef={tapeRef}>
            <Tape input={runInput} head={head} status={tapeStatus} size="md" label="Input string" />
            <p className="mt-3 min-h-[2.5em] text-xs leading-snug text-ink-2">
              {long ? (
                <span className="text-lamp">Longer than every training string (they stop at 20 symbols).</span>
              ) : (
                <>Lengths up to 20, like the strings the model trained on.</>
              )}
            </p>
          </Station>

          <Station title={`${nFeatures} features`} hint="the same generic features for every language" state={stationState(phase, "features", "model")} stationRef={featRef}>
            <FeatureMatrix
              alphabet={language.alphabet}
              values={values}
              revealed={atLeast(phase, "features")}
              sweeping={phase === "features" && !reduce}
              important={important}
              inputLength={runInput.length}
              total={nFeatures}
            />
          </Station>

          <Station title={meta.title} hint={meta.hint} state={stationState(phase, "model", "decision")} stationRef={modelRef}>
            <ModelStage model={model} ml={result?.ml ?? null} phase={phase} reduce={reduce} />
          </Station>

          <Station title="The verdict" hint="threshold at 50%" state={stationState(phase, "decision", "done")} stationRef={verdictRef}>
            {err ? (
              <div role="alert" className="w-full rounded-xl border border-[color:var(--reject)]/40 bg-reject-soft p-3">
                <p className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-reject" aria-hidden />
                  <span className="min-w-0 break-words">{err}</span>
                </p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => run(runInput)}>
                  Try again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Gauge value={atLeast(phase, "decision") && result ? (result.probability ?? null) : null} className="w-full max-w-[210px]" />
                <div className="mt-3 flex h-12 items-center justify-center">
                  <VerdictStamp accepted={phase === "done" && result ? result.accepted : null} />
                </div>
                <div className="mt-2 min-h-[3.4em] text-center text-xs leading-relaxed text-ink-2">
                  {phase === "done" && result ? (
                    <>
                      <span>
                        Truth: {result.truth ? "in" : "not in"} {language.id}.{" "}
                      </span>
                      <Badge tone={result.correct ? "accept" : "reject"} className="align-middle">
                        {result.correct ? "the model is right" : "the model is wrong"}
                      </Badge>
                      <span className="mt-1 block text-muted">
                        {result.confidence !== undefined && <>{pct(result.confidence)} confident, </>}
                        answered in {result.time_ms < 1 ? `${result.time_ms.toFixed(2)} ms` : `${result.time_ms.toFixed(1)} ms`}
                      </span>
                    </>
                  ) : busy ? (
                    <span className="text-muted">working…</span>
                  ) : (
                    <span className="text-muted">Run a string to see the verdict.</span>
                  )}
                </div>
              </div>
            )}
          </Station>
        </div>
      </div>

      <div className="pt-4">
        <Reasoning model={model} language={language} result={result} phase={phase} />
        <p className="mt-10 max-w-3xl text-sm text-muted">
          Why {language.id} is {language.difficulty === "hard" ? "hard" : "within reach"} for a feature-based model: {language.ml_note} None of the
          features was designed for {language.id}; the same {nFeatures} are computed for every language.
        </p>
      </div>
    </section>
  );
}
