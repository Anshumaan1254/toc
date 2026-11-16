import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CircleCheck, SearchX } from "lucide-react";
import { Confetti, type ConfettiRef } from "@/components/magicui/confetti";
import { Button } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { showString } from "@/lib/meta";
import { useThemeColors } from "@/lib/theme";
import type { LearnResult } from "@/lib/types";
import { compareWithRule, type Preset } from "./presets";

/**
 * Did the machine learn the rule behind the preset? An exact answer: breadth-first search over
 * the product of the learned DFA and the rule's minimal DFA. A miss comes with the shortest
 * counterexample, which the visitor can feed back to the learner, playing L*'s teacher.
 */
export function RuleCheck({
  preset,
  result,
  busy,
  onAddCounterexample,
  onTryString,
}: {
  preset: Preset;
  result: LearnResult;
  busy: boolean;
  onAddCounterexample: (s: string, accepted: boolean) => void;
  onTryString: (s: string) => void;
}) {
  const reduce = useReducedMotion();
  const colors = useThemeColors();
  const confetti = useRef<ConfettiRef>(null);
  const check = useMemo(() => compareWithRule(result.automaton, preset.dfa), [result.automaton, preset.dfa]);
  const exact = check?.equivalent === true;

  useEffect(() => {
    if (!exact || reduce) return;
    const t = window.setTimeout(() => {
      void confetti.current?.fire({
        particleCount: 46,
        spread: 70,
        startVelocity: 26,
        gravity: 1.15,
        ticks: 140,
        scalar: 0.75,
        origin: { x: 0.12, y: 0.35 },
        colors: [colors.accept, colors.lamp, colors.ink2],
      });
    }, 650);
    return () => window.clearTimeout(t);
    // fire once per learned machine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.session_id, exact]);

  if (!check) {
    return (
      <section aria-labelledby="rule-title" className="rounded-2xl border border-line p-5">
        <h3 id="rule-title" className="font-display text-xl font-semibold text-ink">
          Did it learn “{preset.label.toLowerCase()}”?
        </h3>
        <p className="mt-1 text-sm text-ink-2">
          The rule is over {`{${preset.alphabet.join(", ")}}`} but your examples use {`{${result.alphabet.join(", ")}}`}, so the two machines cannot be
          compared.
        </p>
      </section>
    );
  }

  const cx = check.counterexample;
  const learnedAccepts = check.learnedAccepts === true;
  const ruleAccepts = cx !== null ? preset.accepts(cx) : false;

  return (
    <motion.section
      aria-labelledby="rule-title"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2 }}
      className={
        exact
          ? "relative rounded-2xl border border-[color:var(--accept)]/40 bg-accept-soft p-5"
          : "relative rounded-2xl border border-line bg-panel/85 p-5 shadow-[inset_3px_0_0_var(--lamp)]"
      }
    >
      <Confetti
        ref={confetti}
        manualstart
        globalOptions={{ resize: true, useWorker: false }}
        className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl"
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        {exact ? <CircleCheck className="mt-0.5 shrink-0 text-accept" size={22} aria-hidden /> : <SearchX className="mt-0.5 shrink-0 text-lamp" size={22} aria-hidden />}
        <div className="min-w-0 space-y-2">
          <h3 id="rule-title" className="font-display text-xl font-semibold text-ink">
            {exact ? `It learned “${preset.label.toLowerCase()}” exactly` : `Not quite “${preset.label.toLowerCase()}” yet`}
          </h3>
          {exact ? (
            <p className="text-sm text-ink-2">
              The machine accepts precisely the {preset.rule}. An <Term k="equivalence">equivalence check</Term> walked all {check.pairsVisited}{" "}
              reachable state pairs of the <Term k="product">product automaton</Term> and found no string on which the two disagree. The smallest
              DFA for this rule has {check.targetStates} states, and so does this one.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-2">
                The shortest string where the machine and the rule disagree is{" "}
                <code className="rounded-md bg-panel px-1.5 py-0.5 font-mono text-[15px] text-ink">{showString(cx ?? "")}</code>. The machine{" "}
                {learnedAccepts ? "accepts" : "rejects"} it, but {ruleAccepts ? preset.whyAccept(cx ?? "") : preset.whyReject(cx ?? "")}.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={() => onAddCounterexample(cx ?? "", ruleAccepts)} loading={busy}>
                  Add {showString(cx ?? "")} to {ruleAccepts ? "Accepted" : "Rejected"} and learn again
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onTryString(cx ?? "")}>
                  Run it on the test bench
                </Button>
              </div>
              <p className="pt-1 text-xs text-muted">
                That string is a <Term k="counterexample">counterexample</Term>, exactly what an <Term k="equivalence-query">equivalence query</Term>{" "}
                hands back to L*. Each one you add forces the learner to keep more prefixes apart.
              </p>
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}
