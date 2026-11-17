import { motion, useReducedMotion } from "motion/react";

/**
 * The page header: the title and one sentence, over the still grid paper, kept short so the
 * sample editor is in the first viewport.
 */
export function LearnHeader() {
  const reduce = useReducedMotion();
  return (
    <header className="relative isolate overflow-hidden border-b border-line">
      <div className="grid-paper absolute inset-0 -z-10 opacity-60" aria-hidden />
      <div className="mx-auto max-w-6xl px-6 pb-6 pt-24 md:pb-7">
        <motion.h1
          className="font-display text-[2.5rem] font-semibold leading-[1.02] text-ink sm:text-5xl md:text-6xl"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Teach a machine from examples
        </motion.h1>
        <motion.p
          className="mt-3 max-w-5xl text-lg text-ink-2"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          Give it strings it should accept and strings it should reject. It will draw the smallest machine it can justify.
        </motion.p>
      </div>
    </header>
  );
}
