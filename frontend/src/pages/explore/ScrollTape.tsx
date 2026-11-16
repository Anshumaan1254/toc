import { useMemo, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useAutomaton } from "@/lib/api";
import type { Language } from "@/lib/types";
import { cn } from "@/lib/utils";
import { demoSamples, hashSeed } from "./explore-utils";

function TapeWord({ word, accepted, languageId }: { word: string; accepted: boolean; languageId: string }) {
  return (
    <li className="flex shrink-0 items-center gap-2.5">
      <span className="flex gap-[3px]">
        {[...word].map((ch, i) => (
          <span key={i} className="grid h-8 w-7 place-items-center rounded-md border border-line-strong bg-panel font-mono text-sm text-ink">
            {ch}
          </span>
        ))}
      </span>
      <span className={cn("font-mono text-sm", accepted ? "text-accept" : "text-reject")}>
        {accepted ? "∈" : "∉"} {languageId}
      </span>
    </li>
  );
}

const EDGE_FADE = "linear-gradient(to right, transparent, #000 7%, #000 93%, transparent)";

/**
 * Two strips of labelled strings from the selected language that slide in opposite directions
 * as the page scrolls, past a fixed read head: members of the language on top, non-members
 * underneath, so the pattern every approach below has to learn is visible by eye.
 * Decorative (aria-hidden); the stage above carries the same information accessibly.
 */
export function ScrollTape({ language }: { language: Language | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const query = useAutomaton(language?.id, "dfa");
  const automaton = query.data?.automaton;
  const dfa = automaton && automaton.kind === "dfa" ? automaton : undefined;
  const rows = useMemo(() => {
    if (!dfa || !language) return null;
    const list = demoSamples(dfa, 40, hashSeed(language.id) ^ 0x9e3779b9, 2, 9);
    return { inside: list.filter((s) => s.accepted), outside: list.filter((s) => !s.accepted) };
  }, [dfa, language]);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const toLeft = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);
  const toRight = useTransform(scrollYProgress, [0, 1], ["-30%", "0%"]);

  return (
    <div ref={ref} aria-hidden className="relative overflow-hidden border-y border-line bg-panel/35 py-8">
      <div style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}>
        {rows && language ? (
          <div className="space-y-4">
            <motion.ul style={{ x: reduce ? 0 : toLeft }} className="flex w-max gap-8 pl-8">
              {rows.inside.map((s, i) => (
                <TapeWord key={`${s.string}-${i}`} word={s.string} accepted languageId={language.id} />
              ))}
            </motion.ul>
            <motion.ul style={{ x: reduce ? 0 : toRight }} className="flex w-max gap-8 pl-8">
              {rows.outside.map((s, i) => (
                <TapeWord key={`${s.string}-${i}`} word={s.string} accepted={false} languageId={language.id} />
              ))}
            </motion.ul>
          </div>
        ) : (
          <div className="h-[80px]" />
        )}
      </div>
      {/* the read window the strings slide under */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 flex-col items-center pb-4">
        <svg width="14" height="10" viewBox="0 0 14 10" className="mt-2 shrink-0">
          <path d="M1 1 H13 L7 9 Z" fill="var(--lamp)" />
        </svg>
        <span
          className="mt-1 w-[38px] flex-1 rounded-lg border-[1.5px] border-[color:var(--lamp)] bg-lamp-soft"
          style={{ boxShadow: "0 0 22px -6px var(--lamp), inset 0 0 12px -6px var(--lamp)" }}
        />
      </div>
    </div>
  );
}
