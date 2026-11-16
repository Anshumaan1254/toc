import { useState, type ReactNode, type Ref } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { errorMessage, useDataset } from "@/lib/api";
import { FAMILIES } from "@/lib/meta";
import type { Approach, ApproachId, Family, Language } from "@/lib/types";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/utils";
import { ApproachTile } from "./ApproachTile";
import { FAMILY_GRID, FAMILY_IDS, FAMILY_ORDER, TILE_SPAN, orderFamily, pairOf } from "./explore-utils";

const FAMILY_COPY: Record<Family, ReactNode> = {
  truth: (
    <>
      The automata that define each language: a hand-built <Term k="dfa">DFA</Term>, an <Term k="nfa">NFA</Term> for the same language, and the
      DFA recovered from that NFA by <Term k="subset-construction">subset construction</Term> and <Term k="minimization">minimization</Term>.
    </>
  ),
  learned: (
    <>
      DFAs that nobody drew. <Term k="rpni">RPNI</Term> and <Term k="edsm">EDSM</Term> merge the states of a <Term k="pta">prefix tree</Term> built
      from the training strings. <Term k="lstar">L*</Term> asks a trained model <Term k="membership-query">membership queries</Term> and rebuilds the DFA
      it behaves like. Equivalent means the DFA accepts exactly the ground truth&rsquo;s strings, <Term k="equivalence">checked</Term> on the product
      automaton.
    </>
  ),
  ml: (
    <>
      Classifiers that score generic string features and answer with a probability. They have no states, so their size is counted in parameters or
      tree nodes. The tick on each size bar marks how many transitions the minimal DFA needs for the same job.
    </>
  ),
};

