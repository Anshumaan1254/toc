import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PIPELINES } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { LSTAR_IDS } from "./results-data";

const pop = (i: number, reduce: boolean | null) =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, scale: 0.4 },
        whileInView: { opacity: 1, scale: 1 },
        viewport: { once: true },
        transition: { duration: 0.35, delay: 0.15 + i * 0.025 },
      };

/** 40 squares, one per (pipeline, language): filled when L* extracted the exact DFA. */
export function ExtractionDots({ summary }: { summary: Summary }) {
  const reduce = useReducedMotion();
  const langs = summary.languages.map((l) => l.id);
  return (
    <div className="grid gap-[5px]" style={{ gridTemplateColumns: `auto repeat(${langs.length}, 0.9rem)` }} aria-hidden>
      {LSTAR_IDS.map((a, r) => (
        <Row key={a} label={PIPELINES[r].short}>
          {langs.map((L, c) => {
            const exact = !!summary.automata[L]?.[a]?.equivalent_to_truth;
            return (
              <motion.span
                key={L}
                {...pop(r * langs.length + c, reduce)}
                className="h-[0.9rem] w-[0.9rem] rounded-[3px] border"
                style={exact ? { background: "var(--accept)", borderColor: "var(--accept)" } : { borderColor: "var(--reject)", background: "var(--reject-soft)" }}
              />
            );
          })}
        </Row>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pr-2 text-right font-mono text-[11px] leading-[0.9rem] text-muted">{label}</span>
      {children}
    </>
  );
}

/** One circle per language for each passive learner: filled when it recovered the exact DFA. */
export function PassiveDots({ summary }: { summary: Summary }) {
  const reduce = useReducedMotion();
  const langs = summary.languages.map((l) => l.id);
  const rows: { id: "edsm" | "rpni"; name: string }[] = [
    { id: "edsm", name: "EDSM" },
    { id: "rpni", name: "RPNI" },
  ];
  return (
    <div className="grid gap-[7px]" style={{ gridTemplateColumns: `auto repeat(${langs.length}, 1.1rem)` }} aria-hidden>
      {rows.map((row, r) => (
        <Row key={row.id} label={row.name}>
          {langs.map((L, c) => {
            const exact = !!summary.automata[L]?.[row.id]?.equivalent_to_truth;
            return (
              <motion.span
                key={L}
                {...pop(r * langs.length + c, reduce)}
                title={`${L}: ${exact ? "exact" : "not exact"}`}
                className="h-[1.1rem] w-[1.1rem] rounded-full border-2"
                style={exact ? { background: "var(--accept)", borderColor: "var(--accept)" } : { borderColor: "var(--reject)" }}
              />
            );
          })}
        </Row>
      ))}
    </div>
  );
}

/** Four thin meters, one per pipeline, on the full 0-100% scale. */
export function PipelineMeters({ values }: { values: { id: string; short: string; color: string; value: number }[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="grid w-full max-w-sm grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2" aria-hidden>
      {values.map((v, i) => (
        <MeterRow key={v.id} label={v.short} value={v.value} color={v.color} delay={i * 0.08} reduce={reduce} />
      ))}
    </div>
  );
}

function MeterRow({ label, value, color, delay, reduce }: { label: string; value: number; color: string; delay: number; reduce: boolean | null }) {
  return (
    <>
      <span className="font-mono text-[11px] text-muted">{label}</span>
      <span className="relative h-1.5 overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color }}
          initial={reduce ? { width: `${value * 100}%` } : { width: 0 }}
          whileInView={{ width: `${value * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay }}
        />
      </span>
      <span className="tabular text-xs text-ink-2">{(value * 100).toFixed(1)}%</span>
    </>
  );
}

/** A score against the 50% a coin flip would get. */
export function ChanceMeter({ value }: { value: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="w-full max-w-sm" aria-hidden>
      <div className="relative h-2 rounded-full bg-[color:var(--reject-soft)]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--reject)]"
          initial={reduce ? { width: `${value * 100}%` } : { width: 0 }}
          whileInView={{ width: `${value * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, delay: 0.2 }}
        />
        <div className="absolute -top-2 bottom-[-0.5rem] left-1/2 w-px bg-ink-2" />
      </div>
      <div className="relative mt-3 h-4 text-[11px] text-muted">
        <span className="absolute left-0">0%</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-ink-2">a coin flip</span>
        <span className="absolute right-0">100%</span>
      </div>
    </div>
  );
}

/** Two squares drawn to scale by area: the average DFA against the average random forest. */
export function ToScale({ small, big, smallLabel, bigLabel }: { small: number; big: number; smallLabel: string; bigLabel: string }) {
  const reduce = useReducedMotion();
  const side = 92;
  const s = Math.max(1.5, side * Math.sqrt(small / big));
  return (
    <div className="flex items-end gap-5" aria-hidden>
      <div className="flex flex-col items-start gap-1.5">
        <motion.div
          className="grid-paper rounded-[3px] border border-line-strong"
          style={{ width: side, height: side, background: "color-mix(in srgb, var(--ink-2) 14%, transparent)" }}
          initial={reduce ? false : { scale: 0.2, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
        <span className="text-[11px] text-muted">{bigLabel}</span>
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <div className="relative" style={{ width: Math.max(s, 8), height: side }}>
          <motion.span
            className="absolute bottom-0 left-0 rounded-[1px] bg-lamp shadow-[0_0_10px_var(--lamp)]"
            style={{ width: s, height: s }}
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.9 }}
          />
        </div>
        <span className="whitespace-nowrap text-[11px] text-lamp">{smallLabel}</span>
      </div>
    </div>
  );
}
