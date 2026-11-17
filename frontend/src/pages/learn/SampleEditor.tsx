import { useEffect, useId, useRef, useState, type UIEvent } from "react";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Dices, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESETS } from "./presets";
import { Ticker } from "./Ticker";
import type { Column, ParsedColumn, ParsedLine } from "./samples";

const ROW = 28; // px; must match leading-7 on the textarea, the underlay and the gutter

function rowClass(line: ParsedLine): string {
  switch (line.status) {
    case "conflict":
      return "bg-reject-soft shadow-[inset_3px_0_0_var(--reject)]";
    case "invalid":
      return "shadow-[inset_3px_0_0_var(--reject)] [background-image:repeating-linear-gradient(135deg,var(--reject-soft)_0_7px,transparent_7px_13px)]";
    case "duplicate":
      return "bg-panel-2/70";
    default:
      return "";
  }
}

export interface SampleColumnProps {
  column: Column;
  text: string;
  onChange: (text: string) => void;
  parsed: ParsedColumn;
  /** Increments when a preset replaces the text: plays the print-in scan. */
  fillKey: number;
  /** Increments when the visitor tries to learn with blocking problems: flashes them. */
  flashKey: number;
}

export function SampleColumn({ column, text, onChange, parsed, fillKey, flashKey }: SampleColumnProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [scan, setScan] = useState(0);
  const accepted = column === "accepted";
  const title = accepted ? "Accepted" : "Rejected";
  const problems = parsed.lines.filter((l) => l.status === "invalid" || l.status === "conflict");
  const duplicates = parsed.lines.filter((l) => l.status === "duplicate").length;

  const sync = (top: number) => {
    if (underRef.current) underRef.current.style.transform = `translateY(${-top}px)`;
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-top}px)`;
  };
  const onScroll = (e: UIEvent<HTMLTextAreaElement>) => sync(e.currentTarget.scrollTop);

  // A preset replaced the text: back to the top, and print it in behind a scanning read head.
  useEffect(() => {
    if (fillKey === 0) return;
    const el = taRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
      sync(0);
    }
    if (!reduce) setScan((k) => k + 1);
  }, [fillKey, reduce]);

  useEffect(() => {
    const el = taRef.current;
    if (!scan || !el || reduce) return;
    const controls = animate(el, { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"] }, { duration: 0.7, ease: [0.45, 0, 0.2, 1] });
    return () => {
      controls.stop();
      el.style.clipPath = "";
    };
  }, [scan, reduce]);

  // Learning was blocked: flash the highlighted lines so the eye finds them.
  useEffect(() => {
    const el = underRef.current;
    if (!flashKey || !el || reduce) return;
    const controls = animate(el, { opacity: [0.2, 1, 0.3, 1] }, { duration: 0.9 });
    return () => controls.stop();
  }, [flashKey, reduce]);

  const insertEpsilon = () => {
    const next = text.trim() === "" ? "ε" : text.endsWith("\n") ? `${text}ε` : `${text}\nε`;
    onChange(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
      el.scrollTop = el.scrollHeight;
    });
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel/90 shadow-[var(--shadow)] backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accepted ? "bg-accept" : "bg-reject")} aria-hidden />
        <h3 id={`${id}-title`} className="font-display text-lg font-semibold text-ink">
          {title}
        </h3>
        <span className="text-sm text-muted">
          <Ticker value={parsed.strings.length} duration={0.6} className="text-ink-2" />{" "}
          {parsed.strings.length === 1 ? "string" : "strings"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={insertEpsilon}
            className="h-8 rounded-lg border border-line px-2.5 font-mono text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            aria-label={`Add the empty string ε to ${title}`}
            title="Add the empty string"
          >
            + ε
          </button>
          <button
            type="button"
            onClick={() => {
              onChange("");
              taRef.current?.focus();
            }}
            disabled={text === ""}
            className="h-8 rounded-lg px-2.5 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="group/edit relative flex h-[13.75rem] md:h-[17.25rem]">
        {/* gutter: line numbers, red for lines that need attention */}
        <div className="w-10 shrink-0 overflow-hidden border-r border-line bg-panel-2/30" aria-hidden>
          <div ref={gutterRef} className="py-3 pr-2 text-right font-mono text-[11px] leading-7 will-change-transform">
            {parsed.lines.map((l) => (
              <div
                key={l.index}
                style={{ height: ROW }}
                className={cn(
                  "tabular",
                  l.status === "invalid" || l.status === "conflict" ? "font-semibold text-reject" : l.status === "duplicate" ? "text-muted/50" : "text-muted",
                )}
              >
                {l.index + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          {/* underlay: one row per line, tinted by status; scrolls with the textarea */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div ref={underRef} className="py-3 will-change-transform">
              {parsed.lines.map((l) => (
                <div key={l.index} style={{ height: ROW }} className={rowClass(l)} />
              ))}
            </div>
          </div>

          <textarea
            ref={taRef}
            id={`${id}-input`}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onScroll={onScroll}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            data-lenis-prevent
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-notes`}
            aria-invalid={problems.some((p) => p.status === "invalid")}
            placeholder={accepted ? "ab\naab\nε" : "a\nba\nbb"}
            className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent px-3 py-3 font-mono text-[15px] leading-7 tracking-wide text-ink caret-lamp outline-none! placeholder:text-muted/50"
          />

          <AnimatePresence>
            {scan > 0 && !reduce && (
              <motion.div
                key={scan}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-0.5 bg-lamp shadow-[0_0_14px_2px_var(--lamp)]"
                initial={{ top: "0%", opacity: 1 }}
                animate={{ top: "100%", opacity: [1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.45, 0, 0.2, 1] }}
              />
            )}
          </AnimatePresence>
        </div>
        {/* focus ring for the whole editing surface (the textarea's own outline would be clipped) */}
        <div className="pointer-events-none absolute inset-0 opacity-0 shadow-[inset_0_0_0_2px_var(--lamp)] transition-opacity group-focus-within/edit:opacity-100" aria-hidden />
      </div>

      <div id={`${id}-notes`} className="min-h-11 border-t border-line px-4 py-2.5 text-sm" aria-live="polite">
        {problems.length > 0 ? (
          <ul className="space-y-0.5 text-reject">
            {problems.slice(0, 2).map((l) => (
              <li key={l.index}>
                Line {l.index + 1}: <span className="font-mono">{l.status === "conflict" ? (l.value === "" ? "ε" : l.value) : text.split("\n")[l.index]?.trim().slice(0, 24)}</span> {l.note}.
              </li>
            ))}
            {problems.length > 2 && <li className="text-muted">and {problems.length - 2} more highlighted lines</li>}
          </ul>
        ) : (
          <p className="text-muted">
            {parsed.strings.length === 0
              ? accepted
                ? "Strings in your language, one per line."
                : "Strings outside your language, one per line."
              : duplicates > 0
                ? `${duplicates} repeated ${duplicates === 1 ? "line counts" : "lines count"} once.`
                : "One string per line; ε is the empty string."}
          </p>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ presets
export function PresetBar({
  activeId,
  onPick,
  onReshuffle,
  canUndo,
  onUndo,
}: {
  activeId: string | null;
  onPick: (id: string) => void;
  onReshuffle: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
        <p id="preset-label" className="text-sm text-ink-2">
          Or load examples of a language you can probably guess:
        </p>
        <div className="flex items-center gap-1">
          <AnimatePresence initial={false}>
            {activeId && (
              <motion.button
                key="shuffle"
                type="button"
                onClick={onReshuffle}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-ink-2 transition-colors hover:bg-panel-2/70 hover:text-ink"
              >
                <Dices size={15} aria-hidden /> Draw different examples
              </motion.button>
            )}
            {canUndo && (
              <motion.button
                key="undo"
                type="button"
                onClick={onUndo}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-ink-2 transition-colors hover:bg-panel-2/70 hover:text-ink"
              >
                <Undo2 size={15} aria-hidden /> Bring back my strings
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div
        className="flex items-center gap-2 max-md:-mx-6 max-md:overflow-x-auto max-md:px-6 max-md:pb-1 md:flex-wrap [&>button]:shrink-0"
        role="group"
        aria-labelledby="preset-label"
      >
        {PRESETS.map((p) => {
          const on = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(p.id)}
              className={cn(
                "group relative h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                on ? "border-[color:var(--ink-2)] bg-panel-2 text-ink" : "border-line bg-panel/70 text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {p.label}
              <span className="ml-2 font-mono text-xs text-muted">{`{${p.alphabet.join(",")}}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
