import type { ReactNode } from "react";
import { ChartFrame } from "@/components/charts/Charts";
import { ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { errorMessage, useSummary } from "@/lib/api";
import { PIPELINE_BY_ID, PIPELINES } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { useBands, words } from "../parts/b/bands";
import { ComparisonTable } from "../parts/b/ComparisonTable";
import { Hi, Insights } from "../parts/b/Insights";
import { BestPerLanguage, F1Heatmap, GeneralizationDrop, PipelineScores } from "../parts/b/ResultsCharts";
import { derive, micro, pctNum, type Derived } from "../parts/b/results-data";
import { SlopeChart } from "../parts/b/SlopeChart";
import { ChapterTitle, Lead, Reveal, SceneTitle } from "../parts/b/ui";

/**
 * Chapter: our results. It opens on the wall at the training length (a slope chart of the
 * hardest language), then one scene per question: how the pipelines scored, language by
 * language, what longer strings cost, automata against models, and the findings that are not
 * charted elsewhere. Every number comes from /api/summary.
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
      <Wall summary={summary} d={d} linearFail={linearFail} />

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

/**
 * The opener: the wall at the training length. The hardest language's pipelines fall from
 * their test accuracy to a coin flip on longer strings while the DFA stays at 100%.
 */
function Wall({ summary, d, linearFail }: { summary: Summary; d: Derived; linearFail?: { id: string; f1: number } }) {
  const bands = useBands();
  const hard = d.hardest;
  if (!hard) return null;
  const per = summary.ml[hard.language];
  const series = PIPELINES.filter((p) => per?.[p.id]);
  const testAcc = series.map((p) => per[p.id].test.accuracy);
  const longAcc = series.map((p) => per[p.id].long.accuracy);
  const binary = /^binary multiple of (\d+)$/i.exec(hard.name);
  const subject = binary ? `binary multiples of ${binary[1]} become` : `${hard.language} (“${hard.name}”) becomes`;
  const coin = hard.longAccuracy < 0.6;
  const claim = `Past length ${summary.meta.max_train_length}, ${subject} ${coin ? "a coin flip" : `a ${pctNum(hard.longAccuracy, 0)}% guess`}.`;

  // the second hard case: the language that fools the weakest pipeline outright, and what the tree models do on its long strings
  const fooled = linearFail ? summary.ml[linearFail.id] : undefined;
  const trees = PIPELINES.filter((p) => (p.id === "dt" || p.id === "rf") && fooled?.[p.id]);
  const treesSlip = fooled && trees.length > 0 && trees.every((p) => fooled[p.id].test.accuracy - fooled[p.id].long.accuracy > 0.1);
  const worstOnIt = fooled?.[d.worst.id]?.test.accuracy;

  const testLabel = `test, lengths ${bands.trainMin} to ${bands.trainMax ?? summary.meta.max_train_length}`;
  const longLabel = `long, ${bands.longWords}`;
  return (
    <div className="mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 py-20 md:py-24">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
        <Reveal>
          <h3 className="t-h2 text-ink">{claim}</h3>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            On {hard.language} the pipelines reach {pctNum(Math.min(...testAcc))}% to {pctNum(Math.max(...testAcc))}% on the test split. On strings of{" "}
            {bands.longWords} symbols none of them beats {pctNum(Math.max(...longAcc))}%. The ground-truth DFA reads any length and stays at 100%.
          </p>
          {linearFail && fooled && worstOnIt !== undefined && worstOnIt < 0.7 && (
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink-2">
              {linearFail.id} fools the {d.worst.name.toLowerCase()} outright ({pctNum(worstOnIt)}% on the test split)
              {treesSlip ? (
                <>
                  , and the trees lose it on long strings:{" "}
                  {trees
                    .map((p) => `the ${p.name.toLowerCase()} falls from ${pctNum(fooled[p.id].test.accuracy)}% to ${pctNum(fooled[p.id].long.accuracy)}%`)
                    .join(", ")}
                </>
              ) : null}
              .
            </p>
          )}
        </Reveal>
        <Reveal delay={0.08}>
          <ChartFrame
            title={`${hard.language}, “${hard.name}”`}
            subtitle="Accuracy of every pipeline before and after the training length"
            table={{
              columns: ["Approach", testLabel, longLabel],
              rows: [
                ["Ground-truth DFA", "100.0%", "100.0%"],
                ...series.map((p) => [p.name, `${pctNum(per[p.id].test.accuracy)}%`, `${pctNum(per[p.id].long.accuracy)}%`]),
              ],
            }}
          >
            <SlopeChart summary={summary} language={hard.language} testLabel={testLabel} longLabel={longLabel} />
          </ChartFrame>
        </Reveal>
      </div>
    </div>
  );
}

function Findings({ d }: { d: Derived }) {
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
  if (d.truth && d.forest)
    items.push({
      id: "speed",
      text: (
        <>
          A DFA classifies a string in <Hi>{micro(d.truth.inference_us_per_string)} µs</Hi> with about {d.truth.mean_size.toFixed(0)} transitions. A{" "}
          {d.forest.approach.toLowerCase()} takes <Hi>{micro(d.forest.inference_us_per_string)} µs</Hi> and carries{" "}
          {Math.round(d.forest.mean_size).toLocaleString("en-US")} nodes.
        </>
      ),
    });
  return <Insights items={items} />;
}
