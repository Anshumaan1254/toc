import type { DetailProps } from "./DetailPage";

export default function MlDetail({ language, approach }: DetailProps) {
  return <div className="text-ink-2">MlDetail for {language.id} / {approach.id} (under construction)</div>;
}
