import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { describeFeature, featureFill, featureRows, formatFeatureValue } from "./features";

/**
 * The feature vector as a panel of cells, one per generic feature, grouped in labelled rows.
 * Cells light up (the lamp) when the feature is non-zero for the string; the model's most heavily
 * weighted features carry a ring, so you can see whether the string switched on what the model reads.
 */
export function FeatureMatrix({
  alphabet,
  values,
  revealed,
  sweeping,
  important,
  inputLength,
  total,
}: {
  alphabet: string[];
  /** Non-zero feature values for the current string (null before the first run). */
  values: Map<string, number> | null;
  /** Lit cells are shown. */
  revealed: boolean;
  /** Reveal with a left-to-right sweep (the "computing" moment). */
  sweeping: boolean;
  important: Set<string>;
  inputLength: number;
  total: number;
}) {
  const rows = useMemo(() => featureRows(alphabet), [alphabet]);
  const [hover, setHover] = useState<string | null>(null);
  const active = values ? values.size : 0;
  let order = 0;

  const readout = (() => {
    if (hover) {
      const info = describeFeature(hover);
      const v = values?.get(hover) ?? 0;
      return (
        <>
          <span className="text-ink">{info.label}</span>{" "}
          <span className="font-mono text-muted">{hover}</span>
          {values && revealed && (
            <span className="text-ink">
              {" "}
              = <span className="font-mono">{formatFeatureValue(hover, v)}</span>
            </span>
          )}
        </>
      );
    }
    if (!values || !revealed) return <span>{total} features, all computed the same way for every language</span>;
    return (
      <span>
        <span className="font-medium text-ink">{active}</span> of {total} are non-zero for this string
      </span>
    );
  })();

  return (
    <div onMouseLeave={() => setHover(null)}>
      <div
        role="img"
        aria-label={
          values && revealed
            ? `${active} of ${total} features are non-zero for this string.`
            : `${total} generic string features: length, counts, n-grams, positions, prefixes, suffixes, runs and remainders.`
        }
        className="space-y-[4px]"
      >
        {rows.map((row) => {
          const chunks = row.chunks ?? [row.names.length];
          let cursor = 0;
          return (
            <div key={row.key} className="flex items-center gap-2">
              <span className="w-[54px] shrink-0 truncate text-right text-[10.5px] leading-none text-muted" aria-hidden>
                {row.label}
              </span>
              <div className="flex min-w-0 items-center gap-x-[4px]" aria-hidden>
                {chunks.map((size, ci) => {
                  const names = row.names.slice(cursor, cursor + size);
                  cursor += size;
                  return (
                    <div key={ci} className="flex gap-[2px]">
                      {names.map((name) => {
                        const v = values?.get(name) ?? 0;
                        const on = revealed && v !== 0;
                        const fill = on ? 0.35 + 0.65 * featureFill(name, v, inputLength) : 0;
                        const delay = sweeping ? order++ * 5 : 0;
                        return (
                          <span
                            key={name}
                            onMouseEnter={() => setHover(name)}
                            className={cn(
                              "block h-[8px] w-[8px] rounded-[2px] border",
                              important.has(name) ? "border-ink-2/80" : "border-line",
                              hover === name && "outline outline-1 outline-offset-1 outline-[color:var(--ink)]",
                            )}
                            style={{
                              backgroundColor: on ? `color-mix(in srgb, var(--lamp) ${Math.round(fill * 100)}%, transparent)` : "var(--panel-2)",
                              boxShadow: on && fill > 0.8 ? "0 0 6px -1px var(--lamp)" : "none",
                              transition: "background-color 220ms ease, box-shadow 220ms ease",
                              transitionDelay: `${delay}ms`,
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 min-h-[2.6em] text-xs leading-snug text-ink-2" aria-live="off">
        {readout}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[8px] w-[8px] rounded-[2px] bg-lamp" /> non-zero for this string
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[8px] w-[8px] rounded-[2px] border border-ink-2/80 bg-panel-2" /> weighted most by the model
        </span>
      </div>
    </div>
  );
}
