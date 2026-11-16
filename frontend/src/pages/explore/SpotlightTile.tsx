/**
 * Adapted from React Bits' SpotlightCard (https://reactbits.dev/r/SpotlightCard-TS-TW.json,
 * MIT + Commons Clause; the original lives untouched in src/components/reactbits/SpotlightCard.tsx).
 *
 * Changes for the explorer: the root is a react-router <Link> (so the whole tile is one link that
 * works with the keyboard and middle-click), it is drawn with the blueprint tokens (panel surface,
 * hairline border) instead of the fixed #111 surface, and the beam / grain / ambient options are
 * gone. The pointer-following light, proximity falloff, focus tracking and press flare are the
 * original's, including its requestAnimationFrame loop that sleeps once the light has settled.
 */
import { useEffect, useRef, type CSSProperties, type FocusEventHandler, type PointerEventHandler, type ReactNode } from "react";
import { Link } from "react-router";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Radial falloff as colour stops; works with CSS variables because it goes through color-mix(). */
const falloff = (color: string, softness: number) => {
  const soft = clamp(softness, 0, 1);
  const core = (1 - soft) ** 1.5 * 0.85;
  const stop = (alpha: number, at: number) =>
    `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(2)}%, transparent) ${(at * 100).toFixed(2)}%`;
  const list = [stop(1, 0)];
  for (let i = 0; i <= 14; i++) {
    const t = core + ((1 - core) * i) / 14;
    const g = (t - core) / (1 - core);
    const smooth = 1 - g * g * (3 - 2 * g);
    const glow = Math.exp(-4.6 * g * g) * (1 - g ** 6);
    list.push(stop(smooth + (glow - smooth) * soft, t));
  }
  return list.join(", ");
};

/** A one-pixel ring drawn with a mask, so a gradient can light the border. */
const RING: CSSProperties = {
  padding: 1,
  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
};

/** Coloured light reads stronger on navy than on paper. */
const STRENGTH = { dark: { fill: 1, edge: 1 }, light: { fill: 0.7, edge: 0.9 } } as const;

interface Settings {
  fill: string;
  edge: string;
  size: number;
  intensity: number;
  borderGlow: number;
  proximity: number;
  smoothing: number;
  flare: boolean;
}

export interface SpotlightTileProps {
  /** Route to open. Without it the tile renders as an inert <div> (an approach that is not available). */
  to?: string;
  spotlightColor: string;
  intensity?: number;
  spotlightSize?: number;
  softness?: number;
  borderGlow?: number;
  proximity?: number;
  smoothing?: number;
  flare?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
  onPointerEnter?: PointerEventHandler<HTMLElement>;
  onPointerLeave?: PointerEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onBlur?: FocusEventHandler<HTMLElement>;
}

