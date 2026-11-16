import { useId, useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { int, PIPELINE_BY_ID, pct } from "@/lib/meta";
import { useWidth } from "@/components/charts/Charts";
import type { Language, ModelDetail } from "@/lib/types";

const M = { left: 44, right: 18, top: 44, bottom: 64 };
const MAX_LEN = 40;
const TRAIN_MAX = 20;

interface Beat {
  start: number;
  end: number;
  title: ReactNode;
  body: ReactNode;
}

const points = (drop: number): string => `${(Math.abs(drop) * 100).toFixed(1)} points`;

function verdictCopy(test: number, long: number, drop: number, languageId: string): { title: string; body: string } {
  if (test < 0.7)
    return {
      title: "Close to guessing at every length.",
      body: `${pct(test)} on the lengths it trained on and ${pct(long)} beyond them. It never found the rule behind ${languageId} in these features, so there was little left to lose.`,
    };
  if (drop >= 0.1)
    return {
      title: `${points(drop)} lost.`,
      body:
        long < 0.6
          ? `On longer strings it is barely better than a coin flip. What it learned fits the lengths it saw, not the rule behind ${languageId}.`
          : `It learned patterns that hold for short strings and break for long ones, not the rule behind ${languageId}.`,
    };
  if (drop >= 0.02) return { title: `A drop of ${points(drop)}.`, body: "It mostly holds up: the features it relies on still mean the same thing on longer strings." };
  if (drop <= -0.02) return { title: `${points(drop)} better.`, body: "Longer strings are easier for it here; its mistakes sit among the short strings." };
  return {
    title: test >= 0.995 && long >= 0.995 ? "No drop at all." : "Practically no drop.",
    body: `Whatever it learned for ${languageId} keeps working at lengths it never saw: the features it relies on describe the language itself.`,
  };
}

/** Accuracy against string length: one level over the training range, one over the unseen range, and the step between. */
function RulerChart({ model, progress }: { model: ModelDetail; progress: MotionValue<number> }) {
  const uid = useId().replace(/:/g, "");
  // Draw at (close to) real pixel size so the labels stay readable on a phone.
  const [box, measured] = useWidth<HTMLDivElement>();
  const W = Math.max(330, Math.min(680, measured || 640));
  const H = W < 480 ? 300 : 340;
  const test = model.metrics.test.accuracy;
  const long = model.metrics.long.accuracy;
  const lo = Math.min(0.4, Math.floor((Math.min(test, long) - 0.05) * 10) / 10);
  const X = (len: number) => M.left + (len / MAX_LEN) * (W - M.left - M.right);
  const Y = (acc: number) => M.top + ((1 - acc) / (1 - lo)) * (H - M.top - M.bottom);
  const color = PIPELINE_BY_ID[model.pipeline]?.color ?? "var(--series-truth)";
  const base = H - M.bottom;
  const drop = test - long;
  const split = X(TRAIN_MAX + 0.5);

  const rulerA = useTransform(progress, [0, 0.16], [1, 1]);
  const testLine = useTransform(progress, [0.25, 0.4], [0, 1]);
  const rulerB = useTransform(progress, [0.47, 0.58], [0, 1]);
  const longLine = useTransform(progress, [0.53, 0.68], [0, 1]);
  const dropIn = useTransform(progress, [0.78, 0.88], [0, 1]);
  const clipA = useTransform(rulerA, (v) => Math.max(0, (split - M.left + 16) * v));
  const clipB = useTransform(rulerB, (v) => Math.max(0, (X(MAX_LEN) - split + 12) * v));
  const testLabel = useTransform(testLine, [0.9, 1], [0, 1]);
  const longLabel = useTransform(longLine, [0.9, 1], [0, 1]);
  // A zero-length path with round caps still paints a dot: keep undrawn levels invisible.
  const testShown = useTransform(testLine, (v) => (v > 0.005 ? 1 : 0));
  const longShown = useTransform(longLine, (v) => (v > 0.005 ? 1 : 0));

  const ticks = Array.from({ length: MAX_LEN + 1 }, (_, i) => i);
  const grid = [0.5, 0.75, 1].filter((g) => g >= lo);
  const tickMarks = (from: number, to: number) =>
    ticks
      .filter((t) => t >= from && t <= to)
      .map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={base} y2={base + (t % 5 === 0 ? 10 : 5)} stroke="var(--ink-2)" strokeOpacity={t % 5 === 0 ? 0.9 : 0.45} />
          {t % (W < 480 ? 10 : 5) === 0 && (
            <text x={X(t)} y={base + 24} textAnchor="middle" fontSize={11} fill="var(--ink-2)" className="tabular">
              {t}
            </text>
          )}
        </g>
      ));

  return (
    <div ref={box}>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Accuracy ${pct(test)} on test strings of length 0 to 20 and ${pct(long)} on strings of length 21 to 40.`}
    >
      <defs>
        <clipPath id={`ra-${uid}`}>
          <motion.rect x={M.left - 6} y={0} height={H} width={clipA} />
        </clipPath>
        <clipPath id={`rb-${uid}`}>
          <motion.rect x={split} y={0} height={H} width={clipB} />
        </clipPath>
        <pattern id={`hatch-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--line)" strokeWidth="1.5" />
        </pattern>
      </defs>

      {grid.map((g) => (
        <g key={g}>
          <line x1={M.left} x2={W - M.right} y1={Y(g)} y2={Y(g)} stroke="var(--line)" strokeDasharray={g === 0.5 ? "4 4" : undefined} />
          <text x={M.left - 8} y={Y(g) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
            {Math.round(g * 100)}%
          </text>
        </g>
      ))}
      <text x={M.left + 8} y={Y(0.5) + 15} fontSize={11} fill="var(--muted)">
        coin flip
      </text>

      <g clipPath={`url(#ra-${uid})`}>
        <rect x={X(0)} y={M.top - 12} width={split - X(0)} height={base - M.top + 12} fill="var(--panel-2)" opacity={0.7} rx={6} />
        <text x={X(0) + 2} y={M.top - 20} fontSize={11.5} fill="var(--ink-2)">
          lengths it trained on
        </text>
        {tickMarks(0, TRAIN_MAX)}
        <line x1={X(0)} x2={split} y1={base} y2={base} stroke="var(--ink-2)" />
      </g>
      <g clipPath={`url(#rb-${uid})`}>
        <rect x={split} y={M.top - 12} width={X(MAX_LEN) - split} height={base - M.top + 12} fill={`url(#hatch-${uid})`} opacity={0.7} />
        <text x={X(MAX_LEN) - 2} y={M.top - 20} textAnchor="end" fontSize={11.5} fill="var(--ink-2)">
          never seen
        </text>
        {tickMarks(TRAIN_MAX + 1, MAX_LEN)}
        <line x1={split} x2={X(MAX_LEN)} y1={base} y2={base} stroke="var(--ink-2)" />
      </g>
      <text x={(M.left + W - M.right) / 2} y={H - 14} textAnchor="middle" fontSize={11.5} fill="var(--muted)">
        string length (symbols)
      </text>

      <motion.path d={`M ${X(0)} ${Y(test)} L ${X(TRAIN_MAX)} ${Y(test)}`} stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" style={{ pathLength: testLine, opacity: testShown }} />
      <motion.g style={{ opacity: testLabel }}>
        <circle cx={X(TRAIN_MAX)} cy={Y(test)} r={5} fill={color} stroke="var(--panel)" strokeWidth={2} />
        <text x={X(TRAIN_MAX) - 8} y={Y(test) + (test > 0.9 ? 22 : -12)} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--ink)" className="tabular">
          {pct(test)} on test strings
        </text>
      </motion.g>
      <motion.path d={`M ${X(TRAIN_MAX + 1)} ${Y(long)} L ${X(MAX_LEN)} ${Y(long)}`} stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" style={{ pathLength: longLine, opacity: longShown }} />
      <motion.g style={{ opacity: longLabel }}>
        <circle cx={X(MAX_LEN)} cy={Y(long)} r={5} fill={color} stroke="var(--panel)" strokeWidth={2} />
        <text x={X(MAX_LEN) - 8} y={Y(long) + (drop > 0.06 || long > 0.9 ? 22 : -12)} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--ink)" className="tabular">
          {pct(long)} on lengths 21–40
        </text>
      </motion.g>

      {Math.abs(drop) >= 0.005 && (
        <motion.g style={{ opacity: dropIn }}>
          <line x1={split} x2={split} y1={Y(test) + (drop > 0 ? 5 : -5)} y2={Y(long) + (drop > 0 ? -4 : 4)} stroke="var(--lamp)" strokeWidth={2} />
          <path
            d={
              drop > 0
                ? `M ${split - 5} ${Y(long) - 10} L ${split} ${Y(long) - 3} L ${split + 5} ${Y(long) - 10}`
                : `M ${split - 5} ${Y(long) + 10} L ${split} ${Y(long) + 3} L ${split + 5} ${Y(long) + 10}`
            }
            fill="none"
            stroke="var(--lamp)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <text x={split + 10} y={(Y(test) + Y(long)) / 2 + 4} fontSize={13} fontWeight={600} fill="var(--lamp)" className="tabular">
            {drop > 0 ? "−" : "+"}
            {(Math.abs(drop) * 100).toFixed(1)} pts
          </text>
        </motion.g>
      )}
    </svg>
    </div>
  );
}

