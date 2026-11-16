import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Dices, X } from "lucide-react";
import { Button, ErrorState, StringInput } from "@/components/ui/primitives";
import { ApiError, errorMessage } from "@/lib/api";
import { pct, showString } from "@/lib/meta";
import type { LearnClassifyResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { randomTestString, type Run } from "./model";

const MODELS: { id: "lr" | "dt" | "rf"; name: string; color: string }[] = [
  { id: "lr", name: "Logistic regression", color: "var(--series-lr)" },
  { id: "dt", name: "Decision tree", color: "var(--series-dt)" },
  { id: "rf", name: "Random forest", color: "var(--series-rf)" },
];

function agreementLine(agree: number, total: number): string {
  if (agree === total) return `All ${total === 3 ? "three" : total} ML models agree with the learned DFA.`;
  if (agree === 0) return `None of the ${total === 3 ? "three" : total} ML models agrees with the learned DFA.`;
  return `${agree} of ${total} ML models agree with the learned DFA.`;
}

function VerdictBoard({ run, done }: { run: Run; done: boolean }) {
  const reduce = useReducedMotion();
  const r = run.result;
  const total = MODELS.filter((m) => r.ml[m.id]).length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2/40 px-3.5 py-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-lamp shadow-[0_0_8px_var(--lamp)]" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">Learned DFA</span>
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.span
              key="verdict"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold", r.accepted ? "bg-accept-soft text-accept" : "bg-reject-soft text-reject")}
            >
              {r.accepted ? "accepts" : "rejects"}
            </motion.span>
          ) : (
            <motion.span key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-muted">
              reading…
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {MODELS.map((m, idx) => {
        const v = r.ml[m.id];
        if (!v) return null;
        const agrees = v.accepted === r.accepted;
        return (
          <div key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-3.5 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} aria-hidden />
            <span className="min-w-0 truncate text-sm text-ink-2">{m.name}</span>
            <span className="flex items-center gap-2 justify-self-end text-sm">
              <span className={cn("font-medium", v.accepted ? "text-accept" : "text-reject")}>{v.accepted ? "accepts" : "rejects"}</span>
              <span className="grid h-5 w-5 place-items-center" aria-hidden>
                <AnimatePresence>
                  {done && (
                    <motion.span
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: reduce ? 0 : 0.08 * idx, type: "spring", stiffness: 500, damping: 24 }}
                      className={agrees ? "text-accept" : "text-reject"}
                    >
                      {agrees ? <Check size={16} strokeWidth={2.6} /> : <X size={16} strokeWidth={2.6} />}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </span>
            <div className="col-span-3 flex items-center gap-3 pl-[1.375rem]">
              <div
                className="relative h-2 flex-1 overflow-hidden rounded-full bg-panel-2"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(v.probability * 100)}
                aria-label={`${m.name}: probability the string is accepted`}
              >
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: m.color }}
                  initial={reduce ? false : { width: "0%" }}
                  animate={{ width: `${Math.max(1.5, v.probability * 100)}%` }}
                  transition={{ duration: 0.7, delay: 0.05 * idx, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className="absolute inset-y-0 left-1/2 w-px bg-ink/50" aria-hidden />
              </div>
              <span className="tabular w-14 text-right font-mono text-xs text-ink-2">{pct(v.probability)}</span>
            </div>
          </div>
        );
      })}

      <p className={cn("min-h-6 px-1 text-sm font-medium transition-opacity", done ? "opacity-100" : "opacity-0")} aria-live="polite">
        {done ? agreementLine(r.agreement, total) : ""}
      </p>
    </div>
  );
}

export function TestBench({
  alphabet,
  input,
  onInput,
  onTest,
  pending,
  error,
  run,
  done,
  history,
  onReplay,
  onRelearn,
}: {
  alphabet: string[];
  input: string;
  onInput: (s: string) => void;
  onTest: (s: string) => void;
  pending: boolean;
  error: unknown;
  run: Run | null;
  done: boolean;
  history: LearnClassifyResult[];
  onReplay: (r: LearnClassifyResult) => void;
  onRelearn: () => void;
}) {
  const expired = error instanceof ApiError && error.status === 404;
  return (
    <section aria-labelledby="test-title" className="space-y-5">
      <div>
        <h3 id="test-title" className="font-display text-2xl font-semibold text-ink">
          Test a string
        </h3>
        <p className="mt-1 text-ink-2">The learned DFA reads it symbol by symbol; the three ML models trained on your examples judge it at the same time.</p>
      </div>

      <StringInput
        value={input}
        onChange={onInput}
        onSubmit={() => onTest(input)}
        alphabet={alphabet}
        maxLength={200}
        submitLabel="Run the string"
        loading={pending}
        label="String to test"
      />
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const s = randomTestString(alphabet);
            onInput(s);
            onTest(s);
          }}
        >
          <Dices size={15} aria-hidden /> Run a random string
        </Button>
      </div>

      {error !== null && error !== undefined && (
        <div className="space-y-3">
          <ErrorState message={errorMessage(error)} onRetry={expired ? undefined : () => onTest(input)} />
          {expired && (
            <Button variant="outline" size="sm" onClick={onRelearn}>
              Learn the automaton again
            </Button>
          )}
        </div>
      )}

      {run && <VerdictBoard key={run.id} run={run} done={done} />}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted">Tested so far. Pick one to replay it.</p>
          <ul className="flex flex-wrap gap-2">
            {history.map((h) => {
              const current = run?.result.string === h.string;
              return (
                <li key={h.string === "" ? "ε" : h.string}>
                  <button
                    type="button"
                    onClick={() => onReplay(h)}
                    aria-label={`Replay ${showString(h.string)}: the DFA ${h.accepted ? "accepts" : "rejects"} it, ${h.agreement} of 3 ML models agree`}
                    className={cn(
                      "flex max-w-[15rem] items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      current ? "border-line-strong bg-panel-2 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", h.accepted ? "bg-accept" : "bg-reject")} aria-hidden />
                    <span className="truncate font-mono">{showString(h.string)}</span>
                    <span className="tabular shrink-0 text-xs text-muted">{h.agreement}/3</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
