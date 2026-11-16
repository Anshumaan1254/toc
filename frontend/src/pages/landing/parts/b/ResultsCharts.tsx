import { useState } from "react";
import { ChartFrame, GroupedBars } from "@/components/charts/Charts";
import { Segmented } from "@/components/ui/primitives";
import { PIPELINE_BY_ID, PIPELINES } from "@/lib/meta";
import type { PipelineId, Summary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBands, words } from "./bands";
import { HeatGrid } from "./HeatGrid";
import { Meter } from "./ui";

type Split = "val" | "test" | "long";
const splitsFor = (longDash: string): { value: Split; label: string; long: string }[] => [
  { value: "val", label: "Validation", long: "validation split" },
  { value: "test", label: "Test", long: "test split" },
  { value: "long", label: `Lengths ${longDash}`, long: `held-out strings of length ${longDash}` },
];
const METRICS = [
  { id: "accuracy", name: "Accuracy" },
  { id: "precision", name: "Precision" },
  { id: "recall", name: "Recall" },
  { id: "f1", name: "F1" },
] as const;

/** (a) Mean accuracy / precision / recall / F1 of each pipeline, per split. */
export function PipelineScores({ summary }: { summary: Summary }) {
  const [split, setSplit] = useState<Split>("test");
  const bands = useBands();
  const SPLITS = splitsFor(bands.longDash);
  const avg = summary.summary.pipeline_averages[split];
  const all = PIPELINES.flatMap((p) => METRICS.map((m) => avg[p.id][m.id]));
  const lo = Math.min(0.8, Math.floor(Math.min(...all) * 20) / 20);
  const splitName = SPLITS.find((s) => s.value === split)!.long;
  return (
    <div className="space-y-5">
      <Segmented options={SPLITS.map((s) => ({ value: s.value, label: s.label }))} value={split} onChange={setSplit} label="Which split to score" />
      <ChartFrame
        title={`Mean scores over the ${words(summary.languages.length)} languages`}
        subtitle={`On the ${splitName}. The axis starts at ${lo.toFixed(2)} so the gaps are visible.`}
        legend={PIPELINES.map((p) => ({ name: p.name, color: p.color }))}
        table={{
          columns: ["Pipeline", ...METRICS.map((m) => m.name)],
          rows: PIPELINES.map((p) => [p.name, ...METRICS.map((m) => avg[p.id][m.id].toFixed(3))]),
        }}
      >
        <GroupedBars
          categories={METRICS.map((m) => m.name)}
          series={PIPELINES.map((p) => ({ id: p.id, name: p.name, color: p.color, values: METRICS.map((m) => avg[p.id][m.id]) }))}
          domain={[lo, 1]}
          format={(v) => v.toFixed(2)}
          yLabel="mean score"
          height={300}
          ariaLabel={`Mean accuracy, precision, recall and F1 of the ${words(PIPELINES.length)} pipelines on the ${splitName}`}
        />
      </ChartFrame>
    </div>
  );
}

const f1Fill = (v: number) => {
  const t = Math.max(0, Math.min(1, (v - 0.4) / 0.6));
  return `color-mix(in srgb, var(--ink-2) ${Math.round(10 + t * 78)}%, var(--panel))`;
};
const f1Ink = (v: number) => ((v - 0.4) / 0.6 > 0.55 ? "var(--bg)" : "var(--ink)");

/** (c) Test F1 for every language and pipeline. */
export function F1Heatmap({ summary }: { summary: Summary }) {
  const langs = summary.languages;
  const bands = useBands();
  return (
    <ChartFrame
      title="Test F1, language by pipeline"
      subtitle="Stronger cells are better; faint cells are where a pipeline failed"
      table={{
        columns: ["Language", ...PIPELINES.map((p) => p.short)],
        rows: langs.map((l) => [`${l.id} ${l.name}`, ...PIPELINES.map((p) => summary.ml[l.id]?.[p.id]?.test.f1.toFixed(3) ?? "–")]),
      }}
    >
      <HeatGrid
        ariaLabel="Test F1 of each pipeline on each language"
        rowHeader="F1"
        rows={langs.map((l) => ({ id: l.id, label: l.id, name: `${l.id} ${l.name}` }))}
        cols={PIPELINES.map((p) => ({
          id: p.id,
          name: p.name,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.short}
            </span>
          ),
        }))}
        value={(r, c) => summary.ml[r]?.[c as PipelineId]?.test.f1 ?? null}
        format={(v) => v.toFixed(2)}
        fill={f1Fill}
        ink={f1Ink}
        detail={(r, c) => {
          const m = summary.ml[r]?.[c as PipelineId];
          return m ? `accuracy ${(m.test.accuracy * 100).toFixed(1)}%, lengths ${bands.longDash} ${(m.long.accuracy * 100).toFixed(1)}%` : null;
        }}
      />
    </ChartFrame>
  );
}

