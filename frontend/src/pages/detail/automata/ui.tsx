import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw, SkipForward, StepBack, StepForward } from "lucide-react";
import DotGrid from "@/components/reactbits/DotGrid";
import { Segmented } from "@/components/ui/primitives";
import { layoutGraph, toGraphModel } from "@/components/graph/layout";
import { useThemeColors } from "@/lib/theme";
import { showString } from "@/lib/meta";
import type { AutomatonPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ media query
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Content width of an element, kept current with a ResizeObserver. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Same radius rule as AutomatonGraph, so callers can size the box before it renders. */
export function graphRadius(n: number): number {
  return n > 24 ? 17 : n > 12 ? 20 : 23;
}

/** AutomatonGraph's radius, widened when state names are long ("{D,E,L,M}") so labels stay inside their circles. */
export function stateRadius(a: AutomatonPayload): number {
  const base = graphRadius(a.states.length);
  const longest = a.states.reduce((m, s) => Math.max(m, Math.min(s.length, 9)), 0);
  return longest <= 5 ? base : Math.max(base, Math.ceil(longest * 3 + 5));
}

export function useGraphBox(automaton: AutomatonPayload, rankdir: "LR" | "TB") {
  return useMemo(() => {
    const l = layoutGraph(toGraphModel(automaton), { rankdir, r: stateRadius(automaton) });
    return { width: l.width, height: l.height };
  }, [automaton, rankdir]);
}

/** Starts a player the first time its section is well inside the viewport (not with reduced motion). */
export function useAutoPlayOnView(play: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduce = useReducedMotion();
  const started = useRef(false);
  useEffect(() => {
    if (!inView || reduce || started.current) return;
    started.current = true;
    const t = window.setTimeout(play, 450);
    return () => window.clearTimeout(t);
  }, [inView, reduce, play]);
  return ref;
}

// ------------------------------------------------------------------ scroll reveal
export function Reveal({ children, className, delay = 0, y = 28 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.75, ease: [0.2, 0.7, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

export function Chapter({
  id,
  title,
  lede,
  children,
  className,
  aside,
}: {
  id: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("scroll-mt-28", className)}>
      <Reveal className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="max-w-3xl">
          <h2 id={id} className="font-display text-[34px] font-semibold leading-[1.05] text-ink md:text-[44px]">
            {title}
          </h2>
          {lede && <div className="mt-4 text-lg leading-relaxed text-ink-2">{lede}</div>}
        </div>
        {aside}
      </Reveal>
      <div className="mt-10">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ blueprint stage (one WebGL background)
/**
 * The drafting surface the machine sits on. Behind it runs React Bits' DotGrid: dots that the
 * cursor pushes around and that glow lamp-amber near it. Mounted when the stage nears the
 * viewport, paused when it leaves; reduced motion gets the static drafting grid instead.
 */
export function BlueprintStage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "240px 0px 240px 0px" });
  const reduce = useReducedMotion();
  const colors = useThemeColors();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (near) setMounted(true);
  }, [near]);
  return (
    <div ref={ref} className={cn("relative isolate overflow-hidden rounded-[28px] border border-line bg-panel/40", className)}>
      {reduce || !mounted ? (
        <div aria-hidden className="grid-paper pointer-events-none absolute inset-0 -z-10 opacity-80" />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <DotGrid
            dotSize={2.2}
            gap={20}
            baseColor={colors.line}
            activeColor={colors.lamp}
            proximity={150}
            strength={0.8}
            glow={0.7}
            opacity={0.42}
            fade={0.5}
            shockRadius={380}
            shockStrength={4}
            paused={!near}
          />
        </div>
      )}
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ notation legend
export function NotationLegend({ hasTrap, epsilon, className }: { hasTrap?: boolean; epsilon?: boolean; className?: string }) {
  const item = "inline-flex items-center gap-1.5";
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2", className)} aria-label="Notation">
      <li className={item}>
        <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden>
          <line x1="1" y1="6" x2="20" y2="6" stroke="var(--ink-2)" strokeWidth="1.6" />
          <path d="M18 2 L25 6 L18 10 z" fill="var(--ink-2)" />
        </svg>
        start
      </li>
      <li className={item}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <circle cx="9" cy="9" r="8" fill="var(--state-fill)" stroke="var(--ink-2)" strokeWidth="1.4" />
          <circle cx="9" cy="9" r="5" fill="none" stroke="var(--ink-2)" strokeWidth="1.2" />
        </svg>
        accepting
      </li>
      {hasTrap && (
        <li className={item}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden opacity="0.55">
            <circle cx="9" cy="9" r="8" fill="var(--state-fill)" stroke="var(--ink-2)" strokeWidth="1.4" />
          </svg>
          trap (faded)
        </li>
      )}
      {epsilon && (
        <li className={item}>
          <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden>
            <line x1="1" y1="6" x2="24" y2="6" stroke="var(--ink-2)" strokeWidth="1.6" strokeDasharray="4 3" />
          </svg>
          ε-move
        </li>
      )}
      <li className={item}>
        <span className="relative grid h-[18px] w-[18px] place-items-center" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-lamp opacity-40 blur-[3px]" />
          <span className="relative h-3 w-3 rounded-full border-2 border-[color:var(--lamp)] bg-[color:var(--state-fill)]" />
        </span>
        read head
      </li>
    </ul>
  );
}

// ------------------------------------------------------------------ playback controls
export interface PlayerLike {
  index: number;
  playing: boolean;
  done: boolean;
  stepMs: number;
  setStepMs: (ms: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  restart: () => void;
  jumpToEnd: () => void;
  seek: (i: number) => void;
}

const SPEEDS = [
  { value: "1100", label: "Slow" },
  { value: "700", label: "Normal" },
  { value: "450", label: "Fast" },
] as const;

type SpeedValue = (typeof SPEEDS)[number]["value"];

function IconButton({ label, onClick, disabled, children, primary }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid place-items-center rounded-full transition-[background,color,transform] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35",
        primary ? "h-11 w-11 bg-lamp text-ink hover:brightness-110 dark:text-bg" : "h-9 w-9 text-ink-2 hover:bg-panel-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Restart / back / play / forward / end, a scrubber and the speed. `total` = number of steps. */
export function PlayerBar({
  player,
  total,
  stepLabel = "Step",
  endLabel,
  name,
  className,
  compact,
}: {
  player: PlayerLike;
  total: number;
  stepLabel?: string;
  /** Accessible name of the skip-to-end button. */
  endLabel?: string;
  /** What is being played, for the group's accessible name and the play button. */
  name: string;
  className?: string;
  compact?: boolean;
}) {
  const index = Math.max(-1, Math.min(player.index, total - 1));
  const speed = (SPEEDS.find((s) => Number(s.value) === player.stepMs)?.value ?? "700") as SpeedValue;
  const step = stepLabel.toLowerCase();
  const playLabel = `${player.playing ? "Pause" : player.done && total > 0 ? "Replay" : "Play"} the ${name}`;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
      <div className="flex items-center gap-1" role="group" aria-label={`Playback of the ${name}`}>
        <IconButton label={`Replay the ${name} from the start`} onClick={player.restart} disabled={total === 0}>
          <RotateCcw size={16} />
        </IconButton>
        <IconButton label={`Previous ${step}`} onClick={player.prev} disabled={index <= -1}>
          <StepBack size={17} />
        </IconButton>
        <IconButton label={playLabel} onClick={player.toggle} disabled={total === 0} primary>
          {player.playing ? <Pause size={18} /> : <Play size={18} className="translate-x-[1px]" />}
        </IconButton>
        <IconButton label={`Next ${step}`} onClick={player.next} disabled={index >= total - 1}>
          <StepForward size={17} />
        </IconButton>
        <IconButton label={endLabel ?? `Skip to the last ${step}`} onClick={player.jumpToEnd} disabled={index >= total - 1}>
          <SkipForward size={17} />
        </IconButton>
      </div>
      {total > 0 && (
        <label className={cn("flex min-w-[150px] flex-1 items-center gap-3", compact && "min-w-[120px]")}>
          <span className="sr-only">{stepLabel}</span>
          <input
            type="range"
            min={-1}
            max={total - 1}
            step={1}
            value={index}
            onChange={(e) => player.seek(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[color:var(--lamp)]"
            aria-valuetext={index < 0 ? "Before the first step" : `${stepLabel} ${index + 1} of ${total}`}
          />
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted">
            {index + 1}/{total}
          </span>
        </label>
      )}
      <Segmented<SpeedValue>
        label={`Speed of the ${name}`}
        value={speed}
        onChange={(v) => player.setStepMs(Number(v))}
        options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
        className="text-xs [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-xs"
      />
    </div>
  );
}

// ------------------------------------------------------------------ chips
export function StringChip({
  value,
  onClick,
  tone = "neutral",
  title,
  active,
}: {
  value: string;
  onClick: () => void;
  tone?: "accept" | "reject" | "lamp" | "neutral";
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "max-w-full break-all rounded-lg border px-2.5 py-1 text-left font-mono text-sm leading-snug transition-colors",
        tone === "accept" && "border-[color:var(--accept)]/35 text-accept hover:bg-accept-soft",
        tone === "reject" && "border-[color:var(--reject)]/35 text-reject hover:bg-reject-soft",
        tone === "lamp" && "border-[color:var(--lamp)]/45 text-lamp hover:bg-lamp-soft",
        tone === "neutral" && "border-line text-ink hover:bg-panel-2",
        active && "ring-2 ring-[color:var(--lamp)]/60",
      )}
    >
      {showString(value)}
    </button>
  );
}

export function StatePill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "lamp" | "accept" | "reject" | "muted"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[13px] leading-tight",
        tone === "neutral" && "border-line bg-panel-2/60 text-ink",
        tone === "lamp" && "border-[color:var(--lamp)]/60 bg-lamp-soft text-ink",
        tone === "accept" && "border-[color:var(--accept)]/50 bg-accept-soft text-ink",
        tone === "reject" && "border-[color:var(--reject)]/50 bg-reject-soft text-ink",
        tone === "muted" && "border-line text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Thin horizontal meter (0..1) that fills when scrolled into view. */
export function Meter({ value, color = "var(--ink-2)", label, className }: { value: number | null | undefined; color?: string; label: string; className?: string }) {
  const reduce = useReducedMotion();
  const v = value === null || value === undefined || Number.isNaN(value) ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-panel-2", className)} role="img" aria-label={label}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={reduce ? { width: `${v * 100}%` } : { width: "0%" }}
        whileInView={{ width: `${v * 100}%` }}
        viewport={{ once: true }}
        transition={reduce ? { duration: 0 } : { duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  );
}
