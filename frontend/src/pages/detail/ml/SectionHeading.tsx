import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** A section title that settles in word by word as it scrolls into view, with a plain lede under it. */
export function SectionHeading({ id, title, lede, aside, className }: { id: string; title: string; lede?: ReactNode; aside?: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const words = title.split(" ");
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-10 gap-y-5", className)}>
      <div className="max-w-3xl">
        <h2 id={id} className="font-display text-4xl font-semibold text-ink md:text-6xl">
          {words.map((w, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={reduce ? false : { opacity: 0, y: "0.35em", filter: "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -12% 0px" }}
              transition={{ duration: 0.6, delay: i * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {w}
              {i < words.length - 1 ? " " : ""}
            </motion.span>
          ))}
        </h2>
        {lede && (
          <motion.div
            className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -12% 0px" }}
            transition={{ duration: 0.6, delay: 0.15 + words.length * 0.05 }}
          >
            {lede}
          </motion.div>
        )}
      </div>
      {aside}
    </div>
  );
}
