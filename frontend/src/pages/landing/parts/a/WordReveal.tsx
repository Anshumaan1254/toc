import { useMemo, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

type Offset = NonNullable<NonNullable<Parameters<typeof useScroll>[0]>["offset"]>;

interface Token {
  word: string;
  em: boolean;
}

/** Split prose into words; words between *asterisks* are emphasized (lit in the lamp colour). */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let em = false;
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    let w = raw;
    const opens = w.startsWith("*");
    if (opens) {
      em = true;
      w = w.slice(1);
    }
    const closes = w.endsWith("*") || /\*[.,;:?!]$/.test(w);
    w = w.replace(/\*(?=[.,;:?!]?$)/, "");
    out.push({ word: w, em });
    if (closes) em = false;
  }
  return out;
}

/**
 * Scroll-linked reading of a sentence: every word starts faint and inks in as the
 * paragraph moves up the screen (the read head passing over the text).
 * Renders a real <p>; the faint layer is the accessible text, the ink layer is decoration.
 */
export function WordReveal({ text, className, offset = ["start 0.82", "end 0.5"] }: { text: string; className?: string; offset?: Offset }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const tokens = useMemo(() => tokenize(text), [text]);
  const { scrollYProgress } = useScroll({ target: ref, offset });
  return (
    <p ref={ref} className={cn("flex flex-wrap", className)}>
      {tokens.map((t, i) => (
        <Word key={i} token={t} progress={scrollYProgress} from={i / tokens.length} to={(i + 1) / tokens.length} still={!!reduce} />
      ))}
    </p>
  );
}

function Word({ token, progress, from, to, still }: { token: Token; progress: MotionValue<number>; from: number; to: number; still: boolean }) {
  const opacity = useTransform(progress, [from, to], [0, 1]);
  return (
    <span className="relative mr-[0.26em] inline-block">
      <span className={cn(token.em ? "text-lamp/25" : "text-ink/20")}>{token.word}</span>
      <motion.span aria-hidden className={cn("absolute inset-0", token.em ? "text-lamp" : "text-ink")} style={{ opacity: still ? 1 : opacity }}>
        {token.word}
      </motion.span>
    </span>
  );
}
