import { ChartFrame } from "@/components/charts/Charts";
import { DimensionLine } from "@/components/ui/DimensionLine";
import { ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import { errorMessage, useDataset, useLanguages, useSummary } from "@/lib/api";
import { int } from "@/lib/meta";
import type { DatasetReport } from "@/lib/types";
import { GlyphField } from "../parts/b/backgrounds";
import { HeatGrid } from "../parts/b/HeatGrid";
import { LengthHistogram } from "../parts/b/LengthHistogram";
import { StringBench } from "../parts/b/StringBench";
import { Lead, Reveal, Rolling, SceneTitle } from "../parts/b/ui";

/**
 * Chapter: the dataset. A glyph field of the alphabet symbols behind one huge number, then a
 * sticky drafting sheet that demonstrates each generation strategy on a real DFA, then where
 * the lengths fall and how balanced each slice is.
 */
export function DatasetChapter() {
  const dataset = useDataset();
  const summary = useSummary();
  return (
    <section id="dataset" aria-labelledby="dataset-title" className="relative">
      <Opener report={dataset.data} error={dataset.isError ? errorMessage(dataset.error) : null} onRetry={() => dataset.refetch()} />
      {dataset.data && (
        <>
          <div className="mx-auto max-w-6xl px-6 pt-10 md:pt-16">
            <Reveal>
              <SceneTitle>Four ways to make a string</SceneTitle>
              <Lead className="mt-5">
                Random strings alone would make an easy, misleading dataset. Each language mixes four strategies, and every label still comes from the same
                ground-truth <Term k="dfa">DFA</Term>. Scroll through them on a real automaton.
              </Lead>
            </Reveal>
          </div>
          <StringBench report={dataset.data} splitSizes={summary.data?.meta.split_sizes} />
          <Distribution report={dataset.data} />
        </>
      )}
    </section>
  );
}

function Opener({ report, error, onRetry }: { report?: DatasetReport; error: string | null; onRetry: () => void }) {
  const perLanguage = report ? [...new Set(report.languages.map((l) => l.rows))] : [];
  const minLen = report ? Math.min(...report.languages.map((l) => l.min_len)) : 0;
  const maxLen = report ? Math.max(...report.languages.map((l) => l.max_len)) : 0;
  return (
    <div className="relative isolate overflow-hidden">
      <GlyphField />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[color:var(--bg)]" />
      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 py-28">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : !report ? (
          <LoadingBlock label="Loading the dataset report…" />
        ) : (
          <>
            <h2 id="dataset-title" className="font-display font-semibold text-ink">
              <span className="block text-[clamp(4.25rem,16.5vw,13.5rem)] leading-[0.86] tracking-[-0.035em]">
                <Rolling value={report.total_rows} duration={1.2} />
              </span>
              <span className="mt-4 block max-w-3xl text-[clamp(1.75rem,4.4vw,3.4rem)] leading-[1.02] tracking-[-0.015em] text-ink-2">
                labelled strings, and every label proven
              </span>
            </h2>
            <DimensionLine label={`labelled strings, lengths ${minLen} to ${maxLen}`} className="mt-6 max-w-3xl" />
            <p className="t-annotation mt-3 text-ink-2">
              {report.languages.length} languages ×{" "}
              {perLanguage.length === 1 ? int(perLanguage[0]) : `${int(Math.min(...perLanguage))}+`} strings · {int(report.duplicates_removed.total)} duplicates
              removed
            </p>
            <Lead className="mt-8">
              Each string got its label from one place only: the language&apos;s ground-truth DFA. Every label was then checked again against the{" "}
              <Term k="nfa">NFA</Term>, the regular expression and a plain predicate written in code. All of them agreed on every string.
            </Lead>
          </>
        )}
      </div>
    </div>
  );
}

const balanceFill = (v: number) => {
  const d = Math.min(1, Math.abs(v - 0.5) * 2);
  if (d < 0.01) return "color-mix(in srgb, var(--ink-2) 13%, var(--panel))";
  return `color-mix(in srgb, ${v > 0.5 ? "var(--accept)" : "var(--reject)"} ${Math.round(14 + d * 48)}%, var(--panel))`;
};