export function SpotlightTile({
  to,
  spotlightColor,
  intensity = 0.2,
  spotlightSize = 260,
  softness = 0.7,
  borderGlow = 0.8,
  proximity = 70,
  smoothing = 0.3,
  flare = true,
  className,
  style,
  children,
  ...rest
}: SpotlightTileProps) {
  const { theme } = useTheme();
  const rootRef = useRef<HTMLElement | null>(null);
  const lightRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<HTMLSpanElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const strength = STRENGTH[theme];
  const settings: Settings = {
    fill: falloff(spotlightColor, softness),
    edge: falloff(spotlightColor, 1),
    size: Math.max(20, spotlightSize),
    intensity: clamp(intensity, 0, 1) * strength.fill,
    borderGlow: clamp(borderGlow, 0, 1) * strength.edge,
    proximity: Math.max(0, proximity),
    smoothing: clamp(smoothing, 0, 1),
    flare,
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Repaint when props change (colour follows the theme).
  useEffect(() => {
    wakeRef.current?.();
  });

  useEffect(() => {
    const root = rootRef.current;
    const light = lightRef.current;
    const edge = edgeRef.current;
    if (!root || !light || !edge) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const state = { x: 0, y: 0, presence: 0, flare: 0, pressed: false };
    const pointer = { x: 0, y: 0, active: false };
    const drawn = { light: "", edge: "" };
    let focus: Element | null = null;
    let raf = 0;
    let last = 0;
    let alive = true;

    const gradient = (size: number, x: number, y: number, stops: string) =>
      `radial-gradient(circle ${size.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px, ${stops})`;

    const paint = (s: Settings) => {
      const size = s.size * (1 + 0.2 * state.flare);
      const boost = 1 + 0.7 * state.flare;
      const fill = gradient(size, state.x, state.y, s.fill);
      const rim = gradient(size * 0.6, state.x, state.y, s.edge);
      if (fill !== drawn.light) {
        drawn.light = fill;
        light.style.background = fill;
      }
      if (rim !== drawn.edge) {
        drawn.edge = rim;
        edge.style.background = rim;
      }
      light.style.opacity = String(Math.min(1, state.presence * s.intensity * boost));
      edge.style.opacity = String(Math.min(1, state.presence * s.borderGlow * boost));
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const s = settingsRef.current;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const rect = root.getBoundingClientRect();
      let tx = state.x;
      let ty = state.y;
      let target = 0;
      if (focus && root.contains(focus)) {
        const box = focus.getBoundingClientRect();
        tx = box.left + box.width / 2 - rect.left;
        ty = box.top + box.height / 2 - rect.top;
        target = 1;
      } else if (pointer.active) {
        tx = pointer.x - rect.left;
        ty = pointer.y - rect.top;
        const gap = Math.hypot(Math.max(0, -tx, tx - rect.width), Math.max(0, -ty, ty - rect.height));
        if (gap === 0) target = 1;
        else if (s.proximity > 0) target = Math.max(0, 1 - gap / s.proximity) ** 2;
      }
      if (state.presence < 0.02 && target > 0) {
        state.x = tx;
        state.y = ty;
      }
      const follow = reduce || s.smoothing === 0 ? 1 : 1 - Math.exp(-dt / (0.015 + s.smoothing * 0.22));
      state.x += (tx - state.x) * follow;
      state.y += (ty - state.y) * follow;
      const fade = reduce ? 1 : 1 - Math.exp(-dt / (target > state.presence ? 0.1 : 0.32));
      state.presence += (target - state.presence) * fade;
      if (Math.abs(target - state.presence) < 0.002) state.presence = target;
      const press = state.pressed && s.flare && !reduce ? 1 : 0;
      state.flare += (press - state.flare) * (1 - Math.exp(-dt / (press ? 0.05 : 0.28)));
      if (Math.abs(press - state.flare) < 0.002) state.flare = press;
      paint(s);
      const moving = Math.abs(tx - state.x) > 0.1 || Math.abs(ty - state.y) > 0.1;
      if (moving || state.presence !== target || state.flare !== press) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (state.presence > 0 || settingsRef.current.proximity > 0 || root.contains(event.target as Node | null)) wake();
    };
    const onOut = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      pointer.active = false;
      wake();
    };
    const onDown = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      state.pressed = true;
      wake();
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") pointer.active = false;
      if (!state.pressed && event.pointerType === "mouse") return;
      state.pressed = false;
      wake();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(":focus-visible")) return;
      focus = event.target;
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (root.contains(event.relatedTarget as Node | null)) return;
      focus = null;
      wake();
    };
    const onScroll = () => {
      if (pointer.active || state.presence > 0) wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("pointerout", onOut);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("pointerout", onOut);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      wakeRef.current = null;
    };
  }, []);

  const setRoot = (el: HTMLElement | null) => {
    rootRef.current = el;
  };
  const shared = {
    className: cn(
      "group/tile relative isolate block h-full scroll-mt-40 overflow-hidden rounded-[18px] bg-panel text-left shadow-[var(--shadow)]",
      "transition-[transform,background-color] duration-300 ease-out",
      to && "hover:-translate-y-0.5",
      className,
    ),
    // Inline radius: the global :focus-visible rule would otherwise square the corners off.
    style: { borderRadius: 18, ...style },
    ...rest,
  };
  const body = (
    <>
      <span ref={lightRef} className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0" aria-hidden="true" />
      {children}
      <span className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-line" style={RING} aria-hidden="true" />
      <span ref={edgeRef} className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] opacity-0" style={RING} aria-hidden="true" />
    </>
  );

  return to ? (
    <Link ref={setRoot} to={to} {...shared}>
      {body}
    </Link>
  ) : (
    <div ref={setRoot} {...shared}>
      {body}
    </div>
  );
}
