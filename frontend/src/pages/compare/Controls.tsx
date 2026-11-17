import { useCallback, useId, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, Dices, SearchCheck } from "lucide-react";
import type { Approach, DfaPayload, Language } from "@/lib/types";
import { runDfa, randomString } from "@/lib/automata";
import { showString } from "@/lib/meta";
import { Button, Panel, StringInput } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/utils";
import { EXAMPLES, EXAMPLE_KIND_LABEL } from "./examples";
import { useDisagreementFinder } from "./finder";

interface ControlsProps {
  languages: Language[];
  language: Language;
  draft: string;
  onDraft: (s: string) => void;
  onSubmit: (s: string) => void;
  onLanguage: (id: string) => void;
  loading: boolean;
  /** The ground-truth DFA, used to label the examples as in or out of the language. */
  truth?: DfaPayload;
  /** The string currently compared (from the link), to mark the active example. */
  current: string | null;
  /** From /api/approaches: which learned machines are not equivalent to the ground truth. */
  approaches?: Approach[];
  className?: string;
}

export function Controls({ languages, language, draft, onDraft, onSubmit, onLanguage, loading, truth, current, approaches, className }: ControlsProps) {
  const selectId = useId();
  const reduce = useReducedMotion();
  const examples = useMemo(
    () =>
      (EXAMPLES[language.id] ?? []).map((ex) => ({
        ...ex,
        member: truth && truth.alphabet.join() === language.alphabet.join() ? runDfa(truth, ex.string).accepted : null,
      })),
    [language, truth],
  );

  const run = useCallback(
    (s: string) => {
      onDraft(s);
      onSubmit(s);
    },
    [onDraft, onSubmit],
  );
  const finder = useDisagreementFinder(language, approaches, current, run);
  const searching = finder.state.status === "searching";

  const rollLong = () => {
    const length = 21 + Math.floor(Math.random() * 16);
    const s = randomString(language.alphabet, length);
    onDraft(s);
    onSubmit(s);
  };

  return (
    <Panel className={cn("p-5 sm:p-6", className)}>
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
        <div className="space-y-2">
          <label htmlFor={selectId} className="block text-sm font-medium text-ink-2">
            Language
          </label>
          <div className="relative">
            <select
              id={selectId}
              value={language.id}
              onChange={(e) => onLanguage(e.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-line-strong bg-panel pl-3.5 pr-10 text-[15px] text-ink outline-none transition-colors hover:border-ink-2 focus:border-[color:var(--lamp)]"
            >
              {languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} — {l.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          </div>
        </div>
        <div className="min-w-0 space-y-2 lg:pt-7">
          <p className="text-[15px] leading-relaxed text-ink-2">{language.description}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>
              As a <Term k="regular">regular</Term> expression
            </span>
            <code className="max-w-full break-all rounded-md bg-panel-2 px-2 py-0.5 font-mono text-[13px] text-ink">{language.regex}</code>
          </p>
        </div>
      </div>

      <div className="my-5 h-px bg-line" />

      <StringInput
        value={draft}
        onChange={onDraft}
        onSubmit={() => onSubmit(draft)}
        alphabet={language.alphabet}
        submitLabel="Compare every approach"
        loading={loading}
        label="String to classify"
        placeholder={`e.g. ${EXAMPLES[language.id]?.[0]?.string || language.alphabet.join("")}`}
      />

      <div className="mt-3">
        <p id={`${selectId}-examples`} className="mb-2 text-sm text-ink-2">
          Or try one of these
        </p>
        <div
          role="group"
          aria-labelledby={`${selectId}-examples`}
          className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:overflow-visible"
          data-lenis-prevent
        >
          {examples.map((ex, i) => {
            const active = current !== null && current === ex.string;
            return (
              <motion.button
                key={`${language.id}-${ex.kind}`}
                type="button"
                onClick={() => {
                  onDraft(ex.string);
                  onSubmit(ex.string);
                }}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: reduce ? 0 : 0.05 * i }}
                aria-pressed={active}
                className={cn(
                  "group relative flex w-[15.5rem] shrink-0 snap-start flex-col justify-start rounded-xl border px-3.5 py-2.5 text-left transition-colors md:w-auto",
                  active ? "border-[color:var(--lamp)] bg-lamp-soft" : "border-line bg-panel-2/40 hover:border-line-strong hover:bg-panel-2/70",
                )}
              >
                <span className="flex items-center justify-between gap-3 text-xs">
                  <span className={cn("font-medium", active ? "text-lamp" : "text-ink-2")}>{EXAMPLE_KIND_LABEL[ex.kind]}</span>
                  {ex.member !== null && (
                    <span className={cn("font-mono", ex.member ? "text-accept" : "text-reject")}>
                      {ex.member ? "∈" : "∉"} {language.id}
                      <span className="sr-only">{ex.member ? " (in the language)" : " (not in the language)"}</span>
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate font-mono text-[15px] tracking-wide text-ink">{showString(ex.string)}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{ex.why}</span>
              </motion.button>
            );
          })}
          <Button variant="ghost" onClick={rollLong} className="h-auto shrink-0 self-stretch rounded-xl border border-dashed border-line px-4 py-2.5 text-sm">
            <Dices size={16} aria-hidden />
            Random long string
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={finder.find}
            disabled={searching}
            aria-busy={searching}
            className="inline-flex min-h-11 items-center gap-2 rounded-full text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink-2 disabled:cursor-wait disabled:text-ink-2"
          >
            <SearchCheck size={16} aria-hidden className="shrink-0 text-ink-2" />
            {searching ? "Looking…" : "Find a string they disagree on"}
          </button>
          <p role="status" className="min-w-0 text-sm text-muted">
            {finder.state.status === "none"
              ? `No disagreement found for ${finder.state.language}: every approach matches the ground truth on the strings tried.`
              : ""}
          </p>
        </div>
      </div>
    </Panel>
  );
}
