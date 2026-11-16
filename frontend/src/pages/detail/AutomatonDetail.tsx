import type { DetailProps } from "./DetailPage";

export default function AutomatonDetail({ language, approach }: DetailProps) {
  return <div className="text-ink-2">AutomatonDetail for {language.id} / {approach.id} (under construction)</div>;
}
