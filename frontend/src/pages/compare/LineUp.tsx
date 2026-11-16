import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowUpRight, Check, CircleSlash, X } from "lucide-react";
import type { CompareRow, Family, Language } from "@/lib/types";
import { duration, pct } from "@/lib/meta";
import { BorderBeam } from "@/components/magicui/border-beam";
import { Skeleton } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/utils";
import { TIME_TICKS, groupByFamily, isWrong, raceSeconds, sizeLine, tidy, timeFraction, type Slot } from "./model";

/** Shared column template: approach, verdict, evidence, time. Below lg each row stacks. */
const COLS = "lg:grid-cols-[minmax(0,17rem)_8.5rem_minmax(0,1fr)_minmax(0,13rem)]";

const FAMILY_COPY: Record<Family, { title: string; body: ReactNode }> = {
  truth: {
    title: "Ground truth",
    body: (
      <>
        Correct by construction: the hand-built <Term k="dfa">DFA</Term>, an <Term k="nfa">NFA</Term> for the same language, and the DFA that{" "}
        <Term k="subset-construction">subset construction</Term> and <Term k="minimization">minimization</Term> turn that NFA into.
      </>
    ),
  },
  learned: {
    title: "Learned automata",
    body: (
      <>
        DFAs nobody wrote by hand. <Term k="lstar">L*</Term> extracts one from each trained model by asking it questions;{" "}
        <Term k="rpni">RPNI</Term> and <Term k="edsm">EDSM</Term> infer one straight from the labelled training strings.
      </>
    ),
  },
  ml: {
    title: "ML pipelines",
    body: (
      <>
        Classifiers that never see states, only generic features of the string such as symbol counts, n-grams and the last few symbols. They output a
        probability of accepting; 50% is the threshold.
      </>
    ),
  },
};

// ------------------------------------------------------------------ small pieces
function StateChip({ id, accepting }: { id: string; accepting?: boolean }) {
  return (
    <span
      className={cn(
        "inline-grid h-7 min-w-7 shrink-0 place-items-center rounded-full border border-ink-2/70 bg-[color:var(--state-fill)] px-2 font-mono text-[12.5px] leading-none text-ink",
        accepting && "outline outline-1 outline-offset-2 outline-[color:var(--ink-2)]",
      )}
      title={accepting ? `${id} (accepting state)` : id}
    >
      {id}
    </span>
  );
}

function VerdictChip({ accepted }: { accepted: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border-[1.5px] px-2 font-mono text-[12px] font-semibold tracking-[0.14em]",
        accepted ? "border-[color:var(--accept)] text-accept" : "border-[color:var(--reject)] text-reject",
      )}
    >
      {accepted ? "ACCEPT" : "REJECT"}
    </span>
  );
}