// ------------------------------------------------------------------ sticky language bar
function ContextBar({
  language,
  languages,
  updating,
  onSelect,
  onChangeLanguage,
}: {
  language: Language;
  languages: Language[];
  updating: boolean;
  onSelect: (id: string) => void;
  onChangeLanguage: () => void;
}) {
  const i = Math.max(0, languages.findIndex((l) => l.id === language.id));
  const prev = languages[(i - 1 + languages.length) % languages.length];
  const next = languages[(i + 1) % languages.length];
  const step = "grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink";
  return (
    <div className="sticky top-[74px] z-30 mx-auto max-w-6xl px-4 sm:px-6">
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-[color:var(--bg)]/90 py-1.5 pl-2 pr-1.5 shadow-[var(--shadow)] backdrop-blur-xl sm:gap-3 sm:pl-2.5">
        <span className="rounded-lg bg-lamp-soft px-2 py-0.5 font-display text-lg font-semibold text-lamp">{language.id}</span>
        <div className="min-w-0 flex-1 leading-tight">
          {/* divs, not paragraphs: the global p { text-wrap: pretty } would defeat truncate */}
          <div className="truncate text-sm font-medium text-ink">{language.name}</div>
          <div className={cn("truncate text-xs text-muted", language.regex !== language.name && "font-mono")}>
            {language.regex !== language.name ? language.regex : language.description}
          </div>
        </div>
        <span className="flex w-5 justify-center" aria-live="polite">
          {updating && <Loader2 size={16} className="animate-spin text-lamp" aria-label="Updating the numbers" />}
        </span>
        <div className="flex items-center" role="group" aria-label="Switch language">
          <button type="button" className={step} onClick={() => onSelect(prev.id)} aria-label={`Previous language: ${prev.id}, ${prev.name}`} title={`${prev.id}: ${prev.name}`}>
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button type="button" className={step} onClick={() => onSelect(next.id)} aria-label={`Next language: ${next.id}, ${next.name}`} title={`${next.id}: ${next.name}`}>
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={onChangeLanguage}
          className="hidden h-9 shrink-0 rounded-full border border-line px-3.5 text-sm font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink sm:block"
        >
          Back to the languages
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ loading skeleton (same grid, same heights)
function BoardSkeleton() {
  return (
    <div className="space-y-16" role="status" aria-label="Loading the approaches">
      {FAMILY_ORDER.map((family) => (
        <div key={family}>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
          <div className={cn("mt-8 grid gap-4", FAMILY_GRID[family])}>
            {FAMILY_IDS[family].map((id) => (
              <Skeleton key={id} className={cn("h-[330px] rounded-[18px]", TILE_SPAN[id])} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MeterLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted" aria-hidden>
      <span className="inline-flex items-center gap-2">
        <span className="relative h-[5px] w-10 rounded-full bg-panel-2">
          <span className="absolute inset-y-0 left-0 w-8 rounded-full bg-ink-2" />
        </span>
        accuracy, ruled every 10%
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="relative h-[5px] w-10 rounded-full bg-panel-2">
          <span className="absolute -bottom-[3px] -top-[3px] left-1/2 w-px bg-ink-2" />
        </span>
        50%, a coin flip on the balanced long strings
      </span>
      <span className="inline-flex items-center gap-2">
        <svg width="34" height="10" viewBox="0 0 34 10">
          <circle cx="4.5" cy="5" r="3.3" fill="var(--ink-2)" stroke="var(--ink-2)" strokeWidth="1.2" />
          <circle cx="13.5" cy="5" r="3.3" fill="var(--ink-2)" stroke="var(--ink-2)" strokeWidth="1.2" />
          <circle cx="22.5" cy="5" r="3.3" fill="none" stroke="var(--ink-2)" strokeWidth="1.2" />
          <circle cx="31.5" cy="5" r="3.3" fill="none" stroke="var(--ink-2)" strokeWidth="1.2" />
        </svg>
        one circle per state, hollow beyond the minimal DFA
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ the board
export function ApproachBoard({
  language,
  languages,
  query,
  headingRef,
  onSelect,
  onChangeLanguage,
}: {
  language: Language;
  languages: Language[];
  query: UseQueryResult<Approach[]>;
  headingRef: Ref<HTMLHeadingElement>;
  onSelect: (id: string) => void;
  onChangeLanguage: () => void;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<ApproachId | null>(null);
  const data = query.data;
  const stale = query.isPlaceholderData;
  // While the new language's numbers load, the old ones stay up (dimmed). Keep everything a tile
  // derives from its language (diagram, minimal state count, best-pipeline badge) on that old
  // language too, so each tile stays self-consistent; only its link already points at the new one.
  // Length ranges of the splits come from the dataset report (main pool = train/val/test, long pool = held out).
  const dataset = useDataset();
  const span = (pool: "main" | "long") => {
    const b = dataset.data?.config.buckets.filter((x) => x.pool === pool) ?? [];
    return b.length ? `${Math.min(...b.map((x) => x.lo))}–${Math.max(...b.map((x) => x.hi))}` : null;
  };
  const mainRange = span("main");
  const longRange = span("long");
  const [measured, setMeasured] = useState(language);
  if (data && !stale && measured.id !== language.id) setMeasured(language);
  const statsLanguage = stale ? measured : language;

  return (
    <section id="approaches" aria-labelledby="approaches-heading" className="relative pb-28 pt-6">
      <ContextBar language={language} languages={languages} updating={stale} onSelect={onSelect} onChangeLanguage={onChangeLanguage} />

      <div className="mx-auto max-w-6xl px-6">
        <header className="max-w-3xl pb-10 pt-14">
          <h2 id="approaches-heading" ref={headingRef} tabIndex={-1} className="font-display text-4xl font-semibold text-ink outline-none md:text-5xl">
            Choose an approach for {language.id}
          </h2>
          <p className="mt-4 text-lg text-ink-2">
            {data ? `${data.length} approaches` : "Every approach"} in three families. Every number below was measured on {language.id}: accuracy on
            held-out test strings{mainRange ? ` of length ${mainRange}` : ""}, and on {longRange ? `strings of length ${longRange}` : "longer strings"},
            longer than anything seen in training.
          </p>
          <div className="mt-6">
            <MeterLegend />
          </div>
        </header>

        {query.isPending ? (
          <BoardSkeleton />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : data ? (
          <div aria-busy={stale} className={cn("space-y-20 transition-opacity duration-300", stale && "opacity-55")}>
            {FAMILY_ORDER.map((family) => {
              const items = orderFamily(data, family);
              if (items.length === 0) return null;
              return (
                <div key={family} id={`family-${family}`} className="scroll-mt-40">
                  <div className="mb-7 grid grid-cols-1 gap-x-10 gap-y-3 border-t border-line pt-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                    <h3 tabIndex={-1} className="font-display text-[28px] font-semibold leading-tight text-ink outline-none">
                      {FAMILIES[family].name}
                      <span className="ml-2 align-middle font-mono text-sm font-normal text-muted">{items.length}</span>
                    </h3>
                    <p className="max-w-3xl text-[15px] leading-relaxed text-ink-2">{FAMILY_COPY[family]}</p>
                  </div>
                  <div className={cn("grid gap-4", FAMILY_GRID[family])}>
                    {items.map((a, i) => {
                      const partnerId = pairOf(a.id);
                      return (
                        <motion.div
                          key={a.id}
                          className={cn("row-span-4 grid min-w-0 grid-rows-subgrid gap-y-0", TILE_SPAN[a.id])}
                          initial={reduce ? false : { opacity: 0, y: 28 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, amount: 0.12 }}
                          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: (i % 4) * 0.07 }}
                        >
                          <ApproachTile
                            approach={a}
                            language={statsLanguage}
                            linkLanguageId={language.id}
                            longRange={longRange}
                            partner={a.family === "ml" && partnerId ? data.find((b) => b.id === partnerId) : undefined}
                            paired={hovered !== null && pairOf(hovered) === a.id}
                            onHoverChange={setHovered}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="mt-24 grid grid-cols-1 items-center gap-6 rounded-[18px] border border-line bg-panel/60 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:p-8">
          <div>
            <h3 className="font-display text-2xl font-semibold text-ink">Not sure which one to trust?</h3>
            <p className="mt-2 max-w-2xl text-ink-2">
              Run one string through every approach at once and see where they disagree, or write your own examples and watch a learner build a DFA from
              them.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/compare" className="inline-flex h-11 items-center rounded-full bg-lamp px-5 font-medium text-[#1a1203] transition hover:brightness-110">
              Compare on one string
            </Link>
            <Link
              to="/learn"
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 font-medium text-ink transition-colors hover:border-ink-2 hover:bg-panel-2/60"
            >
              Train on your examples
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
