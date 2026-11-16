import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { api, errorMessage, useApproaches, useLanguages } from "@/lib/api";
import { useLenis } from "@/components/layout/SmoothScroll";
import { ErrorState, Kbd, Skeleton } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { ExploreHero } from "./ExploreHero";
import { LanguageList } from "./LanguageList";
import { LanguageStage } from "./LanguageStage";
import { ScrollTape } from "./ScrollTape";
import { ApproachBoard } from "./ApproachBoard";
import { distinctAlphabets, setNotation } from "./explore-utils";

function PickerSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.25fr)] lg:gap-8" role="status" aria-label="Loading the languages">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-[58px] rounded-[14px] lg:h-[64px]" />
        ))}
      </div>
      <Skeleton className="h-[760px] rounded-[22px]" />
    </div>
  );
}

/**
 * Explore: choose a language, then one of the thirteen approaches, then open its detail page
 * (/explore/:lang/:approach). The chosen language lives in the URL (?lang=L7).
 */
export default function ExplorePage() {
  const languages = useLanguages();
  const [params, setParams] = useSearchParams();
  const requested = params.get("lang");
  const list = languages.data ?? [];
  const selected = list.find((l) => l.id === requested) ?? list[0];
  const unknown = !!requested && list.length > 0 && !list.some((l) => l.id === requested);
  const approaches = useApproaches(selected?.id);
  const queryClient = useQueryClient();
  const lenis = useLenis();
  const reduce = useReducedMotion();
  const boardHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = selected ? `Explore ${selected.id}: ${selected.name} | Automata Lab` : "Explore | Automata Lab";
  }, [selected]);

  // Warm the cache with every ground-truth DFA (a few kB each) so switching languages never waits.
  useEffect(() => {
    for (const l of languages.data ?? []) {
      void queryClient.prefetchQuery({ queryKey: ["automaton", l.id, "dfa"], queryFn: () => api.automaton(l.id, "dfa"), staleTime: Infinity });
    }
  }, [languages.data, queryClient]);

  const peek = (id: string) => {
    void queryClient.prefetchQuery({ queryKey: ["approaches", id], queryFn: () => api.approaches(id), staleTime: Infinity });
  };

  const select = (id: string) => {
    if (id === requested) return;
    peek(id);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("lang", id);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const scrollToSection = (id: string, focusTarget?: HTMLElement | null) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -84 });
    else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    focusTarget?.focus({ preventScroll: true });
  };

  const alphabets = distinctAlphabets(list);

  return (
    <>
      <ExploreHero />

      <section id="languages" aria-labelledby="languages-heading" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-20 pt-12 md:pt-16">
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <h2 id="languages-heading" tabIndex={-1} className="font-display text-4xl font-semibold text-ink outline-none md:text-5xl">
              Choose a language
            </h2>
            <p className="mt-3 max-w-3xl text-lg text-ink-2">
              {list.length > 0 ? `${list.length} ` : ""}
              <Term k="regular">regular languages</Term>
              {alphabets.length > 0 ? ` over the alphabets ${alphabets.map(setNotation).join(" and ")}` : ""}. Each is defined by a hand-built{" "}
              <Term k="dfa">DFA</Term>. Pick one and watch it read sample strings.
            </p>
          </div>
          <p className="hidden items-center gap-1.5 text-sm text-muted md:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move through the list
          </p>
        </div>

        {unknown && selected && (
          <p role="status" className="mb-5 rounded-xl border border-line bg-lamp-soft px-4 py-2.5 text-sm text-ink">
            There is no language called &ldquo;{requested}&rdquo;, so {selected.id} is shown instead.
          </p>
        )}

        {languages.isPending ? (
          <PickerSkeleton />
        ) : languages.isError ? (
          <ErrorState message={errorMessage(languages.error)} onRetry={() => void languages.refetch()} />
        ) : selected ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.25fr)] lg:gap-8">
            <LanguageList languages={list} selectedId={selected.id} onSelect={select} onPeek={peek} labelledBy="languages-heading" />
            <div className="min-w-0 lg:sticky lg:top-24">
              <LanguageStage language={selected} onChoose={() => scrollToSection("approaches", boardHeadingRef.current)} />
            </div>
          </div>
        ) : (
          <ErrorState message="The backend returned no languages." onRetry={() => void languages.refetch()} />
        )}
      </section>

      <ScrollTape language={selected} />

      {selected && (
        <ApproachBoard
          language={selected}
          languages={list}
          query={approaches}
          headingRef={boardHeadingRef}
          onSelect={select}
          onChangeLanguage={() => scrollToSection("languages", document.getElementById("languages-heading"))}
        />
      )}
    </>
  );
}