function TimeTicks() {
  return (
    <>
      {TIME_TICKS.slice(0, -1).map((t) => (
        <span key={t.label} aria-hidden className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line-strong" style={{ left: `${timeFraction(t.ms) * 100}%` }} />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ one approach
interface RowProps {
  slot: Slot;
  language: Language;
  /** Identity of the comparison on screen (language|string); a new key replays the race. */
  runKey: string | null;
  /** A newer comparison is loading: dim the old one. */
  stale: boolean;
  /** No comparison yet, and none loading. */
  idle: boolean;
  /** A comparison is loading and this row has nothing to show yet. */
  loading: boolean;
  notes?: Record<string, string>;
  /** Position in the whole line-up: starts cascade from top to bottom. */
  order: number;
}

function ApproachRow({ slot, language, runKey, stale, idle, loading, notes, order }: RowProps) {
  const { meta, row } = slot;
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { amount: 0.55 });
  const [raced, setRaced] = useState<string | null>(null);

  useEffect(() => {
    if (runKey && row && inView && raced !== runKey) setRaced(runKey);
  }, [runKey, row, inView, raced]);

  const available = row ? row.available : (slot.approach?.available ?? true);
  const wrong = isWrong(row);
  const show = reduce || (raced !== null && raced === runKey);
  // Every head runs at the same speed along a log time axis, so the slower a machine, the later its verdict lands.
  const dur = reduce ? 0 : raceSeconds(row?.time_ms);
  const t0 = reduce ? 0 : order * 0.035;
  const tLand = t0 + dur;
  const land = reduce ? { duration: 0 } : { delay: tLand, type: "spring" as const, stiffness: 480, damping: 24 };
  const size = sizeLine(meta, slot.approach);
  const name = meta.name;
  // Keep the link arrow on the same line as the last word when the name wraps.
  const cut = name.lastIndexOf(" ");
  const nameHead = cut > 0 ? name.slice(0, cut + 1) : "";
  const nameTail = cut > 0 ? name.slice(cut + 1) : name;

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="h-10 w-1 shrink-0 rounded-full" style={{ background: meta.color }} />
      <div className="min-w-0">
        <div className="leading-tight lg:truncate">
          <Link
            to={`/explore/${language.id}/${meta.id}`}
            className="group/name font-display text-[17px] font-semibold text-ink transition-colors hover:text-lamp"
            aria-label={`${name}: open it in the explorer`}
          >
            {nameHead}
            <span className="whitespace-nowrap">
              {nameTail}
              <ArrowUpRight
                size={14}
                aria-hidden
                className="ml-1 inline-block align-[-1px] opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100"
              />
            </span>
          </Link>
        </div>
        <p className="mt-0.5 text-xs text-muted lg:truncate">{size ?? (meta.kind === "ml" ? "ML pipeline" : meta.kind.toUpperCase())}</p>
      </div>
    </div>
  );

  // ---------------------------------------------------------------- states without a verdict
  if (!row || !available) {
    const unavailable = row ? !row.available : slot.approach?.available === false;
    return (
      <li ref={ref} id={`row-${meta.id}`} tabIndex={-1} className="scroll-mt-32 rounded-2xl outline-none">
        <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-3 py-4 sm:px-4 lg:gap-x-6", COLS, unavailable && "opacity-55")}>
          {identity}
          {unavailable ? (
            <p className="col-span-2 flex items-center gap-2 text-sm text-muted lg:col-span-3">
              <CircleSlash size={15} aria-hidden className="shrink-0" />
              {row?.explanation ? tidy(row.explanation) : `No result for ${language.id}: this approach was not trained or extracted for it.`}
            </p>
          ) : loading ? (
            <>
              <Skeleton className="h-7 w-20 justify-self-end lg:justify-self-start" />
              <div className="col-span-2 grid grid-cols-2 gap-4 lg:contents">
                <Skeleton className="h-7 w-full max-w-56" />
                <Skeleton className="h-7 w-full" />
              </div>
            </>
          ) : (
            <>
              <span className="justify-self-end font-mono text-sm text-muted lg:justify-self-start" aria-hidden>
                {idle ? "—" : ""}
              </span>
              <span className="hidden text-sm text-muted lg:block">{idle ? "Waiting for a string" : ""}</span>
              <span className="hidden lg:block" />
            </>
          )}
        </div>
      </li>
    );
  }

  // ---------------------------------------------------------------- evidence
  let evidence: ReactNode;
  if (meta.kind === "ml") {
    const p = row.probability ?? null;
    evidence = (
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted">P(accept)</span>
          <span className="font-mono text-sm text-ink">{p === null ? "–" : pct(p)}</span>
        </div>
        <div className="relative mt-1.5 h-2 rounded-full bg-panel-2" aria-hidden>
          <motion.div
            key={runKey}
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: meta.color }}
            initial={reduce ? false : { width: "0%" }}
            animate={{ width: show && p !== null ? `${p * 100}%` : "0%" }}
            transition={reduce ? { duration: 0 } : { delay: tLand, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <span className="absolute -inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ink-2" title="Threshold: 50%" />
        </div>
      </div>
    );
  } else if (meta.kind === "nfa") {
    const set = row.final_states ?? [];
    const visible = set.slice(0, 4);
    evidence = (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        <span className="mr-0.5 shrink-0 text-muted">{set.length === 0 ? "no active states" : `ends in ${set.length} state${set.length === 1 ? "" : "s"}`}</span>
        {visible.map((q) => (
          <StateChip key={q} id={q} />
        ))}
        {set.length > visible.length && <span className="font-mono text-xs text-muted">+{set.length - visible.length}</span>}
      </div>
    );
  } else {
    const q = row.final_state ?? null;
    const note = meta.id === "dfa" && q ? notes?.[q] : undefined;
    evidence =
      q === null ? (
        <p className="text-sm text-muted">No move for a symbol, so it stops and rejects.</p>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm lg:flex-nowrap">
          <span className="shrink-0 text-muted">stops in</span>
          <StateChip id={q} accepting={row.accepted} />
          {note && <span className="min-w-0 text-ink-2 lg:truncate">{note}</span>}
        </div>
      );
  }

  const ms = row.time_ms;
  const frac = timeFraction(ms);

  return (
    <li ref={ref} id={`row-${meta.id}`} tabIndex={-1} className="relative scroll-mt-32 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lamp)]">
      {wrong && (
        <motion.div
          key={runKey}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl border border-[color:var(--reject)]/65 bg-[color:var(--reject)]/[0.06]"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: show ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { delay: tLand, duration: 0.35 }}
        >
          {show && !reduce && <BorderBeam size={160} duration={7} delay={dur} colorFrom="var(--reject)" colorTo="var(--lamp)" borderWidth={1.5} />}
        </motion.div>
      )}

      <div
        className={cn(
          "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-3 py-4 transition-opacity duration-300 sm:px-4 lg:gap-x-6",
          COLS,
          stale && "opacity-45",
        )}
      >
        {identity}

        {/* verdict */}
        <div className="flex items-center gap-2 justify-self-end lg:justify-self-start">
          <motion.span
            key={runKey}
            className="inline-flex"
            initial={reduce ? false : { opacity: 0, scale: 1.7, rotate: -12 }}
            animate={show ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 1.7, rotate: -12 }}
            transition={land}
          >
            <VerdictChip accepted={!!row.accepted} />
          </motion.span>
          <motion.span
            key={`${runKey}-mark`}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={show ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
            transition={reduce ? { duration: 0 } : { ...land, delay: tLand + 0.12 }}
            className={cn("grid h-6 w-6 place-items-center rounded-full", wrong ? "bg-[color:var(--reject)] text-[color:var(--bg)]" : "text-accept")}
            title={wrong ? "Disagrees with the ground truth" : "Agrees with the ground truth"}
          >
            {wrong ? <X size={15} strokeWidth={3} aria-hidden /> : <Check size={17} strokeWidth={2.6} aria-hidden />}
            <span className="sr-only">{wrong ? "disagrees with the ground truth" : "agrees with the ground truth"}</span>
          </motion.span>
        </div>

        {/* evidence + time (side by side on phones, their own columns on desktop) */}
        <div className="col-span-2 grid grid-cols-2 items-center gap-x-5 gap-y-3 lg:contents">
          <motion.div
            key={`${runKey}-evidence`}
            className="min-w-0"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
            transition={reduce ? { duration: 0 } : { delay: tLand, duration: 0.3 }}
          >
            {evidence}
          </motion.div>

          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted lg:sr-only">Time to decide</span>
              <span className="ml-auto font-mono text-sm text-ink-2">{duration(ms === undefined ? undefined : ms / 1000)}</span>
            </div>
            <div className="relative mt-1.5 h-[5px] rounded-full bg-panel-2" aria-hidden>
              <TimeTicks />
              <motion.div
                key={runKey}
                className="absolute inset-y-0 left-0 rounded-full bg-ink-2/55"
                initial={reduce ? false : { width: "0%" }}
                animate={{ width: show ? `${frac * 100}%` : "0%" }}
                transition={reduce ? { duration: 0 } : { delay: t0, duration: dur, ease: "linear" }}
              >
                {!reduce && (
                  <motion.span
                    className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-lamp shadow-[0_0_12px_var(--lamp)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: show ? [0, 1, 1, 0] : 0 }}
                    transition={{ delay: t0, duration: dur + 0.45, times: [0, 0.04, 0.8, 1] }}
                  />
                )}
              </motion.div>
            </div>
          </div>
        </div>

        {wrong && row.explanation && (
          <motion.p
            key={`${runKey}-why`}
            className="col-span-2 flex flex-col gap-1 border-t border-[color:var(--reject)]/30 pt-3 text-[15px] leading-relaxed text-ink sm:flex-row sm:gap-3 lg:col-span-4"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={reduce ? { duration: 0 } : { delay: tLand + 0.15, duration: 0.4 }}
          >
            <span className="shrink-0 font-medium text-reject sm:w-[17rem] lg:pl-4">Why it disagrees</span>
            <span className="min-w-0">{tidy(row.explanation)}</span>
          </motion.p>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ the read-head rail (scroll-linked, desktop)
/**
 * A vertical rail beside the line-up whose amber head follows the scroll position, like a read head
 * moving down a tape of approaches. Adapted from Aceternity UI's TracingBeam (MIT): blueprint colours,
 * a measured height that follows the content, and no motion with reduced motion.
 */
function ReadHeadRail({ target }: { target: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start 70%", "end 70%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 38, mass: 0.4 });
  const top = useTransform(progress, (v) => `${Math.min(1, Math.max(0, v)) * 100}%`);
  if (reduce) return <div aria-hidden className="absolute bottom-6 left-[19px] top-2 hidden w-px bg-line xl:block" />;
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-6 left-[19px] top-2 hidden w-px xl:block">
      <div className="absolute inset-0 bg-line" />
      <motion.div className="absolute inset-x-0 top-0 h-full origin-top bg-[color:var(--lamp)]/70" style={{ scaleY: progress }} />
      <motion.div className="absolute -left-[5px] -mt-[5.5px] h-[11px] w-[11px] rounded-full bg-lamp shadow-[0_0_14px_var(--lamp)]" style={{ top }} />
    </div>
  );
}

// ------------------------------------------------------------------ the whole line-up
interface LineUpProps {
  slots: Slot[];
  language: Language;
  runKey: string | null;
  stale: boolean;
  idle: boolean;
  loading: boolean;
  hasResult: boolean;
  notes?: Record<string, string>;
}

export function LineUp({ slots, language, runKey, stale, idle, loading, hasResult, notes }: LineUpProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const groups = groupByFamily(slots);

  return (
    <div ref={ref} className="relative xl:pl-14">
      <ReadHeadRail target={ref} />

      <div
        className={cn(
          "sticky top-[76px] z-10 hidden items-center gap-x-6 rounded-xl border border-line bg-bg px-4 py-2 text-xs text-muted shadow-[var(--shadow)] lg:grid",
          COLS,
        )}
      >
        <span>Approach</span>
        <span>Verdict</span>
        <span>Evidence: final state or probability</span>
        <span className="block">
          <span className="block">Time to decide, log scale</span>
          <span aria-hidden className="relative mt-1 block h-3.5">
            {TIME_TICKS.map((t, i) => (
              <span
                key={t.label}
                className={cn(
                  "absolute whitespace-nowrap font-mono text-[10px] text-muted/80",
                  i === TIME_TICKS.length - 1 ? "right-0" : "-translate-x-1/2",
                )}
                style={i === TIME_TICKS.length - 1 ? undefined : { left: `${timeFraction(t.ms) * 100}%` }}
              >
                {t.label}
              </span>
            ))}
          </span>
        </span>
      </div>

      {groups.map(({ family, slots: members }) => {
        const rows = members.map((s) => s.row).filter((r): r is CompareRow => !!r && r.available);
        const wrong = rows.filter((r) => r.correct === false).length;
        const copy = FAMILY_COPY[family];
        return (
          <section key={family} aria-labelledby={`family-${family}`} className="relative pt-12 first-of-type:pt-10">
            <motion.div
              className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-line-strong px-1 pb-3"
              initial={reduce ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <span
                aria-hidden
                className="absolute -left-[42.5px] top-[12px] hidden h-3 w-3 rounded-full border-2 border-[color:var(--ink-2)] bg-bg xl:block"
                style={{ boxShadow: "0 0 0 4px var(--bg)" }}
              />
              <div className="min-w-0 max-w-3xl">
                <h3 id={`family-${family}`} className="font-display text-[28px] font-semibold text-ink">
                  {copy.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{copy.body}</p>
              </div>
              {hasResult && rows.length > 0 && (
                <p className={cn("font-mono text-sm", wrong ? "text-reject" : "text-accept")}>
                  {wrong ? `${wrong} of ${rows.length} disagree` : rows.length === 1 ? "agrees" : `all ${rows.length} agree`}
                </p>
              )}
            </motion.div>
            <ol className="mt-2 space-y-1">
              {members.map((slot) => (
                <ApproachRow
                  key={slot.meta.id}
                  slot={slot}
                  language={language}
                  runKey={runKey}
                  stale={stale}
                  idle={idle}
                  loading={loading}
                  notes={notes}
                  order={slots.indexOf(slot)}
                />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