/** (b) The best pipeline of each language (ties shown), its test F1 and its accuracy on long strings. */
export function BestPerLanguage({ summary }: { summary: Summary }) {
  const bands = useBands();
  const rows = summary.languages.map((l) => {
    const best = summary.summary.best_pipeline_per_language[l.id];
    const per = summary.ml[l.id];
    const winners = best ? PIPELINES.filter((p) => per?.[p.id] && Math.abs(per[p.id].test.f1 - best.test_f1) < 1e-9).map((p) => p.id) : [];
    return { lang: l, best, winners };
  });
  return (
    <ChartFrame
      title="Best pipeline per language"
      subtitle="By test F1; ties are listed together"
      table={{
        columns: ["Language", "Best pipeline", "Tied with", "Test F1", "Test accuracy", `Accuracy, lengths ${bands.longDash}`],
        rows: rows.map((r) => [
          `${r.lang.id} ${r.lang.name}`,
          r.best ? PIPELINE_BY_ID[r.best.pipeline].name : "–",
          r.winners.filter((w) => w !== r.best?.pipeline).map((w) => PIPELINE_BY_ID[w].short).join(", ") || "–",
          r.best?.test_f1.toFixed(3) ?? "–",
          r.best?.test_accuracy.toFixed(3) ?? "–",
          r.best?.long_accuracy.toFixed(3) ?? "–",
        ]),
      }}
    >
      <ol className="divide-y divide-line border-y border-line" aria-label="Best pipeline per language">
        {rows.map((r) => {
          const solved = r.best && r.best.test_f1 >= 0.9999 && r.best.long_accuracy >= 0.9999;
          return (
            <li key={r.lang.id} className="grid grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[2.6rem_minmax(0,1fr)_auto_7.5rem]">
              <span className="font-mono text-sm text-ink">{r.lang.id}</span>
              <span className="truncate text-sm text-ink-2" title={r.lang.name}>
                {r.lang.name}
              </span>
              <span className="flex flex-wrap justify-end gap-1" aria-label={`Best: ${r.winners.map((w) => PIPELINE_BY_ID[w].name).join(", ")}`}>
                {r.winners.map((w) => (
                  <span
                    key={w}
                    className={cn("rounded-full border px-1.5 py-px font-mono text-[10.5px]", w === r.best?.pipeline ? "text-ink" : "text-muted")}
                    style={{ borderColor: PIPELINE_BY_ID[w].color }}
                  >
                    {PIPELINE_BY_ID[w].short}
                  </span>
                ))}
              </span>
              <span className="col-span-3 flex items-center gap-2 sm:col-span-1">
                <Meter
                  value={r.best?.long_accuracy ?? 0}
                  color={solved ? "var(--accept)" : "var(--reject)"}
                  label={`${r.lang.id}: accuracy on lengths ${bands.longDash} ${(((r.best?.long_accuracy ?? 0) as number) * 100).toFixed(1)}%`}
                />
                <span className="tabular w-11 shrink-0 text-right text-xs text-ink-2">{(((r.best?.long_accuracy ?? 0) as number) * 100).toFixed(0)}%</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted">The bar is the winner&apos;s accuracy on strings of length {bands.longDash}.</p>
    </ChartFrame>
  );
}

/** (d) Accuracy lost between the test split and lengths 21-40, per language and pipeline. */
export function GeneralizationDrop({ summary }: { summary: Summary }) {
  const bands = useBands();
  const langs = summary.languages.map((l) => l.id);
  const drop = (L: string, p: PipelineId) => summary.ml[L]?.[p]?.generalization_drop ?? null;
  const max = Math.max(0.05, ...langs.flatMap((L) => PIPELINES.map((p) => drop(L, p.id) ?? 0)));
  return (
    <ChartFrame
      title="Accuracy lost on longer strings"
      subtitle={`Test accuracy minus accuracy on lengths ${bands.longDash}, in percentage points`}
      legend={PIPELINES.map((p) => ({ name: p.name, color: p.color }))}
      table={{
        columns: ["Language", ...PIPELINES.map((p) => `${p.short}: test → ${bands.longDash}`)],
        rows: langs.map((L) => [
          L,
          ...PIPELINES.map((p) => {
            const m = summary.ml[L]?.[p.id];
            return m
              ? `${(m.test.accuracy * 100).toFixed(1)}% → ${(m.long.accuracy * 100).toFixed(1)}% (${m.generalization_drop >= 0 ? "−" : "+"}${Math.abs(m.generalization_drop * 100).toFixed(1)} pts)`
              : "–";
          }),
        ]),
      }}
    >
      <GroupedBars
        categories={langs}
        series={PIPELINES.map((p) => ({ id: p.id, name: p.name, color: p.color, values: langs.map((L) => drop(L, p.id)) }))}
        domain={[0, Math.ceil(max * 10) / 10]}
        format={(v) => `${Math.round(v * 100)}`}
        yLabel="points lost"
        height={300}
        ariaLabel={`Accuracy lost on strings of length ${bands.longWords}, per language and pipeline`}
      />
    </ChartFrame>
  );
}
