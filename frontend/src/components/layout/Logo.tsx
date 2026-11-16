/** Two states and a transition: the smallest interesting automaton, drawn as the logo. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="9" cy="16" r="6" fill="none" stroke="var(--ink-2)" strokeWidth="1.8" />
      <circle cx="23" cy="16" r="6" fill="none" stroke="var(--lamp)" strokeWidth="1.8" />
      <circle cx="23" cy="16" r="3.4" fill="none" stroke="var(--lamp)" strokeWidth="1.4" />
      <path d="M13.6 12.4 Q16 9.4 18.4 12.4" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" />
      <path d="M17.2 11.1 L18.6 12.6 L16.7 13" fill="none" stroke="var(--ink-2)" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
