import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { errorMessage, useApproaches, useAutomaton, useCompare, useLanguages, useSummary } from "@/lib/api";
import type { CompareResult, DfaPayload } from "@/lib/types";
import SplitText from "@/components/reactbits/SplitText";
import { Button, ErrorState, Panel, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { HeaderDots } from "./HeaderDots";
import { Controls } from "./Controls";
import { TruthBanner, TruthBannerSkeleton } from "./TruthBanner";
import { Summary } from "./Summary";
import { LineUp } from "./LineUp";
import { DEFAULT_LANGUAGE, DEFAULT_STRING } from "./examples";
import { buildSlots, stateNotes } from "./model";

const MAX_LENGTH = 200;

const linkButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-[background,color,border-color] duration-150";

/**
 * Compare: one string, every approach. The link carries the state (?lang=L6&s=110), so a
 * comparison can be shared and the back button walks through earlier strings.
 */
export default function ComparePage() {
  const reduce = useReducedMotion() ?? false;
  const [params, setParams] = useSearchParams();
  const langParam = params.get("lang");
  const sParam = params.get("s"); // null: no string chosen yet; "": the empty string ε

  // A bare /compare opens on an informative example (replacing the entry, so Back still leaves the page).
  useEffect(() => {
    if (langParam === null && sParam === null) setParams({ lang: DEFAULT_LANGUAGE, s: DEFAULT_STRING }, { replace: true, preventScrollReset: true });
  }, [langParam, sParam, setParams]);

  const lang = langParam ?? DEFAULT_LANGUAGE;
  const languages = useLanguages();
  const language = languages.data?.find((l) => l.id === lang);
  const unknownLanguage = !!languages.data && !language;

  const approaches = useApproaches(language ? lang : undefined);
  const truthQuery = useAutomaton(language ? lang : undefined, "dfa");
  const summary = useSummary();
  const compare = useCompare();
  const { mutate } = compare;

  const truthAutomaton = truthQuery.data?.automaton;
  const truthDfa: DfaPayload | undefined = truthAutomaton?.kind === "dfa" ? truthAutomaton : undefined;
  const notes = useMemo(() => stateNotes(truthDfa?.meta), [truthDfa]);
  const maxTrain = summary.data?.meta.max_train_length;

  // ---------------------------------------------------------------- validate the link's string
  const invalidSymbols = useMemo(
    () => (language && sParam !== null ? [...new Set([...sParam].filter((c) => !language.alphabet.includes(c)))] : []),
    [language, sParam],
  );
  const tooLong = sParam !== null && sParam.length > MAX_LENGTH;
  const runKey = language && sParam !== null && invalidSymbols.length === 0 && !tooLong ? `${lang}|${sParam}` : null;

  // ---------------------------------------------------------------- run the comparison whenever the link changes
  const lastRun = useRef<string | null>(null);
  useEffect(() => {
    if (!runKey || sParam === null || lastRun.current === runKey) return;
    lastRun.current = runKey;
    mutate({ language: lang, string: sParam });
  }, [runKey, lang, sParam, mutate]);

  const [last, setLast] = useState<CompareResult | null>(null);
  useEffect(() => {
    if (compare.data) setLast(compare.data);
  }, [compare.data]);

  const current = last && runKey && `${last.language}|${last.string}` === runKey ? last : null;
  const stale = !current && compare.isPending && last && last.language === lang ? last : null;
  const shown = current ?? stale;
  const shownKey = shown ? `${shown.language}|${shown.string}` : null;
  // An error belongs to the link that caused it; a different language or string starts clean.
  const failed = compare.isError && !current && compare.variables?.language === lang && compare.variables?.string === sParam;

  // ---------------------------------------------------------------- the draft in the input box follows the link
  const [draft, setDraft] = useState(sParam ?? "");
  useEffect(() => {
    setDraft(sParam ?? "");
  }, [sParam, lang]);

  const submit = (s: string) => {
    if (!language) return;
    if (langParam === lang && s === sParam) {
      // Same link: run it again rather than navigating to itself.
      lastRun.current = `${lang}|${s}`;
      mutate({ language: lang, string: s });
      return;
    }
    setParams({ lang, s }, { preventScrollReset: true });
  };

  const changeLanguage = (id: string) => {
    const next = languages.data?.find((l) => l.id === id);
    if (!next) return;
    const keep = sParam !== null && draft.length <= MAX_LENGTH && [...draft].every((c) => next.alphabet.includes(c));
    if (!keep) setDraft("");
    compare.reset();
    setParams(keep ? { lang: id, s: draft } : { lang: id }, { preventScrollReset: true });
  };

  const slots = useMemo(() => buildSlots(approaches.data, shown), [approaches.data, shown]);

  // ---------------------------------------------------------------- scroll-linked header: the title drifts and fades as you scroll on
  const headerRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: headerRef, offset: ["start start", "end start"] });
  const titleY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 110]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.75], [1, reduce ? 1 : 0.1]);

  const retry = () => {
    if (runKey && sParam !== null) mutate({ language: lang, string: sParam });
  };

  // One persistent live region, so screen readers hear every new comparison (a remounted region is often skipped).
  const announcement = current
    ? `${current.string === "" ? "The empty string" : current.string} is ${current.truth ? "in" : "not in"} ${current.language}. ${
        current.disagreements.length === 0
          ? "Every approach agrees with the ground truth."
          : `${current.disagreements.length} of ${current.results.filter((r) => r.available).length} approaches disagree with the ground truth.`
      }`
    : compare.isPending
      ? "Comparing every approach…"
      : failed
        ? "The comparison failed."
        : "";

  return (
    <div className="pb-28">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {/* ------------------------------------------------------------ header */}
      <header ref={headerRef} className="relative isolate overflow-hidden border-b border-line">
        <HeaderDots className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_50%,transparent_100%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-[color:var(--bg)]" />
        <div className="mx-auto max-w-6xl px-6 pb-14 pt-28 sm:pt-32">
          <motion.div
            style={{ y: titleY, opacity: titleOpacity }}
            className="grid items-end gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
          >
            <SplitText
              text="One string, every machine."
              tag="h1"
              className="font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.02em] text-ink sm:text-7xl lg:text-[84px]"
              textAlign="left"
              splitType="chars"
              effect="rise"
              mask
              trigger="load"
              delay={24}
              duration={0.9}
            />
            <motion.p
              className="max-w-xl text-lg leading-relaxed text-ink-2 lg:pb-2"
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: reduce ? 0 : 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            >
              The same string goes to every approach in the project. The hand-built automata give the right answer; the learned automata and the
              ML pipelines show whether they learned the rule or only something that looks like it.
            </motion.p>
          </motion.div>

          <motion.div
            className="mt-10"
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: reduce ? 0 : 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {languages.isLoading ? (
              <Panel className="space-y-4 p-6">
                <Skeleton className="h-11 w-80 max-w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-20 w-full" />
              </Panel>
            ) : languages.error ? (
              <ErrorState message={errorMessage(languages.error)} onRetry={() => languages.refetch()} />
            ) : unknownLanguage ? (
              <div className="space-y-4">
                <ErrorState message={`There is no language called “${lang}”. Choose one of ${languages.data!.map((l) => l.id).join(", ")}.`} />
                <Button variant="outline" onClick={() => setParams({ lang: DEFAULT_LANGUAGE, s: DEFAULT_STRING })}>
                  Compare {DEFAULT_STRING} in {DEFAULT_LANGUAGE} instead
                </Button>
              </div>
            ) : language ? (
              <Controls
                languages={languages.data!}
                language={language}
                draft={draft}
                onDraft={setDraft}
                onSubmit={submit}
                onLanguage={changeLanguage}
                loading={compare.isPending}
                truth={truthDfa}
                current={runKey ? sParam : null}
              />
            ) : null}
          </motion.div>
        </div>
      </header>

      {/* ------------------------------------------------------------ the answer key */}
      {language ? (
        <TruthBanner
          language={language}
          input={runKey ? sParam : null}
          result={current}
          dfa={truthDfa}
          dfaFailed={truthQuery.isError}
          notes={notes}
          maxTrain={maxTrain}
        />
      ) : languages.isLoading ? (
        <TruthBannerSkeleton />
      ) : null}

      {/* ------------------------------------------------------------ the verdicts */}
      {language && (
        <div className="mx-auto max-w-6xl px-6 pt-20">
          <div className="min-h-[9rem]">
            {(invalidSymbols.length > 0 || tooLong) && (
              <ErrorState
                message={
                  tooLong
                    ? `The string in this link has ${sParam!.length} symbols; the limit is ${MAX_LENGTH}. Shorten it above.`
                    : `The string in this link uses ${invalidSymbols.map((c) => `“${c}”`).join(", ")}, which ${
                        invalidSymbols.length === 1 ? "is" : "are"
                      } not in the alphabet {${language.alphabet.join(", ")}} of ${language.id}. Fix it above or pick an example.`
                }
              />
            )}
            {failed && <ErrorState message={errorMessage(compare.error)} onRetry={retry} />}
            {shown && shownKey && !failed && (
              <Summary result={shown} language={language} slots={slots} maxTrain={maxTrain} runKey={shownKey} stale={!!stale} />
            )}
            {!shown && !failed && runKey && (
              <div className="space-y-4" role="status" aria-label="Comparing every approach">
                <Skeleton className="h-12 w-full max-w-3xl" />
                <Skeleton className="h-6 w-full max-w-2xl" />
                <div className="flex flex-wrap gap-2 pt-4">
                  {Array.from({ length: 9 }, (_, i) => (
                    <Skeleton key={i} className="h-8 w-20 rounded-full" />
                  ))}
                </div>
              </div>
            )}
            {!runKey && invalidSymbols.length === 0 && !tooLong && (
              <div>
                <h2 className="font-display text-4xl font-semibold text-ink-2">Every approach is waiting for a string.</h2>
                <p className="mt-3 max-w-2xl text-lg text-muted">
                  When you compare one, each row below fills in with that approach&rsquo;s verdict, the state it stopped in or the probability it gave,
                  and how long it took.
                </p>
              </div>
            )}
          </div>

          <div className="mt-12">
            {approaches.error && !shown ? (
              <ErrorState message={errorMessage(approaches.error)} onRetry={() => approaches.refetch()} />
            ) : (
              <LineUp
                slots={slots}
                language={language}
                runKey={shownKey}
                stale={!!stale}
                idle={!runKey}
                loading={!shown && !!runKey && !failed}
                hasResult={!!shown}
                notes={notes}
              />
            )}
          </div>

          {/* ---------------------------------------------------------- how to read it */}
          <section aria-labelledby="reading-title" className="mt-24 border-t border-line pt-12">
            <h2 id="reading-title" className="font-display text-3xl font-semibold text-ink">
              How to read a row
            </h2>
            <div className="mt-8 grid gap-10 text-[15px] leading-relaxed text-ink-2 md:grid-cols-3">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Verdict</h3>
                <p className="mt-2">
                  ACCEPT means the approach puts the string in the language. The tick or cross next to it says whether that matches the ground-truth
                  DFA, which is right by definition.
                </p>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Evidence</h3>
                <p className="mt-2">
                  An automaton&rsquo;s answer is the state it stops in: a double ring marks an accepting state. An ML pipeline gives a probability of
                  accepting, and anything past the 50% line counts as accept.
                </p>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Time</h3>
                <p className="mt-2">
                  Measured on the server for this one string. The axis is logarithmic: each tick is a thousand times longer than the one before. ML
                  times include turning the string into features.
                </p>
              </div>
            </div>
            <div className="mt-12 flex flex-wrap gap-3">
              <Link to={`/explore?lang=${language.id}`} className={cn(linkButton, "border border-[color:var(--lamp)] bg-lamp-soft text-ink hover:bg-[color:var(--lamp)]/25")}>
                Explore the approaches for {language.id}
              </Link>
              <Link to="/learn" className={cn(linkButton, "border border-line-strong text-ink hover:border-ink-2 hover:bg-panel-2/60")}>
                Learn a DFA from your own examples
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
