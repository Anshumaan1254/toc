import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GLOSSARY } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * A glossary term: dotted underline, definition on hover or keyboard focus (Esc closes).
 * <Term k="dfa">DFA</Term>
 */
export function Term({ k, children, className }: { k: string; children?: ReactNode; className?: string }) {
  const entry = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const id = useId();
  const closeTimer = useRef<number | null>(null);
  if (!entry) return <>{children}</>;

  const show = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 80);
  };

  return (
    <span className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "cursor-help border-b border-dotted border-current/60 bg-transparent p-0 font-[inherit] text-[inherit] leading-[inherit]",
          className,
        )}
      >
        {children ?? entry.term}
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-line bg-panel p-3 text-left text-sm font-normal normal-case leading-snug tracking-normal text-ink shadow-[var(--shadow)]"
          >
            <span className="mb-1 block font-display text-[15px] font-semibold text-ink">{entry.term}</span>
            <span className="block text-ink-2">{entry.definition}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
