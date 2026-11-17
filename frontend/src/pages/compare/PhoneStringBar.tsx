import { Pencil } from "lucide-react";
import { showString } from "@/lib/meta";
import { useLenis } from "@/components/layout/SmoothScroll";
import { Button } from "@/components/ui/primitives";

/**
 * Phones only: while the lanes are on screen, a compact bar under the nav keeps the string in view and
 * offers a way back to the input. It is sticky inside the lanes' container, so it appears and leaves with them.
 */
export function PhoneStringBar({ string }: { string: string }) {
  const lenis = useLenis();

  const edit = () => {
    const input = document.querySelector<HTMLInputElement>('header [data-testid="string-input"]') ?? document.querySelector<HTMLInputElement>('[data-testid="string-input"]');
    if (!input) return;
    const focus = () => input.focus({ preventScroll: true });
    if (lenis) {
      lenis.scrollTo(input, { offset: -140, duration: 0.9, onComplete: focus });
    } else {
      input.scrollIntoView({ block: "center" });
      focus();
    }
  };

  return (
    <div className="sticky top-[66px] z-30 -mx-2 mb-2 sm:hidden">
      <div className="flex items-center gap-3 rounded-xl border border-line-strong bg-[color:var(--bg)]/92 py-1.5 pl-3 pr-1.5 shadow-[var(--shadow)] backdrop-blur-xl">
        <span className="shrink-0 text-xs text-muted">String</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[15px] text-ink" title={showString(string)}>
          {showString(string)}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted">{string.length}</span>
        <Button variant="outline" size="sm" onClick={edit} className="shrink-0">
          <Pencil size={13} aria-hidden /> Edit
        </Button>
      </div>
    </div>
  );
}