function Distribution({ report }: { report: DatasetReport }) {
  const languages = useLanguages();
  const nameOf = (id: string) => languages.data?.find((l) => l.id === id)?.name ?? id;
  const buckets = report.config.buckets;
  const exhaustiveMax = Math.max(...buckets.filter((b) => b.size === null).map((b) => b.hi));
  const trainMax = Math.max(...buckets.filter((b) => b.pool === "main").map((b) => b.hi));
  const firstLong = buckets.find((b) => b.pool === "long")?.label;
  const lengths = Object.keys(report.length_distribution.main ?? {}).map(Number);
  const cell = (lang: string, bucket: string) => report.per_bucket.find((r) => r.language_id === lang && r.length_bucket === bucket);
  const lopsided = report.per_bucket
    .filter((r) => !r.balanced_by_design)
    .reduce<(typeof report.per_bucket)[number] | null>((m, r) => (!m || Math.abs(r.positive_rate - 0.5) > Math.abs(m.positive_rate - 0.5) ? r : m), null);
  const langIds = report.languages.map((l) => l.language_id);

  return (
    <div className="mx-auto max-w-6xl space-y-28 px-6 pb-32 pt-8 md:space-y-36">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
        <Reveal>
          <SceneTitle>Where the lengths fall</SceneTitle>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Taking every string up to length {exhaustiveMax} makes the left side climb steeply: each extra symbol doubles the count. From there the samples level
            off. Everything right of the line is the long pool, the strings no model trains on.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <ChartFrame
            title="Strings per length, all languages"
            subtitle={`${int(report.total_rows)} strings; bars right of the line are held out`}
            table={{
              columns: ["Length", "Train, validation and test pool", "Long pool"],
              rows: lengths.map((n) => [n, int(report.length_distribution.main?.[n] ?? 0), int(report.length_distribution.long?.[n] ?? 0)]),
            }}
          >
            <LengthHistogram main={report.length_distribution.main ?? {}} long={report.length_distribution.long ?? {}} trainMax={trainMax} exhaustiveMax={exhaustiveMax} />
          </ChartFrame>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
        <Reveal>
          <SceneTitle>Balanced wherever it can be</SceneTitle>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Sampled bands are exactly half accepted and half rejected, so a model cannot score well by guessing the majority. The exhaustive bands keep each
            language&apos;s natural ratio
            {lopsided ? (
              <>
                , which can be lopsided: only {(lopsided.positive_rate * 100).toFixed(0)}% of {lopsided.language_id}&apos;s strings of length{" "}
                {lopsided.length_bucket.replace("-", " to ")} are accepted. {lopsided.language_id} is &ldquo;{nameOf(lopsided.language_id)}&rdquo;.
              </>
            ) : (
              "."
            )}
          </p>
          <ul className="mt-6 space-y-2 text-sm text-ink-2" aria-label="Colour key">
            <li className="flex items-center gap-2.5">
              <span className="h-3.5 w-6 rounded" style={{ background: balanceFill(0.85) }} aria-hidden />
              more accepted than rejected
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-3.5 w-6 rounded" style={{ background: balanceFill(0.5) }} aria-hidden />
              exactly balanced
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-3.5 w-6 rounded" style={{ background: balanceFill(0.15) }} aria-hidden />
              more rejected than accepted
            </li>
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <ChartFrame
            title="Share of accepted strings per length band"
            subtitle={`${langIds.length} languages; the last ${buckets.filter((b) => b.pool === "long").length} bands are the long pool`}
            table={{
              columns: ["Language", ...buckets.map((b) => `${b.label}${b.pool === "long" ? " (long)" : ""}`)],
              rows: langIds.map((id) => [id, ...buckets.map((b) => {
                const c = cell(id, b.label);
                return c ? `${(c.positive_rate * 100).toFixed(1)}% of ${int(c.rows)}` : "–";
              })]),
            }}
          >
            <HeatGrid
              ariaLabel="Share of accepted strings for each language and length band"
              rowHeader="length"
              rows={langIds.map((id) => ({ id, label: id, name: `${id} ${nameOf(id)}` }))}
              cols={buckets.map((b) => ({
                id: b.label,
                name: `lengths ${b.label.replace("-", "–")}`,
                gapBefore: b.label === firstLong,
                label: (
                  <>
                    <span className="block font-mono text-ink">{b.label.replace("-", "–")}</span>
                    <span className="block text-[10.5px] text-muted">{b.size === null ? "every string" : b.pool === "long" ? "long pool" : "sampled"}</span>
                  </>
                ),
              }))}
              value={(r, c) => cell(r, c)?.positive_rate ?? null}
              format={(v) => `${Math.round(v * 100)}%`}
              fill={balanceFill}
              ink={() => "var(--ink)"}
              detail={(r, c) => {
                const x = cell(r, c);
                return x ? `${int(x.positives)} of ${int(x.rows)} strings accepted` : null;
              }}
            />
          </ChartFrame>
        </Reveal>
      </div>
    </div>
  );
}
