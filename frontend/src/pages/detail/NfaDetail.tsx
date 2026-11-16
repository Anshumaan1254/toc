import type { DetailProps } from "./DetailPage";

export default function NfaDetail({ language, approach }: DetailProps) {
  return <div className="text-ink-2">NfaDetail for {language.id} / {approach.id} (under construction)</div>;
}
