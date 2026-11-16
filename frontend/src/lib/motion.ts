/** Motion tokens (design direction section 2). CSS twins: --ease-draw, --ease-move, --ease-exit, --dur-*. */
export const EASE_DRAW = [0.22, 1, 0.36, 1] as const; // entrances, line drawing, text reveals (GSAP: "power4.out")
export const EASE_MOVE = [0.65, 0, 0.35, 1] as const; // anything travelling from A to B (GSAP: "power2.inOut")
export const EASE_EXIT = [0.4, 0, 1, 1] as const; // exits only, shorter than the entrance (GSAP: "power2.in")

export const STAMP_SPRING = { type: "spring", stiffness: 520, damping: 24, mass: 0.9 } as const;
export const SETTLE_SPRING = { type: "spring", stiffness: 220, damping: 28 } as const;

/** Durations in seconds (Motion) - multiply by 1000 for ms. */
export const DUR = { micro: 0.14, ui: 0.26, reveal: 0.7, stage: 1.05 } as const;

/** Trace playback: ~420 ms token travel + ~230 ms dwell. */
export const STEP_MS = 650;
export const TOKEN_MS = 420;

/** Stagger helpers: never let a sequence exceed 600 ms in total. */
export function stagger(index: number, count: number, perItem = 0.06, cap = 0.6): number {
  const step = count > 1 ? Math.min(perItem, cap / (count - 1)) : 0;
  return index * step;
}
