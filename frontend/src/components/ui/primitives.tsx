import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ Button
type ButtonVariant = "primary" | "outline" | "ghost" | "quiet";
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; loading?: boolean }
>(function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background,color,border-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-5 text-[15px]",
        size === "lg" && "h-12 px-7 text-base",
        variant === "primary" && "bg-lamp text-[#1a1203] hover:brightness-110",
        variant === "outline" && "border border-line-strong bg-transparent text-ink hover:border-ink-2 hover:bg-panel-2/60",
        variant === "ghost" && "bg-transparent text-ink-2 hover:bg-panel-2/70 hover:text-ink",
        variant === "quiet" && "bg-panel-2 text-ink hover:bg-panel-2/70",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Badge
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accept" | "reject" | "lamp" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-panel-2 text-ink-2",
        tone === "accept" && "bg-accept-soft text-accept",
        tone === "reject" && "bg-reject-soft text-reject",
        tone === "lamp" && "bg-lamp-soft text-lamp",
        tone === "outline" && "border border-line text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Panel
export function Panel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-line bg-panel/85 shadow-[var(--shadow)] backdrop-blur-sm", className)} {...props}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ Tabs (roving focus, arrow keys)
export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}
export function Tabs({ items, initial, className, label }: { items: TabItem[]; initial?: string; className?: string; label: string }) {
  const enabled = items.filter((t) => !t.disabled);
  const [active, setActive] = useState(initial && enabled.some((t) => t.id === initial) ? initial : enabled[0]?.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const base = useId();
  const onKey = (e: KeyboardEvent) => {
    const i = enabled.findIndex((t) => t.id === active);
    let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % enabled.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = enabled.length - 1;
    else return;
    e.preventDefault();
    setActive(enabled[j].id);
    refs.current[enabled[j].id]?.focus();
  };
  const current = items.find((t) => t.id === active);
  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line" onKeyDown={onKey}>
        {items.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            disabled={t.disabled}
            onClick={() => setActive(t.id)}
            className={cn(
              "relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40",
              active === t.id ? "text-ink" : "text-muted hover:text-ink-2",
            )}
          >
            {t.label}
            {active === t.id && <motion.span layoutId={`${base}-underline`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-lamp" />}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel-${active}`} aria-labelledby={`${base}-tab-${active}`} className="pt-5" tabIndex={0}>
        {current?.content}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Segmented control
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-full border border-line bg-panel-2/50 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "text-ink" : "text-muted hover:text-ink-2",
          )}
        >
          {value === o.value && <motion.span layoutId={`${id}-seg`} className="absolute inset-0 rounded-full bg-panel shadow-[var(--shadow)]" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ StringInput
/**
 * A string over a fixed alphabet. Invalid symbols are reported inline; a keypad of the
 * alphabet's symbols helps on touch devices. Empty input = ε. Enter submits.
 */
export function StringInput({
  value,
  onChange,
  onSubmit,
  alphabet,
  maxLength = 200,
  submitLabel = "Run",
  loading,
  autoFocus,
  label = "Input string",
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  alphabet: string[];
  maxLength?: number;
  submitLabel?: string;
  loading?: boolean;
  autoFocus?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const invalid = [...new Set([...value].filter((c) => !alphabet.includes(c)))];
  const ok = invalid.length === 0;
  const insert = (sym: string) => {
    onChange((value + sym).slice(0, maxLength));
    inputRef.current?.focus();
  };
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">
        {label} <span className="font-normal text-muted">over {"{"}{alphabet.join(", ")}{"}"} · empty = ε</span>
      </label>
      <div className="flex flex-wrap items-stretch gap-2">
        <input
          ref={inputRef}
          id={id}
          data-testid="string-input"
          value={value}
          autoFocus={autoFocus}
          maxLength={maxLength}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!ok}
          aria-describedby={`${id}-hint`}
          placeholder={placeholder ?? `e.g. ${alphabet.join("").repeat(2)}`}
          onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ok && !loading) onSubmit();
          }}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-xl border bg-panel px-3.5 font-mono text-lg tracking-wider text-ink outline-none transition-colors placeholder:text-muted/60",
            ok ? "border-line-strong focus:border-[color:var(--lamp)]" : "border-[color:var(--reject)]",
          )}
        />
        <div className="flex gap-1" role="group" aria-label="Insert a symbol">
          {alphabet.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => insert(sym)}
              className="h-11 w-10 rounded-xl border border-line bg-panel-2/60 font-mono text-lg text-ink hover:border-line-strong"
              aria-label={`Append ${sym}`}
            >
              {sym}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="h-11 rounded-xl border border-line px-3 text-sm text-muted hover:text-ink"
          >
            Clear
          </button>
        </div>
        <Button onClick={onSubmit} disabled={!ok} loading={loading} className="h-11" data-testid="string-submit">
          {submitLabel}
        </Button>
      </div>
      <p id={`${id}-hint`} className={cn("min-h-5 text-sm", ok ? "text-muted" : "text-reject")} aria-live="polite">
        {ok
          ? `${value.length} symbol${value.length === 1 ? "" : "s"}${value.length === 0 ? " (the empty string ε)" : ""}`
          : `${invalid.map((c) => `“${c}”`).join(", ")} ${invalid.length === 1 ? "is" : "are"} not in the alphabet {${alphabet.join(", ")}}.`}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Verdict stamp
