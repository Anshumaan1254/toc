import { ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { errorMessage, useSummary } from "@/lib/api";
import { PIPELINE_BY_ID } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { ExtractionMatrix } from "../parts/b/ExtractionMatrix";
import { LStarStory } from "../parts/b/LStarStory";
import { OffByOne } from "../parts/b/OffByOne";
import { derive, LSTAR_IDS, LSTAR_PIPELINE, type LStarId } from "../parts/b/results-data";
import { ChapterTitle, Lead, Reveal, SceneTitle } from "../parts/b/ui";

/**
 * Chapter: the DFA inside the model. L* explained on a real trace (the scroll-driven
 * observation table), then the model whose extracted DFA is one string off the truth, then
 * every extraction at a glance. The cases are picked from the data, not hard-coded.
 */
export function InsideTheModelChapter() {
  const summary = useSummary();
  return (
    <section id="inside-the-model" aria-labelledby="inside-title" className="relative">
      <div className="mx-auto max-w-6xl px-6 pt-28 md:pt-36">
        <Reveal>
          <ChapterTitle id="inside-title">The DFA inside the model</ChapterTitle>
          <Lead className="mt-6">
            A trained classifier stores weights and trees, not states. But a model that has really learned a regular language behaves like a finite automaton, and
            Angluin&apos;s <Term k="lstar">L*</Term> algorithm can recover that automaton by doing nothing more than asking the model questions.
          </Lead>
        </Reveal>
      </div>
      {summary.isError ? (
        <div className="mx-auto max-w-6xl px-6 py-16">
          <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
        </div>
      ) : !summary.data ? (
        <div className="mx-auto max-w-6xl px-6 py-16">
          <LoadingBlock label="Loading the extractions…" />
        </div>
      ) : (
        <Body summary={summary.data} />
      )}
    </section>
  );
}

/** The exact extraction from the least accurate model: the most striking L* result. */
function pickStory(summary: Summary): { language: string; approach: LStarId; accuracy: number } | null {
  let best: { language: string; approach: LStarId; accuracy: number } | null = null;
  for (const l of summary.languages)
    for (const a of LSTAR_IDS) {
      const r = summary.automata[l.id]?.[a];
      const acc = summary.ml[l.id]?.[LSTAR_PIPELINE[a]]?.test.accuracy;
      if (!r?.equivalent_to_truth || acc === undefined) continue;
      if (!best || acc < best.accuracy) best = { language: l.id, approach: a, accuracy: acc };
    }
  return best;
}

/** Plain arithmetic for "binary multiple of k" languages, so counterexamples read as numbers. */
function describer(name: string, alphabet: string[]): ((s: string) => string | null) | undefined {
  const m = /binary multiple of (\d+)/i.exec(name);
  if (!m || alphabet.join("") !== "01") return undefined;
  const k = Number(m[1]);
  return (s: string) => {
    if (s === "") return null;
    const v = parseInt(s, 2);
    return `${v} in binary, ${v % k === 0 ? "a" : "not a"} multiple of ${k}`;
  };
}

function Body({ summary }: { summary: Summary }) {
  const d = derive(summary);
  const story = pickStory(summary);
  const storyLang = story ? summary.languages.find((l) => l.id === story.language) : undefined;
  const wrong = d.lstar.convergedWrong[0];
  const wrongLang = wrong ? summary.languages.find((l) => l.id === wrong.language) : undefined;
  return (
    <div className="mx-auto max-w-6xl space-y-36 px-6 pb-24 pt-16 md:space-y-44">
      {story && storyLang && (
        <div>
          <Reveal className="max-w-3xl">
            <SceneTitle>
              L* questions a {PIPELINE_BY_ID[LSTAR_PIPELINE[story.approach]].name.toLowerCase()}
            </SceneTitle>
            <p className="mt-5 text-lg leading-relaxed text-ink-2">
              The {PIPELINE_BY_ID[LSTAR_PIPELINE[story.approach]].name.toLowerCase()} trained on {story.language} (&ldquo;{storyLang.name}&rdquo;) is right on only{" "}
              {(story.accuracy * 100).toFixed(0)}% of test strings. Scroll to watch L* interrogate it, round by round. Every cell below is a real answer from this
              run, replayed from the recorded trace.
            </p>
          </Reveal>
          <LStarStory language={story.language} approach={story.approach} describe={describer(storyLang.name, storyLang.alphabet)} />
        </div>
      )}

      {wrong && wrongLang && (
        <Reveal>
          <OffByOne language={wrong.language} approach={wrong.approach} languageName={wrongLang.name} />
        </Reveal>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <Reveal>
          <SceneTitle>
            {d.lstar.exact} of {d.lstar.total} models gave up their DFA
          </SceneTitle>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Each cell is one L* run against one trained pipeline. {d.lstar.convergedExact} runs converged on the exact ground-truth DFA.{" "}
            {d.lstar.budgetExact > 0 && (
              <>
                {d.lstar.budgetExact} more stopped at the state budget and still handed back the exact machine, because the model was right on the short strings
                L* asked about.{" "}
              </>
            )}
            The rest either copied a model&apos;s mistakes into extra states or, like the one above, converged one string off. Select any cell to open that automaton.
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <ExtractionMatrix summary={summary} />
        </Reveal>
      </div>
    </div>
  );
}
