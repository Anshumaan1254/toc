import { useCallback, useState } from "react";
import { errorMessage, useModel } from "@/lib/api";
import type { ClassifyResult } from "@/lib/types";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import type { DetailProps } from "./DetailPage";
import { ExtractedDfaSection } from "./ml/ExtractedDfaSection";
import { InternalsSection } from "./ml/InternalsSection";
import { PerformanceSection } from "./ml/PerformanceSection";
import { PipelineSection } from "./ml/PipelineSection";

/**
 * Page 3 for an ML pipeline: watch a string go through it, look inside the model, see how well it does
 * (and where it breaks), then meet the DFA that L* extracted from it.
 */
export default function MlDetail({ language, approach }: DetailProps) {
  const pid = approach.pipeline;
  const model = useModel(language.id, pid);
  const [lastRun, setLastRun] = useState<ClassifyResult | null>(null);
  const onResult = useCallback((r: ClassifyResult) => setLastRun(r), []);

  if (!pid) return <ErrorState message={`${approach.name} is not an ML pipeline.`} />;
  if (model.isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading the trained model">
        <Skeleton className="h-16 w-2/3 max-w-xl" />
        <Skeleton className="h-6 w-full max-w-2xl" />
        <Skeleton className="h-[560px] w-full rounded-[28px]" />
      </div>
    );
  }
  if (model.error || !model.data) return <ErrorState message={errorMessage(model.error)} onRetry={() => model.refetch()} />;

  return (
    <div className="space-y-36 md:space-y-44">
      <PipelineSection language={language} approach={approach} model={model.data} onResult={onResult} />
      <InternalsSection model={model.data} language={language} lastRun={lastRun} />
      <PerformanceSection model={model.data} language={language} />
      <ExtractedDfaSection language={language} model={model.data} lastRun={lastRun} />
    </div>
  );
}
