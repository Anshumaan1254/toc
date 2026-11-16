import { useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Link2, X } from "lucide-react";
import type { CompareResult, Family, Language } from "@/lib/types";
import { APPROACH_BY_ID } from "@/lib/meta";
import { useLenis } from "@/components/layout/SmoothScroll";
import { Button } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/utils";
import { FAMILY_ORDER, describeApproaches, isWrong, type Slot } from "./model";

const FAMILY_SHORT: Record<Family, string> = { truth: "Ground truth", learned: "Learned automata", ml: "ML pipelines" };

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

interface SummaryProps {
  result: CompareResult;
  language: Language;
  slots: Slot[];
  maxTrain?: number;
  runKey: string;
  stale: boolean;
}

/**
 * The verdict of the line-up in one sentence, plus a scoreboard of every approach (agrees or
 * disagrees) that jumps to its row. The sentence is the page's live region for screen readers.
 */
export function Summary({ result, language, slots, maxTrain, runKey, stale }: SummaryProps) {
  const reduce = useReducedMotion() ?? false;
  const lenis = useLenis();
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const groups = FAMILY_ORDER.map((family) => ({ family, members: slots.filter((s) => s.meta.family === family) })).filter((g) => g.members.length > 0);
  const answered = result.results.filter((r) => r.available);
  const unavailable = result.results.length - answered.length;
  const wrong = result.disagreements;
  const L = language.id;
  const subject = result.length === 0 ? "ε" : "the string";

  const headline =
    wrong.length === 0 ? (
      <>Every approach agrees with the ground truth.</>
    ) : (
      <>
        <span className="text-reject">
          {wrong.length} of {answered.length}
        </span>{" "}
        approaches {wrong.length === 1 ? "disagrees" : "disagree"} with the ground truth.
      </>
    );

  const detail =
    wrong.length === 0
      ? `All ${answered.length} ${result.truth ? "accept" : "reject"} ${subject}, exactly as the ground-truth DFA does.`
      : `${capitalize(describeApproaches(wrong))} ${wrong.length === 1 ? "says" : "say"} ${subject} is ${result.truth ? "not in" : "in"} ${L}, but it ${
          result.truth ? "is" : "is not"
        }.`;

  const jump = (id: string) => {
    const el = document.getElementById(`row-${id}`);
    if (!el) return;
    // Measure from the real scroll position: Lenis's own idea of it can lag behind a native scroll (focus, find-in-page).
    const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 150);
    if (lenis) {
      lenis.scrollTo(window.scrollY, { immediate: true, force: true });
      lenis.scrollTo(y, { duration: 1.1 });
    } else {
      window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
    }
    el.focus({ preventScroll: true });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2200);
  };

  return (
    <section aria-labelledby="summary-title" className={cn("transition-opacity duration-300", stale && "opacity-50")}>
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <motion.div
          key={runKey}
          className="min-w-0 max-w-4xl flex-1 basis-[36rem]"
          initial={reduce ? false : { opacity: 0, y: 16, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <h2 id="summary-title" className="max-w-4xl font-display text-[34px] font-semibold leading-[1.05] text-ink sm:text-5xl">
            {headline}
          </h2>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">
            {detail}
            {result.longer_than_training && (
              <>
                {" "}
                At {result.length} symbols it is longer than every training string{maxTrain !== undefined ? ` (the longest had ${maxTrain})` : ""}, so this
                is a test of <Term k="generalization">generalization</Term>.
              </>
            )}
            {unavailable > 0 && (
              <>
                {" "}
                {unavailable} {unavailable === 1 ? "approach has" : "approaches have"} no result for {L} yet.
              </>
            )}
          </p>
        </motion.div>
        <Button variant="outline" size="sm" onClick={copyLink} aria-live="polite" className="shrink-0 sm:mt-3">
          {copied === "done" ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
          {copied === "done" ? "Link copied" : copied === "failed" ? "Copy the address bar instead" : "Copy a link to this comparison"}
        </Button>
      </div>

      {/* The scoreboard: one tape cell per approach, families marked with dimension lines as on a drawing. */}
      <div
        className="mt-9 grid gap-x-3 gap-y-6 lg:[grid-template-columns:var(--families)]"
        style={{ "--families": groups.map((g) => `${g.members.length}fr`).join(" ") } as CSSProperties}
      >
        {groups.map(({ family, members }, g) => (
          <div key={family} className="min-w-0">
            <ul className={cn("grid gap-1", members.length > 4 ? "grid-cols-3 sm:grid-cols-6 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" : "grid-cols-4 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]")} style={{ "--n": members.length } as CSSProperties}>
              {members.map((s, i) => {
                const bad = isWrong(s.row);
                const missing = !s.row || !s.row.available;
                const meta = APPROACH_BY_ID[s.meta.id];
                const order = groups.slice(0, g).reduce((n, x) => n + x.members.length, 0) + i;
                return (
                  <motion.li
                    key={`${runKey}-${s.meta.id}`}
                    className="min-w-0"
                    initial={reduce ? false : { opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : 0.2 + order * 0.05, duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    <button
                      type="button"
                      onClick={() => jump(s.meta.id)}
                      className={cn(
                        "relative flex h-[52px] w-full flex-col justify-between overflow-hidden rounded-md border px-2 pb-1.5 pt-2 text-left transition-colors",
                        missing
                          ? "border-dashed border-line text-muted"
                          : bad
                            ? "border-[color:var(--reject)] bg-reject-soft text-ink hover:bg-[color:var(--reject)]/20"
                            : "border-line-strong bg-panel/70 text-ink-2 hover:border-ink-2 hover:text-ink",
                      )}
                      aria-label={`${meta.name}: ${missing ? "no result" : bad ? "disagrees with the ground truth" : "agrees with the ground truth"}. Jump to its row.`}
                    >
                      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: meta.color }} />
                      <span className="block truncate font-mono text-[11.5px] leading-none">{meta.short}</span>
                      <span className="flex items-center justify-between">
                        {missing ? (
                          <span className="text-[11px]">n/a</span>
                        ) : bad ? (
                          <X size={15} strokeWidth={3} className="text-reject" aria-hidden />
                        ) : (
                          <Check size={15} strokeWidth={3} className="text-accept" aria-hidden />
                        )}
                        {!missing && s.row?.accepted !== undefined && (
                          <span
                            aria-hidden
                            title={s.row.accepted ? "accepts" : "rejects"}
                            className={cn("font-mono text-[13px] leading-none", s.row.accepted ? "text-accept" : "text-reject")}
                          >
                            {s.row.accepted ? "∈" : "∉"}
                          </span>
                        )}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
            <div aria-hidden className="mx-px mt-2 h-2 rounded-b-[3px] border-x border-b border-line-strong" />
            <p className="mt-1.5 text-center text-xs text-muted">{FAMILY_SHORT[family]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
