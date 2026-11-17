import { useMemo, useRef, type ReactNode } from "react";
import ScrollReveal from "@/components/reactbits/ScrollReveal";
import { ErrorState } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { errorMessage, useLanguages } from "@/lib/api";
import { sampleLabelled } from "@/lib/automata";
import type { DfaPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTruthDfas } from "../parts/a/data";
import { useRefreshOnResize } from "../parts/a/hooks";
import { numberWord } from "../parts/a/text";
import { Marquee } from "../parts/a/Marquee";
import { RuleVsGuess } from "../parts/a/RuleVsGuess";
import { WordReveal } from "../parts/a/WordReveal";

const PER_LANGUAGE = 5;

interface Labelled {
  lang: string;
  string: string;
  accepted: boolean;
}

/** Interleave a few labelled samples from each language so a row mixes languages and verdicts. */
function mix(ids: string[], byId: Record<string, DfaPayload>): Labelled[] {
  const lists = ids.map((id, k) => (byId[id] ? sampleLabelled(byId[id], PER_LANGUAGE, 101 + k * 17, 11).map((s) => ({ lang: id, ...s })) : []));
  const out: Labelled[] = [];
  for (let i = 0; i < PER_LANGUAGE; i++) for (const list of lists) if (list[i]) out.push(list[i]);
  return out;
}

/**
 * The problem in plain English: alphabets, strings, languages, regular languages, DFAs and
 * NFAs; a marquee of real strings labelled by the real DFAs; and the question the project asks.
 */
export function ProblemChapter() {
  const ref = useRef<HTMLElement>(null);
  useRefreshOnResize(ref);
  const languages = useLanguages();
  const ids = useMemo(() => (languages.data ?? []).map((l) => l.id), [languages.data]);
  const dfas = useTruthDfas(ids);
  const row = useMemo(() => mix(ids, dfas.byId), [ids, dfas.byId]);
  const failed = languages.error ?? dfas.error;

  return (
    <section ref={ref} id="problem" aria-labelledby="problem-title" className="relative overflow-x-clip py-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div id="problem-title">
          <ScrollReveal
            mode="enter"
            effect="rise"
            baseRotation={0}
            enableBlur={false}
            stagger={0.06}
            duration={0.7}
            containerClassName="my-0! max-w-4xl"
            textClassName="font-display text-[clamp(2.4rem,5.2vw,4.4rem)]! leading-[1.04]! tracking-[-0.015em] text-ink"
          >
            Strings, languages and the machines that read them
          </ScrollReveal>
        </div>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
          Six ideas carry the whole project. Each one is small, and together they say exactly what a finite machine can know about a string.
        </p>

        <dl className="mt-14 grid gap-x-16 md:grid-cols-2">
          <Definition term={<Term k="alphabet">Alphabet</Term>} example="{0, 1}   {a, b}">
            The symbols strings are built from. Every language in this project uses a two-symbol alphabet.
          </Definition>
          <Definition term="String" example="abba   ε">
            Any finite sequence of symbols, read left to right. The empty string, with no symbols at all, is written ε.
          </Definition>
          <Definition term={<Term k="language">Language</Term>} example="{abb, aabb, babb, …}">
            A set of strings, usually infinite, given by a rule: for example, every string over {"{a, b}"} that ends in abb.
          </Definition>
          <Definition term={<Term k="regular">Regular language</Term>} example="(a|b)*abb">
            A language that a machine with a fixed, finite memory can decide by reading the string once. Regular expressions describe exactly these
            languages.
          </Definition>
          <Definition term={<Term k="dfa">DFA</Term>} example="δ(q, a) = q′">
            A deterministic finite automaton: a few states, one start state, some accepting states and exactly one arrow for every state and symbol.
            It accepts a string when reading it ends in an accepting state.
          </Definition>
          <Definition term={<Term k="nfa">NFA</Term>} example="δ(q, a) = {q₁, q₂}">
            A nondeterministic automaton may offer several arrows for a symbol, or none, and free <Term k="epsilon">ε-moves</Term>. It accepts when
            any path does, and every NFA can be turned into an equivalent DFA.
          </Definition>
        </dl>
      </div>

      {/* real strings, labelled by the real DFAs */}
      <figure className="mt-24 lg:mt-28" aria-labelledby="problem-marquee-caption">
        <div
          aria-hidden
          className="space-y-3 [mask-image:linear-gradient(to_right,transparent,black_9%,black_91%,transparent)]"
        >
          {failed ? null : row.length === 0 ? (
            <SkeletonRow />
          ) : (
            <Marquee duration={110}>
              {row.map((s, i) => (
                <Chip key={i} item={s} />
              ))}
            </Marquee>
          )}
        </div>
        {failed && (
          <div className="mx-auto max-w-6xl px-6">
            <ErrorState
              message={errorMessage(failed)}
              onRetry={() => {
                void languages.refetch();
                dfas.refetch();
              }}
            />
          </div>
        )}
        <figcaption id="problem-marquee-caption" className="mx-auto mt-5 max-w-6xl px-6 text-sm text-muted">
          Strings drawn from the {numberWord(ids.length || 10)} languages and labelled by their ground-truth DFAs:{" "}
          <span className="text-accept">accepted ✓</span> or <span className="text-reject">rejected ✕</span>. The tag names the language.
        </figcaption>
      </figure>

      {/* the question, drawn: one string through a machine and through a model */}
      <div className="mx-auto mt-24 max-w-6xl px-6 lg:mt-28">
        <RuleVsGuess />
      </div>

      {/* the question */}
      <div className="mx-auto mt-24 max-w-6xl px-6 lg:mt-32">
        <p className="max-w-2xl text-lg leading-relaxed text-ink-2">
          A classifier never sees the machine. It sees each string turned into numbers (its length, symbol counts, short substrings, its first and
          last symbols) and the label that goes with it.
        </p>
        <WordReveal
          className="mt-8 max-w-5xl font-display text-[clamp(2rem,4.4vw,3.75rem)] font-semibold leading-[1.1] tracking-[-0.01em]"
          text="So can a model trained on labelled examples *learn what a finite machine knows*, and keep getting it right on strings longer than any it has seen?"
        />
      </div>
    </section>
  );
}

function Definition({ term, example, children }: { term: ReactNode; example: string; children: ReactNode }) {
  return (
    <div className="border-t border-line py-6">
      <dt className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="font-display text-2xl font-semibold text-ink">{term}</span>
        <span className="whitespace-pre font-mono text-sm text-ink-2">{example}</span>
      </dt>
      <dd className="mt-2 max-w-md leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

function Chip({ item }: { item: Labelled }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 font-mono text-[15px] leading-none",
        item.accepted ? "bg-accept-soft text-accept" : "bg-reject-soft text-reject",
      )}
    >
      <span className="text-[11px] font-medium text-muted">{item.lang}</span>
      <span className="tracking-wider">{item.string}</span>
      <span className="text-xs opacity-80">{item.accepted ? "✓" : "✕"}</span>
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex gap-3 overflow-hidden px-6">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="h-[31px] w-32 shrink-0 animate-pulse rounded-lg bg-panel-2/70" />
      ))}
    </div>
  );
}
