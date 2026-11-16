import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * Plain-language findings that light up one at a time as they cross the middle of the
 * screen (scroll-linked, like Apple's reading highlight). Static with reduced motion.
 */
export function Insights({ items }: { items: { id: string; text: ReactNode }[] }) {
  return (
    <ol className="space-y-[18svh] py-[12svh]">
      {items.map((it) => (
        <Statement key={it.id}>{it.text}</Statement>
      ))}
    </ol>
  );
}

function Statement({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.92", "start 0.5"] });
  const opacity = useTransform(scrollYProgress, [0, 1], [0.14, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [36, 0]);
  const blur = useTransform(scrollYProgress, [0, 0.7, 1], [5, 1, 0], { clamp: true });
  const filter = useTransform(blur, (b) => `blur(${b.toFixed(2)}px)`);
  return (
    <motion.li
      ref={ref}
      style={reduce ? undefined : { opacity, y, filter }}
      className="max-w-4xl font-display text-[clamp(1.6rem,4.2vw,3.4rem)] font-semibold leading-[1.1] tracking-[-0.015em] text-ink"
    >
      {children}
    </motion.li>
  );
}

/** A number inside a statement: the lamp marks the figure the sentence turns on. */
export function Hi({ children }: { children: ReactNode }) {
  return <span className="text-lamp">{children}</span>;
}
