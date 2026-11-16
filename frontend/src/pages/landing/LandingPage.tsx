import { ChapterTape, type Chapter } from "./ChapterTape";
import { Hero } from "./sections/Hero";
import { ProblemChapter } from "./sections/ProblemChapter";
import { ObjectivesChapter } from "./sections/ObjectivesChapter";
import { TheoryChapter } from "./sections/TheoryChapter";
import { DatasetChapter } from "./sections/DatasetChapter";
import { ResultsChapter } from "./sections/ResultsChapter";
import { InsideTheModelChapter } from "./sections/InsideTheModelChapter";
import { ClosingCta } from "./sections/ClosingCta";

const CHAPTERS: Chapter[] = [
  { id: "machine", label: "The machine" },
  { id: "problem", label: "The question" },
  { id: "objectives", label: "Objectives" },
  { id: "theory", label: "Theory" },
  { id: "dataset", label: "Dataset" },
  { id: "results", label: "Results" },
  { id: "inside", label: "Inside the model" },
  { id: "try", label: "Try it" },
];

/**
 * The story, told as scroll chapters: a machine reading a string (hero), the question, the
 * objectives, the theory in motion, the dataset, the results, the DFA hiding inside each model,
 * and the way into the tools. The chapter tape under the nav shows where you are.
 */
export default function LandingPage() {
  return (
    <>
      <ChapterTape chapters={CHAPTERS} />
      <div id="ch-machine">
        <Hero />
      </div>
      <div id="ch-problem">
        <ProblemChapter />
      </div>
      <div id="ch-objectives">
        <ObjectivesChapter />
      </div>
      <div id="ch-theory">
        <TheoryChapter />
      </div>
      <div id="ch-dataset">
        <DatasetChapter />
      </div>
      <div id="ch-results">
        <ResultsChapter />
      </div>
      <div id="ch-inside">
        <InsideTheModelChapter />
      </div>
      <div id="ch-try">
        <ClosingCta />
      </div>
    </>
  );
}