/**
 * The generalization story as one scroll-linked beat: the visitor scrolls, the length ruler extends past
 * the training range and the accuracy steps down (or holds). Sticky positioning, not a fixed pin: the
 * page's <main> carries a CSS filter, which would turn position: fixed into position: absolute.
 */
export function LengthRuler({ model, language }: { model: ModelDetail; language: Language }) {
  const reduce = !!useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ["start 0.55", "end end"] });
  const finished = useMotionValue(1);
  const test = model.metrics.test;
  const long = model.metrics.long;
  const v = verdictCopy(test.accuracy, long.accuracy, model.generalization_drop, language.id);
  const beats: Beat[] = [
    {
      start: 0,
      end: 0.24,
      title: <>Every string it learned from has at most 20 symbols.</>,
      body: <>Training, validation and test strings all come from lengths 0 to 20. The model has never seen anything longer.</>,
    },
    {
      start: 0.24,
      end: 0.48,
      title: (
        <>
          On fresh strings of those lengths: <span className="whitespace-nowrap">{pct(test.accuracy)}</span>
        </>
      ),
      body: <>The test set: {int(test.n)} strings it never trained on, drawn from the same lengths.</>,
    },
    {
      start: 0.48,
      end: 0.76,
      title: (
        <>
          On strings of 21 to 40 symbols: <span className="whitespace-nowrap">{pct(long.accuracy)}</span>
        </>
      ),
      body: (
        <>
          {int(long.n)} longer strings ({int(long.confusion.tp + long.confusion.fn)} in the language, {int(long.confusion.tn + long.confusion.fp)} not), kept out of
          training and tuning.
        </>
      ),
    },
    { start: 0.76, end: 1.01, title: v.title, body: v.body },
  ];

  if (reduce) {
    return (
      <div ref={wrapRef} className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center">
        <div className="space-y-6">
          {beats.map((b, i) => (
            <div key={i}>
              <p className="font-display text-2xl font-semibold text-ink">{b.title}</p>
              <p className="mt-1 text-ink-2">{b.body}</p>
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-line bg-panel/60 p-3 sm:p-5">
          <RulerChart model={model} progress={finished} />
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative h-[235vh]">
      <div className="sticky top-0 flex h-svh flex-col justify-center pb-10 pt-20">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center lg:gap-12">
          <div className="relative h-[12.5rem] sm:h-[10.5rem] lg:h-[18rem]" aria-live="off">
            {beats.map((b, i) => (
              <BeatText key={i} beat={b} progress={scrollYProgress} first={i === 0} last={i === beats.length - 1} />
            ))}
          </div>
          <div className="rounded-3xl border border-line bg-panel/60 p-3 sm:p-5">
            <RulerChart model={model} progress={scrollYProgress} />
          </div>
        </div>
        <ProgressRail progress={scrollYProgress} count={beats.length} />
      </div>
    </div>
  );
}

function BeatText({ beat, progress, first, last }: { beat: Beat; progress: MotionValue<number>; first: boolean; last: boolean }) {
  const a = first ? -1 : beat.start - 0.03;
  const b = first ? -0.5 : beat.start + 0.03;
  const c = last ? 2 : beat.end - 0.03;
  const d = last ? 3 : beat.end + 0.03;
  const opacity = useTransform(progress, [a, b, c, d], [0, 1, 1, 0]);
  const y = useTransform(progress, [a, b, c, d], [18, 0, 0, -18]);
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-x-0 top-0 lg:top-1/2 lg:-translate-y-1/2">
      <p className="font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">{beat.title}</p>
      <p className="mt-3 max-w-md text-base leading-relaxed text-ink-2">{beat.body}</p>
    </motion.div>
  );
}

function ProgressRail({ progress, count }: { progress: MotionValue<number>; count: number }) {
  const width = useTransform(progress, [0, 1], ["0%", "100%"]);
  return (
    <div className="absolute inset-x-0 bottom-5 hidden h-px bg-line lg:block" aria-hidden>
      <motion.div className="h-px bg-lamp" style={{ width }} />
      {Array.from({ length: count - 1 }, (_, i) => (
        <span key={i} className="absolute -top-[3px] h-[7px] w-px bg-line-strong" style={{ left: `${((i + 1) / count) * 100}%` }} />
      ))}
    </div>
  );
}
