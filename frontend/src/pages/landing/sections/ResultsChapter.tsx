import type { ReactNode } from "react";
import { ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { errorMessage, useAutomaton, useSummary } from "@/lib/api";
import { PIPELINE_BY_ID, PIPELINES } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { runDfa } from "@/lib/automata";
import { useBands, words } from "../parts/b/bands";
import { ComparisonTable } from "../parts/b/ComparisonTable";
import { HeadlineSweep, type Slide } from "../parts/b/HeadlineSweep";
import { Hi, Insights } from "../parts/b/Insights";
import { BestPerLanguage, F1Heatmap, GeneralizationDrop, PipelineScores } from "../parts/b/ResultsCharts";
import { derive, micro, pctNum, type Derived } from "../parts/b/results-data";
import { ChanceMeter, ExtractionDots, PassiveDots, PipelineMeters, ToScale } from "../parts/b/SweepVisuals";
import { ChapterTitle, Lead, Reveal, Rolling, SceneTitle } from "../parts/b/ui";

/**
 * Chapter: our results. Giant figures sweep past sideways, then one scene per question:
 * how the pipelines scored, language by language, what longer strings cost, automata against
 * models, and the findings in plain words. Every number comes from /api/summary.
 */
export function ResultsChapter() {
  const summary = useSummary();
  const bands = useBands();
  const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <section id="results" aria-labelledby="results-title" className="relative">
      <div className="mx-auto max-w-6xl px-6 pt-28 md:pt-36">
        <Reveal>
          <ChapterTitle id="results-title">Our results</ChapterTitle>
          <Lead className="mt-6">
            {capital(words(PIPELINES.length))} classifiers learned {summary.data ? `${words(summary.data.languages.length)} ` : ""}regular languages from
            strings of length {bands.trainWords}. Here is how accurate they became, what happened on longer strings, and how they compare with the automata
            themselves.
          </Lead>
        </Reveal>
      </div>
      {summary.isError ? (
        <div className="mx-auto max-w-6xl px-6 py-16">
          <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
        </div>
      ) : !summary.data ? (
        <div className="mx-auto max-w-6xl px-6 py-16">
          <LoadingBlock label="Loading the results…" />
        </div>
      ) : (
        <ResultsBody summary={summary.data} />
      )}
    </section>
  );
}

