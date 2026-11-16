import { ScrollProgress } from "@/components/magicui/scroll-progress";
import { Hero } from "./sections/Hero";
import { ProblemChapter } from "./sections/ProblemChapter";
import { ObjectivesChapter } from "./sections/ObjectivesChapter";
import { TheoryChapter } from "./sections/TheoryChapter";
import { DatasetChapter } from "./sections/DatasetChapter";
import { ResultsChapter } from "./sections/ResultsChapter";
import { InsideTheModelChapter } from "./sections/InsideTheModelChapter";
import { ClosingCta } from "./sections/ClosingCta";

/**
 * The story, told as scroll chapters: a machine reading a string (hero), what a regular
 * language is, the objectives, the theory in motion, the dataset, the results, the DFA
 * hiding inside each model, and the way into the explorer.
 */
export default function LandingPage() {
  return (
    <>
      <ScrollProgress className="top-0 z-[60] h-0.5 bg-gradient-to-r from-[var(--series-lr)] via-[var(--lamp)] to-[var(--accept)]" />
      <Hero />
      <ProblemChapter />
      <ObjectivesChapter />
      <TheoryChapter />
      <DatasetChapter />
      <ResultsChapter />
      <InsideTheModelChapter />
      <ClosingCta />
    </>
  );
}
