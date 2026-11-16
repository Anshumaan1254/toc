import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Segmented } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import type { Learner } from "@/lib/types";

export interface LearnerMeta {
  id: Learner;
  /** Full name, used in sentences. */
  name: string;
  /** Short name for narrow screens. */
  short: string;
  color: string;
  mode: "passive" | "active";
  /** The ML model L* questions (ML learners only). */
  model?: "lr" | "dt" | "rf";
}

export const LEARNERS: LearnerMeta[] = [
  { id: "rpni", name: "RPNI", short: "RPNI", color: "var(--series-rpni)", mode: "passive" },
  { id: "edsm", name: "EDSM", short: "EDSM", color: "var(--series-edsm)", mode: "passive" },
  { id: "ml_dt", name: "Decision tree + L*", short: "DT + L*", color: "var(--series-dt)", mode: "active", model: "dt" },
  { id: "ml_lr", name: "Logistic regression + L*", short: "LR + L*", color: "var(--series-lr)", mode: "active", model: "lr" },
  { id: "ml_rf", name: "Random forest + L*", short: "RF + L*", color: "var(--series-rf)", mode: "active", model: "rf" },
];

export const LEARNER_BY_ID = Object.fromEntries(LEARNERS.map((l) => [l.id, l])) as Record<Learner, LearnerMeta>;

/** One line per learner. Terms live here, never inside the segmented buttons (a button cannot hold a button). */
const EXPLAIN: Record<Learner, ReactNode> = {
  rpni: (
    <>
      <Term k="rpni">RPNI</Term> builds a <Term k="pta">prefix tree</Term> with one path per example, then merges its states in a fixed order
      whenever no example is contradicted.
    </>
  ),
  edsm: (
    <>
      <Term k="edsm">EDSM</Term> merges the same prefix tree, but always performs the merge that the most examples agree on first.
    </>
  ),
  ml_dt: (
    <>
      A decision tree learns from your examples, then <Term k="lstar">L*</Term> asks it about strings you never wrote and builds the DFA it
      behaves like.
    </>
  ),
  ml_lr: (
    <>
      A logistic regression learns string features from your examples, then <Term k="lstar">L*</Term> extracts the DFA that mimics it.
    </>
  ),
  ml_rf: (
    <>
      A random forest learns from your examples, then <Term k="lstar">L*</Term> extracts the DFA that mimics it.
    </>
  ),
};

export function LearnerPicker({ value, onChange }: { value: Learner; onChange: (l: Learner) => void }) {
  const reduce = useReducedMotion();
  const meta = LEARNER_BY_ID[value];
  return (
    <div className="space-y-4">
      <Segmented<Learner>
        label="Learning algorithm"
        value={value}
        onChange={onChange}
        className="rounded-2xl sm:rounded-full"
        options={LEARNERS.map((l) => ({
          value: l.id,
          title: l.name,
          label: (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden />
              <span className="lg:hidden">{l.short}</span>
              <span className="hidden lg:inline">{l.name}</span>
            </span>
          ),
        }))}
      />
      <div className="relative min-h-[4.5rem] max-w-3xl sm:min-h-[3.25rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={value}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ duration: 0.22 }}
            className="text-[15px] text-ink-2"
          >
            <span className="mr-2 inline-flex translate-y-[-1px] items-center rounded-full border border-line px-2 py-0.5 align-middle text-xs font-medium text-muted">
              {meta.mode === "passive" ? "Passive: uses only your examples" : "Active: the model answers L*'s questions"}
            </span>
            {EXPLAIN[value]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