function ResultsBody({ summary }: { summary: Summary }) {
  const d = derive(summary);
  const bands = useBands();
  const slides = buildSlides(summary, d);
  const avg = summary.summary.pipeline_averages;
  const solved = summary.languages.filter((l) => {
    const b = summary.summary.best_pipeline_per_language[l.id];
    return b && b.test_f1 >= 0.9999 && b.long_accuracy >= 0.9999;
  }).length;
  const drops = summary.languages
    .flatMap((l) => PIPELINES.map((p) => ({ language: l.id, pipeline: p.id, drop: summary.ml[l.id]?.[p.id]?.generalization_drop ?? 0 })))
    .sort((a, b) => b.drop - a.drop);
  const dropLanguages = [...new Set(drops.filter((x) => x.drop > 0.02).map((x) => x.language))];
  const worstDrop = drops[0];
  const others = PIPELINES.filter((p) => p.id !== d.worst.id);
  const othersAcc = others.map((p) => avg.test[p.id].accuracy);
  const linearFail = summary.languages
    .filter((l) => l.id !== d.hardest?.language)
    .map((l) => ({ id: l.id, f1: summary.ml[l.id]?.[d.worst.id]?.test.f1 ?? 1 }))
    .sort((a, b) => a.f1 - b.f1)[0];
  const co = summary.summary.comparison_overall;
  const automataRows = co.filter((r) => r.family !== "ML pipeline");
  const mlRows = co.filter((r) => r.family === "ML pipeline");
  const dfaUs = Math.max(...automataRows.map((r) => r.inference_us_per_string));
  const mlUs = mlRows.map((r) => r.inference_us_per_string);
  const mlSize = Math.max(...mlRows.map((r) => r.mean_size));

  return (
    <>
      <HeadlineSweep slides={slides} label="Headline results" />

      <div className="mx-auto max-w-6xl space-y-36 px-6 pb-16 md:space-y-48">
        <Scene
          title="Four pipelines, one scoreboard"
          text={
            <>
              Averaged over the {words(summary.languages.length)} languages, the {others.map((p) => p.name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1")} score{" "}
              {pctNum(Math.min(...othersAcc))}% to {pctNum(Math.max(...othersAcc))}% on the test split; {d.worst.name.toLowerCase()} sits{" "}
              {(pctNum(Math.min(...othersAcc)) - pctNum(d.worst.accuracy)).toFixed(1)} points lower. Switch to lengths {bands.longDash} and every pipeline slips. The{" "}
              <Term k="stacking">stacked ensemble</Term> learns how to weigh the other three.
            </>
          }
        >
          <PipelineScores summary={summary} />
        </Scene>

        <Scene
          title="Language by language"
          text={
            <>
              {solved} of {summary.languages.length} languages are solved outright by at least one pipeline, on the test split and on longer strings. The pale
              cells show who struggles where: {d.hardest?.language} resists everyone
              {linearFail && linearFail.f1 < 0.9 ? `, and ${linearFail.id} defeats ${d.worst.name.toLowerCase()}` : ""}.
            </>
          }
          wide
        >
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-14">
            <F1Heatmap summary={summary} />
            <BestPerLanguage summary={summary} />
          </div>
        </Scene>

        <Scene
          title="What longer strings cost"
          text={
            <>
              Every training string had at most {summary.meta.max_train_length} symbols. On strings of {bands.longWords} symbols most bars stay at zero: those models
              learned the rule, not the lengths. The losses pile up in {dropLanguages.join(" and ")}
              {worstDrop ? `; the worst is the ${PIPELINE_BY_ID[worstDrop.pipeline].name.toLowerCase()} on ${worstDrop.language}, down ${Math.round(worstDrop.drop * 100)} points` : ""}.
            </>
          }
        >
          <GeneralizationDrop summary={summary} />
        </Scene>

        <Scene
          title="Automata against models"
          text={
            <>
              Every automaton here needs at most {micro(dfaUs)} µs per string, and the exact ones make no mistakes at any length. The models need{" "}
              {micro(Math.min(...mlUs))} to {micro(Math.max(...mlUs))} µs and carry up to {Math.round(mlSize).toLocaleString("en-US")} parameters or tree nodes.
            </>
          }
          wide
        >
          <Reveal>
            <ComparisonTable rows={summary.summary.comparison_overall} languages={summary.languages.length} />
          </Reveal>
        </Scene>

        <div>
          <Reveal>
            <SceneTitle>What we learned</SceneTitle>
          </Reveal>
          <Findings d={d} />
        </div>
      </div>
    </>
  );
}

function Scene({ title, text, children, wide = false }: { title: string; text: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "space-y-10" : "grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16"}>
      <Reveal className={wide ? "max-w-3xl" : "lg:pt-2"}>
        <SceneTitle>{title}</SceneTitle>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">{text}</p>
      </Reveal>
      <Reveal delay={0.08}>{children}</Reveal>
    </div>
  );
}

function buildSlides(summary: Summary, d: Derived): Slide[] {
  const avg = summary.summary.pipeline_averages.test;
  const slides: Slide[] = [
    {
      id: "lstar",
      visual: <ExtractionDots summary={summary} />,
      figure: (
        <>
          <Rolling value={d.lstar.exact} />
          <span className="text-ink-2/70">/{d.lstar.total}</span>
        </>
      ),
      text: (
        <>
          trained models gave up an exact copy of the true DFA when <Term k="lstar">L*</Term> questioned them.
        </>
      ),
    },
    {
      id: "passive",
      visual: <PassiveDots summary={summary} />,
      figure: (
        <>
          <Rolling value={d.edsmExact} />
          <span className="text-ink-2/70">/{d.languagesCount}</span>
        </>
      ),
      text: (
        <>
          languages rebuilt exactly by <Term k="edsm">EDSM</Term> from the training strings alone. <Term k="rpni">RPNI</Term> rebuilt {d.rpniExact}.
        </>
      ),
    },
    {
      id: "best",
      visual: <PipelineMeters values={PIPELINES.map((p) => ({ id: p.id, short: p.short, color: p.color, value: avg[p.id].accuracy }))} />,
      figure: <Rolling value={pctNum(d.best.accuracy)} decimals={1} suffix="%" />,
      text: (
        <>
          mean test accuracy of the best pipeline, the {d.best.name.toLowerCase()}. Logistic regression trails at {pctNum(d.worst.accuracy)}%.
        </>
      ),
    },
  ];
  if (d.hardest)
    slides.push({
      id: "hardest",
      visual: <ChanceMeter value={d.hardest.longAccuracy} />,
      figure: <Rolling value={pctNum(d.hardest.longAccuracy, 0)} suffix="%" />,
      text: (
        <>
          is the best any model scored on long strings of {d.hardest.language}, &ldquo;{d.hardest.name.toLowerCase()}&rdquo;. A coin flip scores 50%.
        </>
      ),
    });
  if (d.truth && d.forest)
    slides.push({
      id: "size",
      visual: <ToScale small={d.truth.mean_size} big={d.forest.mean_size} smallLabel="a DFA, to scale" bigLabel="a random forest" />,
      figure: (
        <span className="block text-[0.62em] leading-[1.02]">
          <span className="text-lamp">{d.truth.mean_size.toFixed(1)}</span>
          <span className="mx-3 align-middle text-[0.4em] font-normal text-muted">vs</span>
          <Rolling value={Math.round(d.forest.mean_size)} />
        </span>
      ),
      text: (
        <>
          transitions in the average DFA against nodes in the average random forest. The DFA answers in {micro(d.truth.inference_us_per_string)} µs per string,
          the forest in {micro(d.forest.inference_us_per_string)} µs.
        </>
      ),
    });
  return slides;
}

function Findings({ d }: { d: Derived }) {
  const wrong = d.lstar.convergedWrong[0];
  const extracted = useAutomaton(wrong?.language, wrong?.approach);
  const truth = useAutomaton(wrong?.language, wrong ? "dfa" : undefined);
  const cex = extracted.data?.metrics?.counterexample_to_truth;
  const truthDfa = truth.data?.automaton.kind === "dfa" ? truth.data.automaton : null;
  const truthAccepts = cex !== undefined && cex !== null && truthDfa ? runDfa(truthDfa, cex).accepted : null;
  const items: { id: string; text: ReactNode }[] = [];
  if (d.truthStates)
    items.push({
      id: "truth",
      text: (
        <>
          The {words(d.languagesCount)} reference machines are tiny: <Hi>{d.truthStates[0]}</Hi> to <Hi>{d.truthStates[1]}</Hi> states each, and every one is proven equal to its NFA
          and its regular expression.
        </>
      ),
    });
  items.push({
    id: "passive",
    text: (
      <>
        From the labelled training strings alone, EDSM rebuilt{" "}
        <Hi>{d.edsmExact === d.languagesCount ? `all ${d.edsmExact}` : `${d.edsmExact} of ${d.languagesCount}`}</Hi> languages exactly. RPNI rebuilt{" "}
        <Hi>{d.rpniExact}</Hi>.
      </>
    ),
  });
  items.push({
    id: "lstar",
    text: (
      <>
        L* pulled the exact DFA out of <Hi>{d.lstar.exact}</Hi> of {d.lstar.total} trained models
        {d.lstar.budgetExact > 0 ? (
          <>
            , <Hi>{d.lstar.budgetExact}</Hi> of them even after it ran out of state budget
          </>
        ) : null}
        .
      </>
    ),
  });
  items.push({
    id: "accuracy",
    text: (
      <>
        On test strings the pipelines average <Hi>{pctNum(d.testRange[0])}%</Hi> to <Hi>{pctNum(d.testRange[1])}%</Hi>. On strings longer than any they trained
        on: <Hi>{pctNum(d.longRange[0])}%</Hi> to <Hi>{pctNum(d.longRange[1])}%</Hi>.
      </>
    ),
  });
  if (d.hardest)
    items.push({
      id: "hardest",
      text: (
        <>
          {d.hardest.name} ({d.hardest.language}) beats every model: the best scores <Hi>{pctNum(d.hardest.longAccuracy, 0)}%</Hi> on long strings, barely
          better than guessing.
          {d.hardest.note && <span className="mt-4 block max-w-2xl font-sans text-lg font-normal leading-relaxed tracking-normal text-ink-2">{d.hardest.note}</span>}
        </>
      ),
    });
  if (d.truth && d.forest)
    items.push({
      id: "speed",
      text: (
        <>
          A DFA classifies a string in <Hi>{micro(d.truth.inference_us_per_string)} µs</Hi> with about {d.truth.mean_size.toFixed(0)} transitions. A random forest
          takes <Hi>{micro(d.forest.inference_us_per_string)} µs</Hi> and carries {Math.round(d.forest.mean_size).toLocaleString("en-US")} nodes.
        </>
      ),
    });
  if (wrong && cex !== undefined && cex !== null && truthAccepts !== null) {
    const model = PIPELINE_BY_ID[wrong.approach.replace("lstar_", "") as keyof typeof PIPELINE_BY_ID]?.name.toLowerCase() ?? wrong.approach;
    items.push({
      id: "mistake",
      text: (
        <>
          When L* converges on a DFA that differs from the truth, the difference is the model&apos;s own mistake: the {model} on {wrong.language}{" "}
          {truthAccepts ? "rejects" : "accepts"} <Hi>{cex === "" ? "ε, the empty string" : cex}</Hi>.
        </>
      ),
    });
  }
  return <Insights items={items} />;
}