/**
 * The rubber-stamp verdict. `accepted` drives the default ACCEPTED / REJECTED stamp; `label` + `tone`
 * stamp anything else ("exact", "ground truth: rejected"). Stamps are the one place capitals are used.
 */
export function VerdictStamp({
  accepted,
  label,
  tone,
  className,
  size = "md",
}: {
  accepted: boolean | null;
  label?: string;
  tone?: "accept" | "reject" | "ink";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const reduce = useReducedMotion();
  const visible = accepted !== null || !!label;
  const text = label ?? (accepted ? "accepted" : "rejected");
  const t = tone ?? (accepted ? "accept" : "reject");
  return (
    <div aria-live="polite" className={className}>
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={`${text}-${t}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.6, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -6 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={reduce ? { duration: 0.1 } : { type: "spring", stiffness: 520, damping: 24, mass: 0.9 }}
            className={cn(
              "inline-block rounded-lg border-[3px] border-double font-mono font-semibold uppercase tracking-[0.18em]",
              size === "lg" ? "px-4 py-1.5 text-2xl" : size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-4 py-1.5 text-lg",
              t === "accept" && "border-[color:var(--accept)] text-accept",
              t === "reject" && "border-[color:var(--reject)] text-reject",
              t === "ink" && "border-[color:var(--ink-2)] text-ink-2",
            )}
            role="status"
            data-testid="verdict"
            data-verdict={accepted === null ? undefined : accepted ? "accepted" : "rejected"}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ Stat
export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="t-stat text-ink">{value}</div>
      <div className="mt-1.5 text-sm text-ink-2">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Probability gauge (semi-circle)
export function Gauge({ value, className, label = "P(accept)" }: { value: number | null; className?: string; label?: string }) {
  const reduce = useReducedMotion();
  const v = value ?? 0;
  const angle = -90 + v * 180;
  const color = value === null ? "var(--muted)" : v >= 0.5 ? "var(--accept)" : "var(--reject)";
  return (
    <figure className={cn("flex flex-col items-center", className)} aria-label={`${label} ${value === null ? "not computed" : (v * 100).toFixed(1) + "%"}`}>
      <svg viewBox="0 0 200 116" className="w-full max-w-[240px]">
        <path d="M14 104 A86 86 0 0 1 186 104" fill="none" stroke="var(--panel-2)" strokeWidth={14} strokeLinecap="round" />
        <motion.path
          d="M14 104 A86 86 0 0 1 186 104"
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: v }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
        <line x1="100" y1="12" x2="100" y2="26" stroke="var(--muted)" strokeWidth={2} />
        <motion.g initial={{ rotate: -90 }} animate={{ rotate: angle }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 14 }} style={{ transformOrigin: "100px 104px", transformBox: "view-box" }}>
          <line x1="100" y1="104" x2="100" y2="34" stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
        </motion.g>
        <circle cx="100" cy="104" r="7" fill="var(--ink)" />
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className="font-display text-3xl font-semibold" style={{ color }}>
          {value === null ? "–" : `${(v * 100).toFixed(1)}%`}
        </span>
        <span className="block text-xs text-muted">{label} · threshold 50%</span>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ Loading / error / empty
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-panel-2/70", className)} aria-hidden />;
}

export function LoadingBlock({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-10 text-ink-2", className)} role="status">
      <Loader2 className="animate-spin" size={18} aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-start gap-3 rounded-xl border border-[color:var(--reject)]/40 bg-reject-soft p-4 text-ink", className)}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-reject" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{children}</kbd>;
}
