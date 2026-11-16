import { useId, useRef, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Language } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LEVEL, setNotation } from "./explore-utils";

function DifficultyBars({ level }: { level: number }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden>
      {[1, 2, 3].map((b) => (
        <span key={b} className={cn("w-[3px] rounded-full", b <= level ? "bg-ink-2" : "bg-line")} style={{ height: 4 + b * 3 }} />
      ))}
    </span>
  );
}

/**
 * The ten languages as a radio group: one tab stop, arrow keys (and Home / End) move the
 * selection, and the amber read head slides to the chosen row.
 */
export function LanguageList({
  languages,
  selectedId,
  onSelect,
  onPeek,
  labelledBy,
}: {
  languages: Language[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPeek: (id: string) => void;
  labelledBy: string;
}) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const index = languages.findIndex((l) => l.id === selectedId);

  const move = (to: number) => {
    const n = languages.length;
    const j = ((to % n) + n) % n;
    onSelect(languages[j].id);
    refs.current[j]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = index === -1 ? 0 : index;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") move(i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(languages.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div>
      {/* column heads for the instrument-style rows (desktop) */}
      <div aria-hidden className="mb-1.5 hidden grid-cols-[2.9rem_minmax(0,1fr)_auto] items-end gap-x-3 px-3.5 text-xs text-muted lg:grid">
        <span className="col-span-2">Language</span>
        <span className="flex items-center gap-3">
          <span className="w-[43px] text-center">Symbols</span>
          <span className="w-7 text-center" title="How hard it is for the ML pipelines">
            ML
          </span>
          <span className="w-10 text-right">States</span>
        </span>
      </div>
    <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-1 lg:gap-1">
      {languages.map((l, i) => {
        const on = l.id === selectedId;
        const level = DIFFICULTY_LEVEL[l.difficulty] ?? 1;
        const secondary = l.regex === l.name ? l.family : l.regex;
        return (
          <button
            key={l.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (index === -1 && i === 0) ? 0 : -1}
            aria-label={`${l.id}: ${l.name}`}
            aria-describedby={`${base}-${l.id}`}
            onClick={() => onSelect(l.id)}
            onPointerEnter={() => onPeek(l.id)}
            onFocus={() => onPeek(l.id)}
            style={{ borderRadius: 14 }}
            className={cn(
              "group relative w-full px-3 py-2.5 text-left transition-colors sm:px-3.5 lg:py-3",
              on ? "text-ink" : "text-ink-2 hover:bg-panel/55",
            )}
          >
            {on && (
              <motion.span
                layoutId={`${base}-head`}
                aria-hidden
                className="absolute inset-0 rounded-[14px] border border-line-strong bg-panel shadow-[var(--shadow)]"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
              >
                {/* the read head: an amber pointer on the selected row */}
                <span className="absolute -left-[5px] top-1/2 hidden h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent border-l-[color:var(--lamp)] lg:block" />
                <span className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-full bg-lamp" />
              </motion.span>
            )}
            <span className="relative grid grid-cols-[2.4rem_minmax(0,1fr)] items-center gap-x-2 lg:grid-cols-[2.9rem_minmax(0,1fr)_auto] lg:gap-x-3">
              <span className={cn("font-display text-lg font-semibold tabular lg:text-[22px]", on ? "text-lamp" : "text-ink-2")}>{l.id}</span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-[14px] font-medium leading-snug text-ink lg:hidden">{l.name}</span>
                <span className="hidden truncate text-[15px] font-medium text-ink lg:block" title={l.name}>
                  {l.name}
                </span>
                <span className="mt-0.5 hidden truncate font-mono text-[12px] text-muted sm:block" title={secondary}>
                  {secondary}
                </span>
              </span>
              <span className="hidden items-center gap-3 lg:flex">
                <span className="flex gap-[3px]" aria-hidden>
                  {l.alphabet.map((sym) => (
                    <span key={sym} className="grid h-5 w-5 place-items-center rounded-[5px] border border-line bg-panel-2/50 font-mono text-[11px] text-ink-2">
                      {sym}
                    </span>
                  ))}
                </span>
                <span className="flex w-7 justify-center" title={`Difficulty for the ML pipelines: ${l.difficulty}`}>
                  <DifficultyBars level={level} />
                </span>
                <span className="w-10 text-right font-mono text-[13px] text-ink-2 tabular" title="States in the minimal DFA">
                  {l.expected_min_states}
                </span>
              </span>
            </span>
            <span id={`${base}-${l.id}`} className="sr-only">
              Regular expression {l.regex}. Alphabet {setNotation(l.alphabet)}. {l.difficulty} for the ML pipelines. The minimal DFA has {l.expected_min_states}{" "}
              states.
            </span>
          </button>
        );
      })}
    </div>
    </div>
  );
}
